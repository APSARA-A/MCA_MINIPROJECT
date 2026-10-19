from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from core.testing import make_donor, make_hospital, make_match, make_request, client_for
from donors.models import DonationHistory
from matching.models import DonorRequestMatch
from ml_prediction.services.predictor import unavailable


class PredictionAPITests(TestCase):
    def setUp(self):
        self.hospital = make_hospital(is_verified=True)
        self.emergency = make_request(hospital=self.hospital, latitude=0, longitude=0)
        self.donor = make_donor(latitude=0, longitude=Decimal('.01'))
        self.new_donor = make_donor(latitude=0, longitude=Decimal('.02'))
        self.match = make_match(request=self.emergency, donor=self.donor, distance_km=1, system_eligible=True,
            match_status='CONTACTED', donor_response='AVAILABLE', notification_status='SENT')
        make_match(request=self.emergency, donor=self.new_donor, distance_km=2, system_eligible=True)
        for days in (730, 365, 122):
            DonationHistory.objects.create(donor=self.donor, hospital=self.hospital, blood_group='O+',
                donation_date=timezone.localdate() - timedelta(days=days), status='COMPLETED')
        self.client = client_for(self.hospital.user)
        self.url = f'/api/ml/requests/{self.emergency.pk}/predictions/'

    def test_real_predictions_no_writes_or_duplicates(self):
        before = list(DonorRequestMatch.objects.values())
        req_before = self.emergency.updated_at
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['model_available'])
        self.assertEqual(response.data['ranking'], 'NEAREST')
        self.assertEqual(response.data['total_matches'], 2)
        scored, unscored = response.data['predictions']
        self.assertTrue(scored['prediction_available'])
        self.assertIsNone(unscored['donation_probability'])
        self.assertEqual(unscored['unavailable_reason'], 'INSUFFICIENT_DONATION_HISTORY')
        self.assertEqual(scored['match_status'], 'CONTACTED')
        self.client.get(self.url, {'ranking': 'COMBINED'})
        self.assertEqual(list(DonorRequestMatch.objects.values()), before)
        self.emergency.refresh_from_db()
        self.assertEqual(self.emergency.updated_at, req_before)

    def test_low_scores_do_not_exclude_or_change_eligibility(self):
        fake = {'prediction_available': True, 'donation_probability': .01, 'predicted_class': 0, 'reason': None}
        with patch('ml_prediction.views.predict_donation_propensity', return_value=fake): response = self.client.get(self.url)
        self.assertEqual(response.data['total_matches'], 2)
        self.assertTrue(all(r['eligible_for_contact'] and r['system_eligible'] for r in response.data['predictions']))
        self.assertEqual(DonorRequestMatch.objects.count(), 2)

    def test_anonymous_donor_unverified_inactive_denied(self):
        self.assertEqual(APIClient().get(self.url).status_code, 401)
        self.assertEqual(client_for(self.donor.user).get(self.url).status_code, 403)
        for hospital in (make_hospital(is_verified=False), make_hospital(is_verified=True, is_active=False)):
            self.assertEqual(client_for(hospital.user).get(self.url).status_code, 403)
        self.hospital.user.is_active = False
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_real_jwt_and_ownership(self):
        client = APIClient(); client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.hospital.user).access_token}')
        self.assertEqual(client.get(self.url).status_code, 200)
        self.assertEqual(client_for(make_hospital(is_verified=True).user).get(self.url).status_code, 404)
        self.assertEqual(self.client.get('/api/ml/requests/999999/predictions/').status_code, 404)

    def test_ineligible_and_radius_history_not_promoted(self):
        self.new_donor.is_active = False; self.new_donor.save()
        fake = {'prediction_available': True, 'donation_probability': 1., 'predicted_class': 1, 'reason': None}
        with patch('ml_prediction.views.predict_donation_propensity', return_value=fake):
            response = self.client.get(self.url, {'ranking': 'COMBINED'})
        self.assertTrue(response.data['predictions'][0]['eligible_for_contact'])
        self.assertFalse(response.data['predictions'][1]['eligible_for_contact'])
        self.assertEqual(response.data['predictions'][1]['eligibility_status'], 'NOT_CURRENTLY_RECOMMENDED')
        self.donor.longitude = Decimal('.3'); self.donor.save()
        rows = self.client.get(self.url, {'radius_km': 5}).data['predictions']
        self.assertFalse(any(row['eligible_for_contact'] for row in rows))

    def test_model_failure_null_predictions(self):
        with patch('ml_prediction.views.model_health', return_value={'model_name': 'Random Forest', 'model_available': False,
                    'unavailable_reason': 'MODEL_FILE_MISSING'}), patch('ml_prediction.views.predict_donation_propensity',
                    return_value=unavailable('MODEL_FILE_MISSING')):
            response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['model_available'])
        self.assertEqual(len(response.data['predictions']), 2)
        self.assertTrue(all(r['donation_probability'] is None for r in response.data['predictions']))

    def test_privacy_and_no_patch(self):
        self.donor.medical_condition = 'Private condition'; self.donor.save()
        response = self.client.get(self.url)
        self.assertNotIn('Private condition', str(response.data))
        for row in response.data['predictions']:
            for key in ('medical_condition', 'phone_number', 'email', 'latitude', 'longitude', 'features', '_distance'):
                self.assertNotIn(key, row)
        self.assertEqual(self.client.patch(self.url, {'match_status': 'DONATED'}, format='json').status_code, 405)

    def test_empty_matches_invalid_query(self):
        self.emergency.matches.all().delete()
        self.assertEqual(self.client.get(self.url).data['predictions'], [])
        self.assertEqual(self.client.get(self.url, {'ranking': 'INVALID'}).status_code, 400)
        self.assertEqual(self.client.get(self.url, {'radius_km': 13}).status_code, 400)

    def test_constant_query_count(self):
        self.client.get(self.url)
        for _ in range(6): make_match(request=self.emergency, donor=make_donor(latitude=0, longitude=0), system_eligible=True)
        with self.assertNumQueries(3): response = self.client.get(self.url)
        self.assertEqual(len(response.data['predictions']), 8)

    def test_terminal_history_not_recommended(self):
        self.emergency.status = 'CANCELLED'; self.emergency.save()
        rows = self.client.get(self.url).data['predictions']
        self.assertEqual(len(rows), 2)
        self.assertFalse(any(r['eligible_for_contact'] for r in rows))
