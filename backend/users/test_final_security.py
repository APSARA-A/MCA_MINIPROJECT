from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from core.testing import make_donor

class RefreshAccountSafetyTests(TestCase):
    def setUp(self):
        self.donor = make_donor()
        self.refresh = str(RefreshToken.for_user(self.donor.user))
        self.client = APIClient()

    def refresh_response(self):
        return self.client.post('/api/auth/token/refresh/', {'refresh': self.refresh}, format='json')

    def test_deleted_user_returns_safe_401(self):
        self.donor.user.delete()
        result = self.refresh_response()
        self.assertEqual(result.status_code, 401)
        self.assertNotIn('DoesNotExist', str(result.data))

    def test_inactive_user_cannot_refresh(self):
        self.donor.user.is_active = False; self.donor.user.save()
        self.assertEqual(self.refresh_response().status_code, 401)

    def test_inactive_profile_cannot_refresh(self):
        self.donor.is_active = False; self.donor.save()
        self.assertEqual(self.refresh_response().status_code, 401)

    def test_token_without_identity_cannot_refresh(self):
        self.refresh = str(RefreshToken())
        self.assertEqual(self.refresh_response().status_code, 401)
