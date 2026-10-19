"""Deterministic local MVP pre-screening. This never gives medical clearance.

DonationHistory has no component field: interval checks assume whole blood.
Medical text is never interpreted for clearance; any text requires review.
"""
from math import isfinite
from django.conf import settings
from donors.models import DonationHistory
from .distance import validate_coordinates


def calculate_age(date_of_birth, reference_date):
    if date_of_birth is None or date_of_birth > reference_date:
        return None
    return reference_date.year - date_of_birth.year - (
        (reference_date.month, reference_date.day) < (date_of_birth.month, date_of_birth.day)
    )


def evaluate_donor_prescreening(donor, reference_date):
    reasons, warnings = [], []
    needs_review = False
    contact_blocked = False
    if not donor.is_active:
        reasons.append('Donor account is inactive.')
    if not donor.user.is_active:
        reasons.append('Linked user account is inactive.')
    age = calculate_age(donor.date_of_birth, reference_date)
    if age is None:
        reasons.append('A valid date of birth is required.')
    elif not settings.MATCHING_MIN_AGE <= age <= settings.MATCHING_MAX_AGE:
        reasons.append('Age is outside the configured local pre-screening range.')
    threshold = settings.MATCHING_MIN_WEIGHT_KG
    if donor.weight_kg is None:
        warnings.append('Weight is missing and must be checked by the hospital.')
        needs_review = True
    else:
        weight = float(donor.weight_kg)
        if not isfinite(weight) or weight <= 0:
            reasons.append('Recorded weight is invalid.')
        elif threshold is not None and weight < threshold:
            reasons.append('Weight is below the configured preliminary threshold.')
    # Matching query annotates this to avoid a separate query per donor.
    if hasattr(donor, 'last_completed_donation'):
        last_donation = donor.last_completed_donation
    else:
        last_donation = donor.donations.filter(
            status=DonationHistory.Status.COMPLETED, donation_date__lte=reference_date
        ).order_by('-donation_date').values_list('donation_date', flat=True).first()
    if last_donation:
        interval = settings.MATCHING_WHOLE_BLOOD_INTERVAL_DAYS.get(donor.gender)
        if interval is None:
            needs_review = contact_blocked = True
            warnings.append('The whole-blood interval policy for this donor requires hospital review.')
        elif (reference_date - last_donation).days < interval:
            reasons.append('Minimum configured whole-blood donation interval has not elapsed.')
    if donor.medical_condition and donor.medical_condition.strip():
        needs_review = contact_blocked = True
        warnings.append('Recorded medical information requires hospital review before contact.')
    else:
        needs_review = True
        warnings.append('Medical fitness has not been established; hospital screening is required.')
    try:
        validate_coordinates(donor.latitude, donor.longitude)
    except ValueError:
        reasons.append('Usable donor coordinates are required for nearby matching.')
    outcome = 'BLOCKED' if reasons else ('REVIEW_REQUIRED' if needs_review else 'PRESCREENED')
    return {
        'eligible_for_contact': not reasons and not contact_blocked,
        'system_eligible': not reasons and not contact_blocked,
        'screening_required': True,
        'outcome': outcome, 'reasons': reasons, 'warnings': warnings,
    }
