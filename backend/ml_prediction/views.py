from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView
from donors.models import Donor
from matching.services.distance import calculate_distance_km
from matching.services.matching_engine import donors_with_history
from matching.views import stored_matches
from requests_app.views import HospitalRequestMixin
from .serializers import PredictionQuerySerializer
from .services.features import with_donation_features
from .services.predictor import model_health, predict_donation_propensity
from .services.ranking import rank_predictions


class RequestPredictionsView(HospitalRequestMixin, APIView):
    def get(self, request, pk):
        emergency = self.own_request_or_404(pk)
        query = PredictionQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        radius, ranking = query.validated_data['radius_km'], query.validated_data['ranking']
        today = timezone.localdate()
        donor_queryset = with_donation_features(donors_with_history(Donor.objects.all(), today), today)
        records = list(emergency.matches.prefetch_related(Prefetch('donor', queryset=donor_queryset)))
        # Reuse Iteration 6's current eligibility/compatibility/history decisions.
        screening_rows = stored_matches(emergency, radius, records=records, reference_date=today)
        by_id = {row['match_id']: row for row in screening_rows}
        rows = []
        for match in records:
            row = by_id[match.pk]
            prediction = predict_donation_propensity(match.donor, today)
            row.update({key: prediction[key] for key in ('prediction_available', 'donation_probability', 'predicted_class')})
            row['unavailable_reason'] = prediction['reason']
            row['eligibility_status'] = (
                row['prescreening_outcome'] if row['eligible_for_contact'] else 'NOT_CURRENTLY_RECOMMENDED'
            )
            try:
                row['_distance'] = calculate_distance_km(emergency.latitude, emergency.longitude,
                                                         match.donor.latitude, match.donor.longitude)
            except ValueError:
                row['_distance'] = None
            rows.append(row)
        rows = rank_predictions(rows, ranking)
        for row in rows:
            row.pop('_distance', None)
        return Response({
            'request_id': emergency.pk, **model_health(),
            'reference_date': today.isoformat(), 'radius_km': radius, 'ranking': ranking,
            'total_matches': len(rows), 'predictions': rows,
            'feature_policy': 'Completed donation events through reference date; months = elapsed days / 30.4375.',
            'ranking_policy': 'Combined: current contact rules first, 5 km distance band, scored first, probability descending, exact distance, match ID. Experimental heuristic.',
        })
