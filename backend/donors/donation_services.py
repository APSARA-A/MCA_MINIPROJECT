"""One completed donation per unique request/donor match in this workflow.

SQLite write reservation serializes natural-key lookup and creation without
adding a new link column. Existing ambiguous records are rejected for review.
"""
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from matching.models import MedicalScreening
from matching.screening_services import WorkflowConflict, reserve_request, refresh_match, require_available
from requests_app.models import EmergencyRequest
from .models import DonationHistory


def completed_records(emergency):
    return DonationHistory.objects.filter(emergency_request=emergency, status='COMPLETED',
        donation_date__lte=timezone.localdate(), hospital_id=emergency.hospital_id)


def request_progress(emergency):
    units = completed_records(emergency).aggregate(units=Sum('units_donated'))['units'] or 0
    return {'request_id': emergency.pk, 'request_status': emergency.status, 'units_required': emergency.units_required,
            'completed_units': units, 'remaining_units': max(0, emergency.units_required-units),
            'can_fulfill': emergency.status in ('OPEN','MATCHING','DONORS_CONTACTED') and units >= emergency.units_required}


def donation_for_match(match):
    rows = list(DonationHistory.objects.filter(donor_id=match.donor_id, hospital_id=match.emergency_request.hospital_id,
        emergency_request_id=match.emergency_request_id, status='COMPLETED').order_by('donation_id')[:2])
    if len(rows) > 1:
        raise WorkflowConflict('Multiple completed records exist for this donor/request. Hospital review is required.')
    return rows[0] if rows else None


@transaction.atomic
def complete_donation(match, data):
    reserve_request(match.emergency_request, allow_fulfilled=True)
    match = refresh_match(match)
    existing = donation_for_match(match)
    group = data.get('blood_group', match.donor.blood_group)
    if group != match.donor.blood_group:
        raise WorkflowConflict('Blood group must match the donor recorded blood group.')
    if match.match_status == 'DONATED':
        if existing and (existing.donation_date, existing.units_donated, existing.blood_group) == (data['donation_date'], data['units_donated'], group):
            return match, existing, False
        raise WorkflowConflict('Donation already recorded; a retry cannot change it.')
    if match.emergency_request.status == 'FULFILLED':
        raise WorkflowConflict('A fulfilled request cannot receive a new donation.')
    require_available(match)
    record = MedicalScreening.objects.filter(match=match, screening_status='APPROVED', donor_id=match.donor_id,
        hospital_id=match.emergency_request.hospital_id).first()
    if match.match_status != 'APPROVED' or record is None:
        raise WorkflowConflict('Both the match and hospital screening must be APPROVED before completion.')
    if data['donation_date'] < timezone.localtime(record.screening_date).date():
        raise WorkflowConflict('Donation date cannot precede the recorded screening decision date.')
    if existing:
        raise WorkflowConflict('A completed donation already exists for this donor/request; review the existing record.')
    donation = DonationHistory(donor=match.donor, hospital=match.emergency_request.hospital,
        emergency_request=match.emergency_request, donation_date=data['donation_date'], blood_group=group,
        units_donated=data['units_donated'], status='COMPLETED')
    donation.full_clean()
    donation.save()
    match.match_status = 'DONATED'
    match.save(update_fields=['match_status'])
    return match, donation, True


@transaction.atomic
def fulfill_request(emergency):
    reserve_request(emergency, allow_fulfilled=True)
    emergency = EmergencyRequest.objects.get(pk=emergency.pk)
    progress = request_progress(emergency)
    if progress['completed_units'] < emergency.units_required:
        raise WorkflowConflict('Completed donation units have not met the request requirement.')
    if emergency.status != 'FULFILLED':
        emergency.status = 'FULFILLED'
        emergency.save(update_fields=['status', 'updated_at'])
    return emergency
