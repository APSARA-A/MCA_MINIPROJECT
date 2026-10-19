"""Explicit hospital workflow; measurements never determine automatic approval."""
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import APIException

from requests_app.models import EmergencyRequest
from requests_app.workflow import ACTIVE_STATUSES
from .models import DonorRequestMatch, MedicalScreening


class WorkflowConflict(APIException):
    status_code = 409
    default_detail = 'This action is not allowed in the current workflow state.'


def reserve_request(emergency, allow_fulfilled=False):
    states = set(ACTIVE_STATUSES)
    if allow_fulfilled:
        states.add('FULFILLED')

    changed = EmergencyRequest.objects.filter(
        pk=emergency.pk,
        status__in=states,
    ).update(updated_at=F('updated_at'))

    if not changed:
        raise WorkflowConflict('The emergency request is no longer active.')


def refresh_match(match):
    return DonorRequestMatch.objects.select_related(
        'donor',
        'emergency_request__hospital',
    ).get(pk=match.pk)


def require_available(match):
    if match.donor_response != 'AVAILABLE':
        raise WorkflowConflict('An AVAILABLE donor response is required.')


@transaction.atomic
def mark_arrived(match):
    reserve_request(match.emergency_request)
    match = refresh_match(match)
    require_available(match)

    if match.match_status not in ('AVAILABLE', 'ARRIVED'):
        raise WorkflowConflict(
            'Only an AVAILABLE match can be marked ARRIVED.'
        )

    record, _ = MedicalScreening.objects.get_or_create(
        match=match,
        defaults={
            'donor': match.donor,
            'hospital': match.emergency_request.hospital,
            'screening_date': timezone.now(),
            'screening_status': 'PENDING',
        },
    )

    if (
        record.screening_status != 'PENDING'
        or record.donor_id != match.donor_id
        or record.hospital_id != match.emergency_request.hospital_id
    ):
        raise WorkflowConflict(
            'Screening is finalized or has inconsistent ownership; '
            'it cannot be overwritten.'
        )

    if match.match_status != 'ARRIVED':
        match.match_status = 'ARRIVED'
        match.save(update_fields=['match_status'])

    return match


@transaction.atomic
def start_screening(match):
    reserve_request(match.emergency_request)
    match = refresh_match(match)
    require_available(match)

    if match.match_status not in ('ARRIVED', 'SCREENING'):
        raise WorkflowConflict(
            'Mark the donor ARRIVED before starting screening.'
        )

    record, _ = MedicalScreening.objects.get_or_create(
        match=match,
        defaults={
            'donor': match.donor,
            'hospital': match.emergency_request.hospital,
            'screening_date': timezone.now(),
            'screening_status': 'PENDING',
        },
    )

    if (
        record.screening_status != 'PENDING'
        or record.donor_id != match.donor_id
        or record.hospital_id != match.emergency_request.hospital_id
    ):
        raise WorkflowConflict(
            'Screening is finalized or has inconsistent ownership; '
            'it cannot be overwritten.'
        )

    if match.match_status != 'SCREENING':
        match.match_status = 'SCREENING'
        match.save(update_fields=['match_status'])

    return match


@transaction.atomic
def decide_screening(match, data):
    reserve_request(match.emergency_request)
    match = refresh_match(match)
    require_available(match)

    record = MedicalScreening.objects.filter(match=match).first()

    if (
        match.match_status != 'SCREENING'
        or not record
        or record.screening_status != 'PENDING'
    ):
        raise WorkflowConflict(
            'Only a pending screening can receive a decision. '
            'Finalized decisions cannot be changed.'
        )

    if (
        record.donor_id != match.donor_id
        or record.hospital_id != match.emergency_request.hospital_id
    ):
        raise WorkflowConflict('Screening ownership is inconsistent.')

    for key, value in data.items():
        setattr(record, key, value)

    record.screening_date = timezone.now()
    record.full_clean()
    record.save(update_fields=[*data, 'screening_date'])

    match.match_status = record.screening_status
    match.save(update_fields=['match_status'])

    return match