from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError
from rest_framework.test import APIClient, APITestCase

from donors.models import Donor
from hospitals.models import Hospital

User = get_user_model()

PASSWORD = "StrongPass@123"

DONOR = {
    "full_name": "Example Donor",
    "email": "donor@example.com",
    "password": PASSWORD,
    "confirm_password": PASSWORD,
    "date_of_birth": "2001-06-15",
    "gender": "FEMALE",
    "blood_group": "O+",
    "phone_number": "9876543210",
    "whatsapp_number": "9876543210",
    "address": "Kochi, Kerala",
    "weight_kg": 55,
    "medical_condition": "",
    "latitude": 9.9312328,
    "longitude": 76.2673041,
}

HOSPITAL = {
    "hospital_name": "Example Hospital",
    "registration_number": "HOSP123456",
    "email": "hospital@example.com",
    "password": PASSWORD,
    "confirm_password": PASSWORD,
    "phone_number": "9876543210",
    "address": "Kochi, Kerala",
    "latitude": 9.9312328,
    "longitude": 76.2673041,
}

REG_DONOR = "/api/auth/register/donor/"
REG_HOSPITAL = "/api/auth/register/hospital/"
LOGIN = "/api/auth/login/"
ME = "/api/auth/me/"
REFRESH = "/api/auth/token/refresh/"


class AuthTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # reset throttle counters between tests

    def register_donor(self, **overrides):
        return self.client.post(REG_DONOR, {**DONOR, **overrides}, format="json")

    def register_hospital(self, **overrides):
        return self.client.post(REG_HOSPITAL, {**HOSPITAL, **overrides}, format="json")

    def login(self, email, password=PASSWORD):
        return self.client.post(LOGIN, {"email": email, "password": password}, format="json")

    def auth_client(self, email, password=PASSWORD):
        response = self.login(email, password)
        self.assertEqual(response.status_code, 200, response.content)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return client


class DonorRegistrationTests(AuthTestCase):
    def test_valid_registration(self):
        response = self.register_donor(email="  Donor@Example.COM ")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.data["user"]["role"], "DONOR")
        self.assertNotIn("password", response.content.decode())
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        donor = Donor.objects.get()
        self.assertEqual(donor.email, "donor@example.com")
        self.assertEqual(donor.user.email, "donor@example.com")
        self.assertEqual(str(donor.latitude), "9.9312328")

    def test_password_mismatch_rejected(self):
        response = self.register_donor(confirm_password="Different@123")
        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_password", response.data)
        self.assertEqual(User.objects.count(), 0)

    def test_weak_password_rejected(self):
        response = self.register_donor(password="12345678", confirm_password="12345678")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)

    def test_duplicate_email_rejected_case_insensitively(self):
        self.assertEqual(self.register_donor().status_code, 201)
        self.assertIn("email", self.register_donor(email="DONOR@example.com").data)
        # Same email cannot be reused for a hospital either.
        response = self.register_hospital(email="donor@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.assertEqual(User.objects.count(), 1)

    def test_email_used_by_existing_django_user_rejected(self):
        User.objects.create_user("legacy", "legacy@example.com", PASSWORD)
        self.assertIn("email", self.register_donor(email="legacy@example.com").data)

    def test_invalid_blood_group_rejected(self):
        response = self.register_donor(blood_group="Z+")
        self.assertEqual(response.status_code, 400)
        self.assertIn("blood_group", response.data)

    def test_invalid_gps_rejected(self):
        for field, value in (("latitude", 91), ("longitude", 181), ("latitude", "abc")):
            response = self.register_donor(**{field: value})
            self.assertEqual(response.status_code, 400, (field, value))
            self.assertIn(field, response.data)
        self.assertEqual(User.objects.count(), 0)

    def test_single_coordinate_rejected(self):
        response = self.register_donor(longitude=None)
        self.assertEqual(response.status_code, 400)
        self.assertIn("location", response.data)

    def test_registration_without_gps_and_with_zero_coordinates(self):
        payload = {k: v for k, v in DONOR.items() if k not in ("latitude", "longitude")}
        self.assertEqual(self.client.post(REG_DONOR, payload, format="json").status_code, 201)
        donor = Donor.objects.get()
        self.assertIsNone(donor.latitude)
        response = self.register_donor(email="zero@example.com", latitude=0, longitude=0)
        self.assertEqual(response.status_code, 201, response.content)
        zero = Donor.objects.get(email="zero@example.com")
        self.assertEqual(zero.latitude, 0)
        self.assertEqual(zero.longitude, 0)

    def test_future_date_of_birth_and_bad_phone_rejected(self):
        self.assertIn("date_of_birth", self.register_donor(date_of_birth="2999-01-01").data)
        self.assertIn("phone_number", self.register_donor(phone_number="12ab").data)

    def test_long_gps_precision_is_rounded(self):
        response = self.register_donor(latitude=9.931232812345678, longitude=76.267304198765)
        self.assertEqual(response.status_code, 201, response.content)

    def test_password_is_stored_hashed(self):
        self.register_donor()
        user = User.objects.get()
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.password.startswith("pbkdf2_"))
        self.assertTrue(user.check_password(PASSWORD))
        self.assertTrue(user.username.startswith("u"))
        self.assertNotIn("donor", user.username)

    def test_failed_registration_leaves_no_partial_user(self):
        with patch.object(Donor.objects, "create", side_effect=IntegrityError("boom")):
            response = self.register_donor()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(Donor.objects.count(), 0)


class HospitalRegistrationTests(AuthTestCase):
    def test_valid_registration_defaults_to_unverified(self):
        response = self.register_hospital()
        self.assertEqual(response.status_code, 201, response.content)
        hospital = Hospital.objects.get()
        self.assertFalse(hospital.is_verified)
        self.assertTrue(hospital.is_active)
        self.assertFalse(response.data["profile"]["is_verified"])
        self.assertNotIn("access", response.data)

    def test_client_cannot_self_verify(self):
        response = self.register_hospital(is_verified=True, is_active=False)
        self.assertEqual(response.status_code, 201)
        hospital = Hospital.objects.get()
        self.assertFalse(hospital.is_verified)
        self.assertTrue(hospital.is_active)

    def test_duplicate_registration_number_rejected(self):
        self.register_hospital()
        response = self.register_hospital(email="other@example.com", registration_number="hosp123456")
        self.assertEqual(response.status_code, 400)
        self.assertIn("registration_number", response.data)
        self.assertEqual(User.objects.count(), 1)

    def test_required_fields_and_phone(self):
        response = self.client.post(REG_HOSPITAL, {"email": "x@example.com"}, format="json")
        self.assertEqual(response.status_code, 400)
        for field in ("hospital_name", "registration_number", "phone_number", "address", "password"):
            self.assertIn(field, response.data)
        self.assertIn("phone_number", self.register_hospital(phone_number="abc").data)


class LoginTests(AuthTestCase):
    def test_donor_login_returns_donor_role_and_tokens(self):
        self.register_donor()
        response = self.login("DONOR@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "DONOR")
        self.assertTrue(response.data["access"] and response.data["refresh"])
        self.assertEqual(response.data["user"]["profile"]["blood_group"], "O+")
        self.assertNotIn("medical_condition", response.data["user"]["profile"])

    def test_hospital_login_returns_role_and_verification_status(self):
        self.register_hospital()
        response = self.login("hospital@example.com")
        self.assertEqual(response.data["role"], "HOSPITAL")
        self.assertIs(response.data["user"]["profile"]["is_verified"], False)
        Hospital.objects.update(is_verified=True)
        self.assertIs(self.login("hospital@example.com").data["user"]["profile"]["is_verified"], True)

    def test_admin_login_returns_admin_role(self):
        User.objects.create_superuser("root", "admin@example.com", PASSWORD)
        response = self.login("admin@example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "ADMIN")
        self.assertIsNone(response.data["user"]["profile"])

    def test_admin_role_takes_priority_over_profiles(self):
        self.register_donor()
        User.objects.update(is_staff=True)
        self.assertEqual(self.login("donor@example.com").data["role"], "ADMIN")

    def test_client_supplied_role_is_ignored(self):
        self.register_donor()
        response = self.client.post(
            LOGIN, {"email": "donor@example.com", "password": PASSWORD, "role": "ADMIN"}, format="json"
        )
        self.assertEqual(response.data["role"], "DONOR")

    def test_wrong_password_and_unknown_email_share_one_generic_error(self):
        self.register_donor()
        wrong = self.login("donor@example.com", "WrongPass@123")
        unknown = self.login("nobody@example.com")
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong.data, unknown.data)

    def test_inactive_user_cannot_login(self):
        self.register_donor()
        User.objects.update(is_active=False)
        self.assertEqual(self.login("donor@example.com").status_code, 401)

    def test_inactive_profile_cannot_login(self):
        self.register_hospital()
        Hospital.objects.update(is_active=False)
        self.assertEqual(self.login("hospital@example.com").status_code, 403)

    def test_user_without_profile_gets_403(self):
        User.objects.create_user("plain", "plain@example.com", PASSWORD)
        self.assertEqual(self.login("plain@example.com").status_code, 403)

    def test_ambiguous_duplicate_email_cannot_login(self):
        User.objects.create_user("a", "same@example.com", PASSWORD)
        User.objects.create_user("b", "SAME@example.com", PASSWORD)
        self.assertEqual(self.login("same@example.com").status_code, 401)

    def test_login_is_throttled(self):
        for _ in range(10):
            self.login("nobody@example.com")
        self.assertEqual(self.login("nobody@example.com").status_code, 429)


class MeAndPermissionTests(AuthTestCase):
    def test_me_requires_authentication(self):
        self.assertEqual(self.client.get(ME).status_code, 401)
        bad = APIClient()
        bad.credentials(HTTP_AUTHORIZATION="Bearer not.a.token")
        self.assertEqual(bad.get(ME).status_code, 401)

    def test_me_returns_only_own_profile(self):
        self.register_donor()
        self.register_donor(email="second@example.com", full_name="Second Donor", blood_group="A-")
        first = self.auth_client("donor@example.com").get(ME).data
        second = self.auth_client("second@example.com").get(ME).data
        self.assertEqual(first["email"], "donor@example.com")
        self.assertEqual(first["profile"]["full_name"], "Example Donor")
        self.assertEqual(second["profile"]["full_name"], "Second Donor")
        self.assertEqual(first["profile"]["latitude"], "9.9312328")
        self.assertNotIn("password", str(first))

    def test_role_endpoints_enforce_roles_on_the_backend(self):
        self.register_donor()
        self.register_hospital()
        donor, hospital = self.auth_client("donor@example.com"), self.auth_client("hospital@example.com")
        self.assertEqual(donor.get("/api/donors/me/").status_code, 200)
        self.assertEqual(donor.get("/api/hospitals/me/").status_code, 403)
        self.assertEqual(hospital.get("/api/hospitals/me/").status_code, 200)
        self.assertEqual(hospital.get("/api/donors/me/").status_code, 403)
        self.assertEqual(self.client.get("/api/donors/me/").status_code, 401)
        self.assertEqual(hospital.get("/api/hospitals/me/").data["verification_status"], "PENDING")

    def test_no_endpoint_exposes_other_users_by_id(self):
        self.register_donor()
        client = self.auth_client("donor@example.com")
        for url in ("/api/donors/1/", "/api/auth/users/1/", "/api/auth/me/1/"):
            self.assertEqual(client.get(url).status_code, 404, url)

    def test_token_refresh(self):
        self.register_donor()
        refresh = self.login("donor@example.com").data["refresh"]
        response = self.client.post(REFRESH, {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(client.get(ME).status_code, 200)
        self.assertEqual(
            self.client.post(REFRESH, {"refresh": "garbage"}, format="json").status_code, 401
        )

    def test_access_token_cannot_be_used_to_refresh(self):
        self.register_donor()
        access = self.login("donor@example.com").data["access"]
        self.assertEqual(self.client.post(REFRESH, {"refresh": access}, format="json").status_code, 401)
