from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from core.testing import client_for, make_donor, make_hospital
from hospitals.models import Hospital

URL = "/api/hospitals/me/"


class HospitalProfileAPITests(TestCase):
    def setUp(self):
        self.hospital = make_hospital(hospital_name="City Care", registration_number="REG-100", email="city@example.com")
        self.other = make_hospital(hospital_name="Other Hospital")
        self.client = client_for(self.hospital.user)

    def refresh(self, hospital=None):
        hospital = hospital or self.hospital
        hospital.refresh_from_db()
        return hospital

    def test_hospital_retrieves_own_profile(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["hospital_name"], "City Care")
        self.assertEqual(response.data["registration_number"], "REG-100")
        self.assertEqual(response.data["verification_status"], "PENDING")
        self.assertIs(response.data["is_verified"], False)

    def test_verification_status_reflects_database(self):
        Hospital.objects.filter(pk=self.hospital.pk).update(is_verified=True)
        response = self.client.get(URL)
        self.assertIs(response.data["is_verified"], True)
        self.assertEqual(response.data["verification_status"], "VERIFIED")

    def test_hospital_updates_permitted_fields(self):
        payload = {"phone_number": "+914841234567", "address": " 12 New Road, Kochi ", "latitude": 9.9312328123, "longitude": 76.2673041}
        response = self.client.patch(URL, payload, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        hospital = self.refresh()
        self.assertEqual(hospital.phone_number, "+914841234567")
        self.assertEqual(hospital.address, "12 New Road, Kochi")
        self.assertEqual(hospital.latitude, Decimal("9.9312328"))
        self.assertTrue(response.data["has_location"])

    def test_update_only_affects_own_hospital(self):
        self.client.patch(URL, {"address": "Changed"}, format="json")
        self.assertNotEqual(self.refresh(self.other).address, "Changed")

    def test_hospital_cannot_change_is_verified(self):
        response = self.client.patch(URL, {"is_verified": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("is_verified", response.data)
        self.assertFalse(self.refresh().is_verified)

    def test_hospital_cannot_change_registration_number_or_other_protected_fields(self):
        before = Hospital.objects.values().get(pk=self.hospital.pk)
        for field, value in {
            "registration_number": "HACKED-1",
            "hospital_name": "Renamed",
            "email": "x@example.com",
            "is_active": False,
            "user": self.other.user_id,
            "hospital_id": self.other.pk,
        }.items():
            response = self.client.patch(URL, {field: value}, format="json")
            self.assertEqual(response.status_code, 400, field)
        self.assertEqual(Hospital.objects.values().get(pk=self.hospital.pk), before)

    def test_editing_profile_keeps_verified_status(self):
        Hospital.objects.filter(pk=self.hospital.pk).update(is_verified=True)
        self.client.patch(URL, {"phone_number": "9876501234"}, format="json")
        self.assertTrue(self.refresh().is_verified)

    def test_invalid_values_rejected(self):
        for payload in (
            {"latitude": 91, "longitude": 10},
            {"latitude": 10, "longitude": -181},
            {"latitude": 10},
            {"phone_number": "12"},
            {"address": "  "},
        ):
            self.assertEqual(self.client.patch(URL, payload, format="json").status_code, 400, payload)

    def test_donor_cannot_use_hospital_endpoint(self):
        donor_client = client_for(make_donor().user)
        self.assertEqual(donor_client.get(URL).status_code, 403)
        self.assertEqual(donor_client.patch(URL, {"address": "x"}, format="json").status_code, 403)

    def test_anonymous_gets_401(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get(URL).status_code, 401)
        self.assertEqual(anonymous.patch(URL, {"address": "x"}, format="json").status_code, 401)
