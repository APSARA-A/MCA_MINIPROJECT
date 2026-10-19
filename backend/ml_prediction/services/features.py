"""Donation-event features in months, not donated units.

Elapsed months = elapsed days / (365.25 / 12). Fractions are retained.
The model records feature names, but not the training code's date conversion.
This explicit approximation uses the documented months/event semantics.
"""
from math import isfinite
from django.db.models import Count, DateField, Max, Min, Q, Value
from donors.models import DonationHistory

FEATURE_NAMES = ('Recency', 'Frequency', 'Time')
DAYS_PER_MONTH = 365.25 / 12


def with_donation_features(queryset, reference_date):
    completed = Q(donations__status=DonationHistory.Status.COMPLETED,
                  donations__donation_date__lte=reference_date)
    return queryset.annotate(
        ml_completed_count=Count('donations', filter=completed),
        ml_first_completed=Min('donations__donation_date', filter=completed),
        ml_last_completed=Max('donations__donation_date', filter=completed),
        ml_history_reference_date=Value(reference_date, output_field=DateField()),
    )


def extract_donor_features(donor, reference_date):
    if getattr(donor, 'ml_history_reference_date', None) == reference_date:
        count, first, last = donor.ml_completed_count, donor.ml_first_completed, donor.ml_last_completed
    else:
        summary = donor.donations.filter(status=DonationHistory.Status.COMPLETED,
            donation_date__lte=reference_date).aggregate(
            count=Count('pk'), first=Min('donation_date'), last=Max('donation_date'))
        count, first, last = summary['count'], summary['first'], summary['last']
    if not count or first is None or last is None:
        return {'features_available': False, 'features': None, 'reason': 'INSUFFICIENT_DONATION_HISTORY'}
    features = {
        'Recency': (reference_date - last).days / DAYS_PER_MONTH,
        'Frequency': int(count),
        'Time': (reference_date - first).days / DAYS_PER_MONTH,
    }
    if any(not isfinite(value) or value < 0 for value in features.values()) or features['Recency'] > features['Time']:
        return {'features_available': False, 'features': None, 'reason': 'INVALID_DONATION_HISTORY'}
    return {'features_available': True, 'features': features, 'reason': None}
