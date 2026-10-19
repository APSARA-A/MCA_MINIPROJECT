from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from core.testing import client_for, make_donor, make_hospital
from donors.models import Donor

URL = "/api/donors/me/"


class DonorProfileAPITests(TestCase):
    def setUp(self):
        self.donor = make_donor(full_name="First Donor", blood_group="O+", email="first@example.com")
        self.other = make_donor(full_name="Other Donor", blood_group="A-", email="other@example.com")
        self.client = client_for(self.donor.user)

    def refresh(self, donor=None):
        donor = donor or self.donor
        donor.refresh_from_db()
        return donor

    # --- read -------------------------------------------------------------
    def test_donor_retrieves_own_profile(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["full_name"], "First Donor")
        self.assertEqual(response.data["blood_group"], "O+")
        self.assertEqual(response.data["email"], "first@example.com")
        self.assertIn("medical_condition", response.data)
        self.assertFalse(response.data["has_location"])
        self.assertNotIn("password", str(response.data))

    def test_donor_cannot_retrieve_another_donors_profile(self):
        # The donor is derived from the token; ids in the URL or query are ignored.
        response = self.client.get(URL, {"donor_id": self.other.pk, "id": self.other.pk})
        self.assertEqual(response.data["donor_id"], self.donor.pk)
        self.assertNotEqual(response.data["full_name"], "Other Donor")
        self.assertEqual(self.client.get(f"/api/donors/{self.other.pk}/").status_code, 404)
        self.assertEqual(client_for(self.other.user).get(URL).data["full_name"], "Other Donor")

    # --- update -----------------------------------------------------------
    def test_donor_updates_permitted_fields(self):
        payload = {
            "full_name": "  Renamed Donor ",
            "phone_number": "+919800011122",
            "whatsapp_number": "9800011122",
            "address": "New address, Kochi",
            "weight_kg": "62.5",
            "medical_condition": "Mild seasonal allergy",
            "latitude": 9.931232812345,
            "longitude": 76.267304198,
        }
        response = self.client.patch(URL, payload, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        donor = self.refresh()
        self.assertEqual(donor.full_name, "Renamed Donor")
        self.assertEqual(donor.phone_number, "+919800011122")
        self.assertEqual(donor.weight_kg, Decimal("62.50"))
        self.assertEqual(donor.latitude, Decimal("9.9312328"))
        self.assertEqual(donor.longitude, Decimal("76.2673042"))
        self.assertTrue(response.data["has_location"])
        self.assertEqual(response.data["medical_condition"], "Mild seasonal allergy")

    def test_partial_update_changes_only_sent_fields(self):
        self.client.patch(URL, {"address": "Only this"}, format="json")
        donor = self.refresh()
        self.assertEqual(donor.address, "Only this")
        self.assertEqual(donor.full_name, "First Donor")

    def test_update_only_affects_the_signed_in_donor(self):
        self.client.patch(URL, {"full_name": "Changed"}, format="json")
        self.assertEqual(self.refresh(self.other).full_name, "Other Donor")

    def test_weight_can_be_cleared(self):
        self.client.patch(URL, {"weight_kg": "55"}, format="json")
        response = self.client.patch(URL, {"weight_kg": None}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(self.refresh().weight_kg)

    def test_donor_cannot_modify_protected_fields(self):
        protected = {
            "blood_group": "B+",
            "date_of_birth": "1990-01-01",
            "email": "hijack@example.com",
            "is_active": False,
            "user": self.other.user_id,
            "donor_id": self.other.pk,
            "created_at": "2000-01-01T00:00:00Z",
        }
        before = Donor.objects.values().get(pk=self.donor.pk)
        for field, value in protected.items():
            response = self.client.patch(URL, {field: value}, format="json")
            self.assertEqual(response.status_code, 400, field)
            self.assertIn(field, response.data)
        self.assertEqual(Donor.objects.values().get(pk=self.donor.pk), before)

    def test_mixed_valid_and_protected_payload_changes_nothing(self):
        response = self.client.patch(URL, {"full_name": "Sneaky", "blood_group": "AB+"}, format="json")
        self.assertEqual(response.status_code, 400)
        donor = self.refresh()
        self.assertEqual(donor.full_name, "First Donor")
        self.assertEqual(donor.blood_group, "O+")

    # --- validation -------------------------------------------------------
    def test_invalid_coordinates_rejected(self):
        for payload in (
            {"latitude": 91, "longitude": 10},
            {"latitude": 10, "longitude": 181},
            {"latitude": "abc", "longitude": 10},
            {"latitude": 10},  # only one of the pair
        ):
            response = self.client.patch(URL, payload, format="json")
            self.assertEqual(response.status_code, 400, payload)
        self.assertIsNone(self.refresh().latitude)

    def test_zero_coordinates_are_valid(self):
        response = self.client.patch(URL, {"latitude": 0, "longitude": 0}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.refresh().latitude, 0)

    def test_invalid_weight_rejected(self):
        for weight in (0, -5, "abc", 301):
            response = self.client.patch(URL, {"weight_kg": weight}, format="json")
            self.assertEqual(response.status_code, 400, weight)
            self.assertIn("weight_kg", response.data)

    def test_invalid_phone_and_name_rejected(self):
        self.assertIn("phone_number", self.client.patch(URL, {"phone_number": "abc"}, format="json").data)
        self.assertIn("phone_number", self.client.patch(URL, {"phone_number": ""}, format="json").data)
        self.assertIn("full_name", self.client.patch(URL, {"full_name": " "}, format="json").data)

    def test_put_and_delete_not_allowed(self):
        self.assertEqual(self.client.put(URL, {}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(URL).status_code, 405)

    # --- access control ---------------------------------------------------
    def test_hospital_cannot_use_donor_endpoint(self):
        hospital_client = client_for(make_hospital().user)
        self.assertEqual(hospital_client.get(URL).status_code, 403)
        self.assertEqual(hospital_client.patch(URL, {"full_name": "x"}, format="json").status_code, 403)

    def test_anonymous_gets_401(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get(URL).status_code, 401)
        self.assertEqual(anonymous.patch(URL, {"full_name": "x"}, format="json").status_code, 401)
