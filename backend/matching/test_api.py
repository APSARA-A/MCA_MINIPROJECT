from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from core.testing import make_donor, make_hospital, make_request, make_match, client_for
from donors.models import DonationHistory
from matching.models import DonorRequestMatch


class MatchingAPITests(TestCase):
    def setUp(self):
        self.hospital = make_hospital(is_verified=True)
        self.emergency = make_request(hospital=self.hospital, latitude=0, longitude=0)
        self.donor = make_donor(latitude=0, longitude=Decimal('.01'))
        self.client = client_for(self.hospital.user)
        self.base = f'/api/matching/requests/{self.emergency.pk}/'

    def generate(self, client=None, radius=25):
        return (client or self.client).post(self.base + 'generate/', {'radius_km': radius}, format='json')

    def test_generate_and_repeat(self):
        response = self.generate()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_matches'], 1)
        self.assertEqual(response.data['request_status'], 'MATCHING')
        row = response.data['matches'][0]
        self.assertEqual(row['match_status'], 'IDENTIFIED')
        self.assertEqual(row['donor_response'], 'PENDING')
        self.assertEqual(row['notification_status'], 'PENDING')
        self.assertTrue(row['screening_required'])
        self.generate()
        self.assertEqual(DonorRequestMatch.objects.count(), 1)

    def test_real_jwt(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(self.hospital.user).access_token}')
        self.assertEqual(self.generate(client).status_code, 200)

    def test_advanced_workflow_and_responses_preserved(self):
        for state in ('CONTACTED', 'AVAILABLE', 'ARRIVED', 'SCREENING', 'APPROVED', 'DONATED', 'CANCELLED', 'REJECTED', 'UNAVAILABLE'):
            with self.subTest(state=state):
                DonorRequestMatch.objects.all().delete()
                match = make_match(request=self.emergency, donor=self.donor,
                    match_status=state, donor_response='AVAILABLE', notification_status='SENT',
                    responded_at=timezone.now(), distance_km=Decimal('2.00'))
                old_time = match.responded_at
                self.assertEqual(self.generate().status_code, 200)
                match.refresh_from_db()
                self.assertEqual(match.match_status, state)
                self.assertEqual(match.donor_response, 'AVAILABLE')
                self.assertEqual(match.notification_status, 'SENT')
                self.assertEqual(match.responded_at, old_time)
                self.assertEqual(match.distance_km, Decimal('2.00'))

    def test_response_or_notification_protects_initial_record(self):
        match = make_match(request=self.emergency, donor=self.donor,
                           notification_status='SENT', distance_km=Decimal('3.00'))
        self.generate()
        match.refresh_from_db()
        self.assertEqual(match.distance_km, Decimal('3.00'))

    def test_ineligible_existing_history_flagged_not_deleted(self):
        self.generate()
        DonationHistory.objects.create(donor=self.donor, hospital=self.hospital,
            donation_date=timezone.localdate(), status='COMPLETED', blood_group='O+')
        response = self.generate()
        self.assertEqual(response.data['total_matches'], 0)
        self.assertEqual(len(response.data['historical_matches']), 1)
        self.assertFalse(response.data['historical_matches'][0]['system_eligible'])
        self.assertTrue(response.data['historical_matches'][0]['current_issues'])
        self.assertEqual(DonorRequestMatch.objects.count(), 1)
        self.assertEqual(DonorRequestMatch.objects.get().match_status, 'IDENTIFIED')

    def test_radius_history_and_review_candidates(self):
        self.donor.longitude = Decimal('.3')
        self.donor.save()
        self.assertEqual(self.generate(radius=50).data['total_matches'], 1)
        self.assertEqual(self.generate(radius=5).data['total_matches'], 0)
        self.assertEqual(DonorRequestMatch.objects.count(), 1)
        self.donor.medical_condition = 'Requires private review'
        self.donor.save()
        self.assertEqual(len(self.generate(radius=50).data['review_candidates']), 1)

    def test_medical_review_does_not_create_match(self):
        self.donor.medical_condition = 'Private condition'
        self.donor.save()
        response = self.generate()
        self.assertEqual(response.data['total_matches'], 0)
        self.assertEqual(len(response.data['review_candidates']), 1)
        self.assertEqual(DonorRequestMatch.objects.count(), 0)
        self.assertNotIn('Private condition', str(response.data))

    def test_terminal_requests_rejected(self):
        for state in ('CANCELLED', 'FULFILLED', 'CLOSED'):
            self.emergency.status = state
            self.emergency.save()
            self.assertEqual(self.generate().status_code, 409)
        self.assertEqual(DonorRequestMatch.objects.count(), 0)

    def test_advanced_request_status_not_reset(self):
        self.emergency.status = 'DONORS_CONTACTED'
        self.emergency.save()
        self.assertEqual(self.generate().status_code, 409)
        self.emergency.refresh_from_db()
        self.assertEqual(self.emergency.status, 'DONORS_CONTACTED')

    def test_empty_matches_status_coherent(self):
        self.donor.delete()
        response = self.generate()
        self.assertEqual(response.data['matches'], [])
        self.assertEqual(response.data['request_status'], 'MATCHING')
        self.assertIn('No contactable', response.data['message'])

    def test_validation_failure_preserves_status(self):
        self.emergency.latitude = None
        self.emergency.save()
        self.assertEqual(self.generate().status_code, 400)
        self.emergency.refresh_from_db()
        self.assertEqual(self.emergency.status, 'OPEN')
        self.assertEqual(DonorRequestMatch.objects.count(), 0)

    def test_invalid_radius(self):
        for radius in (0, 26, -5, True, None, 'bad', 25.5):
            self.assertEqual(self.generate(radius=radius).status_code, 400, radius)
        self.assertEqual(self.client.get(self.base, {'radius_km': 13}).status_code, 400)

    def test_anonymous_and_donor_denied(self):
        for client in (APIClient(), client_for(self.donor.user)):
            self.assertIn(self.generate(client).status_code, (401, 403))
            self.assertIn(client.get(self.base).status_code, (401, 403))

    def test_unverified_inactive_hospital_and_user_denied(self):
        for hospital in (make_hospital(is_verified=False), make_hospital(is_verified=True, is_active=False)):
            client = client_for(hospital.user)
            self.assertEqual(self.generate(client).status_code, 403)
            self.assertEqual(client.get(self.base).status_code, 403)
        self.hospital.user.is_active = False
        self.hospital.user.save()
        self.assertEqual(self.generate().status_code, 403)

    def test_other_hospital_and_nonexistent_request_404(self):
        other_client = client_for(make_hospital(is_verified=True).user)
        self.assertEqual(self.generate(other_client).status_code, 404)
        self.assertEqual(other_client.get(self.base).status_code, 404)
        self.assertEqual(self.client.get('/api/matching/requests/999999/').status_code, 404)

    def test_list_sort_and_privacy(self):
        far = make_donor(latitude=0, longitude=Decimal('.1'), full_name='Far donor')
        self.generate()
        response = self.client.get(self.base)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['donor_name'] for row in response.data['matches']], [self.donor.full_name, far.full_name])
        for row in response.data['matches']:
            for key in ('phone_number', 'email', 'medical_condition', 'latitude', 'longitude', 'propensity_score'):
                self.assertNotIn(key, row)
        self.assertEqual(self.client.patch(self.base, {'match_status': 'DONATED'}, format='json').status_code, 405)

    def test_empty_list(self):
        self.assertEqual(self.client.get(self.base).data['matches'], [])

    def test_terminal_history_is_not_recommended(self):
        self.generate()
        self.emergency.status = 'CANCELLED'
        self.emergency.save()
        row = self.client.get(self.base).data['matches'][0]
        self.assertFalse(row['eligible_for_contact'])

    def test_current_location_and_group_changes_flagged(self):
        self.generate()
        self.donor.blood_group = 'AB+'
        self.donor.latitude = None
        self.donor.save()
        row = self.client.get(self.base).data['matches'][0]
        self.assertFalse(row['eligible_for_contact'])
        self.assertIsNone(row['distance_km'])
