from decimal import Decimal
from django.db import transaction
from django.db.models import F, Prefetch
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from donors.models import Donor
from requests_app.models import EmergencyRequest
from requests_app.workflow import ACTIVE_STATUSES as REQUEST_ACTIVE_STATUSES
from requests_app.views import HospitalRequestMixin
from .models import DonorRequestMatch
from .serializers import RadiusSerializer, candidate_data
from .services.compatibility import is_blood_compatible
from .services.distance import calculate_distance_km
from .services.eligibility import evaluate_donor_prescreening
from .services.matching_engine import ACTIVE_STATUSES, donors_with_history, find_matching_donors


def stored_matches(emergency, radius, *, records=None, reference_date=None):
    today = reference_date or timezone.localdate()
    if records is None:
        records = emergency.matches.prefetch_related(Prefetch(
            'donor', queryset=donors_with_history(Donor.objects.all(), today)))
    rows = []
    for match in records:
        donor = match.donor
        screening = evaluate_donor_prescreening(donor, today)
        issues = list(screening['reasons'])
        if not screening['eligible_for_contact'] and not issues:
            issues.append('Hospital review is required before contact.')
        if emergency.status not in REQUEST_ACTIVE_STATUSES:
            issues.append('Request is no longer active.')
        if match.match_status in ('UNAVAILABLE', 'REJECTED', 'DONATED', 'CANCELLED'):
            issues.append('Stored workflow decision excludes this match from current recommendations.')
        try:
            if not is_blood_compatible(donor.blood_group, emergency.required_blood_group):
                issues.append('Donor blood group is no longer compatible with this request.')
            distance = calculate_distance_km(emergency.latitude, emergency.longitude,
                                             donor.latitude, donor.longitude)
            if distance > radius:
                issues.append('Donor is outside the selected search radius.')
        except ValueError:
            distance = None
            issues.append('Current blood group or location data needs correction.')
        row = candidate_data(donor, distance, screening, match, issues)
        row['recorded_distance_km'] = float(match.distance_km) if match.distance_km is not None else None
        rows.append((distance if distance is not None else float('inf'), match.pk, row))
    return [row for _, _, row in sorted(rows, key=lambda item: (item[0], item[1]))]


def response_data(emergency, radius, matches, review_candidates=None, message=None):
    return {
        'request_id': emergency.pk, 'required_blood_group': emergency.required_blood_group,
        'units_required': emergency.units_required, 'urgency': emergency.urgency,
        'request_status': emergency.status, 'radius_km': radius,
        'total_matches': len(matches), 'matches': matches,
        'review_candidates': review_candidates or [],
        'message': message or ('Stored matches loaded.' if matches else 'No stored donor matches yet.'),
    }


class GenerateMatchesView(HospitalRequestMixin, APIView):
    def post(self, request, pk):
        emergency = self.own_request_or_404(pk)
        serializer = RadiusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        radius = serializer.validated_data['radius_km']
        with transaction.atomic():
            # Acquire SQLite's write reservation before reading candidates. The conditional
            # update rechecks lifecycle state; no PostgreSQL row-lock assumptions.
            changed = self.own_requests().filter(pk=pk, status__in=ACTIVE_STATUSES).update(
                updated_at=F('updated_at'))
            if not changed:
                return Response({'detail': 'Matching is only allowed for OPEN or MATCHING requests.'},
                                status=status.HTTP_409_CONFLICT)
            emergency.refresh_from_db()
            try:
                candidates = find_matching_donors(emergency, radius)
            except ValueError as exc:
                raise ValidationError({'detail': str(exc)}) from exc
            reviews = []
            for candidate in candidates:
                donor, screening = candidate['donor'], candidate['prescreening']
                if not screening['eligible_for_contact']:
                    reviews.append(candidate_data(donor, candidate['distance_km'], screening))
                    continue
                distance = Decimal(str(candidate['distance_km'])).quantize(Decimal('0.01'))
                match, created = DonorRequestMatch.objects.get_or_create(
                    emergency_request=emergency, donor=donor,
                    defaults={'distance_km': distance, 'system_eligible': True})
                # Update only untouched initial records. Never alter decisions or responses.
                if not created and match.match_status == 'IDENTIFIED' and match.donor_response == 'PENDING' and match.notification_status == 'PENDING':
                    match.distance_km, match.system_eligible = distance, True
                    match.save(update_fields=['distance_km', 'system_eligible'])
            if emergency.status == EmergencyRequest.Status.OPEN:
                emergency.status = EmergencyRequest.Status.MATCHING
                emergency.save(update_fields=['status', 'updated_at'])
            history = stored_matches(emergency, radius)
            current = [row for row in history if row['eligible_for_contact']]
            result = response_data(emergency, radius, current, reviews,
                'Nearby candidates found. Hospital screening and voluntary participation are required.'
                if current else 'No contactable donors found within this radius. Try a larger radius or review flagged candidates.')
            result['historical_matches'] = [row for row in history if not row['eligible_for_contact']]
            return Response(result)


class RequestMatchesView(HospitalRequestMixin, APIView):
    def get(self, request, pk):
        emergency = self.own_request_or_404(pk)
        serializer = RadiusSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        radius = serializer.validated_data['radius_km']
        return Response(response_data(emergency, radius, stored_matches(emergency, radius)))
