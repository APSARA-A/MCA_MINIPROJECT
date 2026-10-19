from django.db.models import Max, Q
from django.utils import timezone
from donors.models import Donor, DonationHistory
from requests_app.models import EmergencyRequest
from requests_app.workflow import MATCHABLE_STATUSES, can_create_matches
from .compatibility import get_compatible_donor_groups
from .distance import calculate_distance_km, validate_coordinates
from .eligibility import evaluate_donor_prescreening

SUPPORTED_RADII = (5, 10, 25, 50)
ACTIVE_STATUSES = MATCHABLE_STATUSES


def donors_with_history(queryset, reference_date):
    return queryset.select_related('user').annotate(last_completed_donation=Max(
        'donations__donation_date', filter=Q(donations__status=DonationHistory.Status.COMPLETED,
                                          donations__donation_date__lte=reference_date)))


def validate_radius(radius_km):
    if isinstance(radius_km, bool) or radius_km not in SUPPORTED_RADII:
        raise ValueError('Choose a radius of 5, 10, 25 or 50 km.')
    return int(radius_km)


def find_matching_donors(emergency_request, radius_km=25):
    radius_km = validate_radius(radius_km)
    if not emergency_request.pk or not EmergencyRequest.objects.filter(pk=emergency_request.pk).exists():
        raise ValueError('Emergency request does not exist.')
    if not can_create_matches(emergency_request):
        raise ValueError('Matching is only allowed for OPEN or MATCHING requests.')
    validate_coordinates(emergency_request.latitude, emergency_request.longitude)
    groups = get_compatible_donor_groups(emergency_request.required_blood_group)
    today = timezone.localdate()
    donors = donors_with_history(Donor.objects.filter(
        is_active=True, user__is_active=True, blood_group__in=groups,
        latitude__isnull=False, longitude__isnull=False), today)
    candidates = []
    for donor in donors:
        screening = evaluate_donor_prescreening(donor, today)
        if screening['reasons']:
            continue
        distance = calculate_distance_km(emergency_request.latitude, emergency_request.longitude,
                                         donor.latitude, donor.longitude)
        if distance <= radius_km:
            candidates.append({'donor': donor, 'distance_km': distance, 'prescreening': screening})
    return sorted(candidates, key=lambda candidate: (candidate['distance_km'], candidate['donor'].pk))
