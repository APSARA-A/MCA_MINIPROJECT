from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from core.testing import client_for, make_donor, make_hospital, make_request
from requests_app import workflow
from requests_app.models import EmergencyRequest

BASE = "/api/emergency-requests/"
Status = EmergencyRequest.Status

PAYLOAD = {
    "patient_reference": "CASE-001",
    "required_blood_group": "O+",
    "units_required": 2,
    "urgency": "CRITICAL",
    "latitude": 9.9312328,
    "longitude": 76.2673041,
}


def verified_hospital(**kw):
    return make_hospital(is_verified=True, **kw)


class RequestAPITestCase(TestCase):
    def setUp(self):
        self.hospital = verified_hospital()
        self.other = verified_hospital()
        self.client = client_for(self.hospital.user)
        self.other_client = client_for(self.other.user)

    def detail(self, pk):
        return f"{BASE}{pk}/"

    def cancel_url(self, pk):
        return f"{BASE}{pk}/cancel/"


class CreateRequestTests(RequestAPITestCase):
    def test_verified_hospital_creates_request(self):
        response = self.client.post(BASE, PAYLOAD, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        obj = EmergencyRequest.objects.get()
        self.assertEqual(obj.required_blood_group, "O+")
        self.assertEqual(obj.units_required, 2)
        self.assertEqual(str(obj.latitude), "9.9312328")
        self.assertEqual(response.data["request_id"], obj.pk)
        self.assertEqual(response.data["hospital_name"], self.hospital.hospital_name)
        self.assertNotIn("hospital", response.data)

    def test_initial_status_is_open_and_hospital_comes_from_user(self):
        self.client.post(BASE, PAYLOAD, format="json")
        obj = EmergencyRequest.objects.get()
        self.assertEqual(obj.status, Status.OPEN)
        self.assertEqual(obj.hospital, self.hospital)

    def test_client_cannot_forge_hospital_or_status(self):
        for extra in ({"hospital": self.other.pk}, {"hospital_id": self.other.pk}, {"status": "FULFILLED"}):
            response = self.client.post(BASE, {**PAYLOAD, **extra}, format="json")
            self.assertEqual(response.status_code, 400, extra)
        self.assertEqual(EmergencyRequest.objects.count(), 0)

    def test_urgency_defaults_to_normal(self):
        payload = {k: v for k, v in PAYLOAD.items() if k != "urgency"}
        self.client.post(BASE, payload, format="json")
        self.assertEqual(EmergencyRequest.objects.get().urgency, "NORMAL")

    def test_invalid_blood_group_rejected(self):
        for value in ("Z+", "", "o+", "AB"):
            response = self.client.post(BASE, {**PAYLOAD, "required_blood_group": value}, format="json")
            self.assertEqual(response.status_code, 400, value)
            self.assertIn("required_blood_group", response.data)

    def test_all_eight_blood_groups_accepted(self):
        for group in ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"):
            response = self.client.post(BASE, {**PAYLOAD, "required_blood_group": group}, format="json")
            self.assertEqual(response.status_code, 201, group)

    def test_units_must_be_a_positive_integer(self):
        for value in (0, -1, "abc", 1.5, None, 51):
            response = self.client.post(BASE, {**PAYLOAD, "units_required": value}, format="json")
            self.assertEqual(response.status_code, 400, value)
            self.assertIn("units_required", response.data)
        self.assertEqual(self.client.post(BASE, {**PAYLOAD, "units_required": 1}, format="json").status_code, 201)

    def test_invalid_urgency_rejected(self):
        response = self.client.post(BASE, {**PAYLOAD, "urgency": "SOON"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("urgency", response.data)

    def test_invalid_coordinates_rejected(self):
        for latitude, longitude in ((91, 10), (-91, 10), (10, 181), (10, -181), ("abc", 10), (10, "xyz")):
            response = self.client.post(BASE, {**PAYLOAD, "latitude": latitude, "longitude": longitude}, format="json")
            self.assertEqual(response.status_code, 400, (latitude, longitude))
        self.assertEqual(EmergencyRequest.objects.count(), 0)

    def test_missing_or_null_coordinates_rejected(self):
        no_coords = {k: v for k, v in PAYLOAD.items() if k not in ("latitude", "longitude")}
        response = self.client.post(BASE, no_coords, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("latitude", response.data)
        self.assertIn("longitude", response.data)
        response = self.client.post(BASE, {**PAYLOAD, "latitude": None, "longitude": None}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(EmergencyRequest.objects.count(), 0)

    def test_zero_coordinates_are_valid(self):
        response = self.client.post(BASE, {**PAYLOAD, "latitude": 0, "longitude": 0}, format="json")
        self.assertEqual(response.status_code, 201)

    def test_long_gps_precision_is_rounded(self):
        response = self.client.post(BASE, {**PAYLOAD, "latitude": 9.931232812345, "longitude": 76.267304198}, format="json")
        self.assertEqual(response.status_code, 201, response.content)

    def test_patient_reference_is_optional_and_must_be_a_code(self):
        no_ref = {k: v for k, v in PAYLOAD.items() if k != "patient_reference"}
        self.assertEqual(self.client.post(BASE, no_ref, format="json").status_code, 201)
        self.assertEqual(self.client.post(BASE, {**PAYLOAD, "patient_reference": ""}, format="json").status_code, 201)
        for bad in ("Ravi, ward 4 <script>", "a" * 101):
            response = self.client.post(BASE, {**PAYLOAD, "patient_reference": bad}, format="json")
            self.assertEqual(response.status_code, 400, bad)
            self.assertIn("patient_reference", response.data)


class PermissionTests(RequestAPITestCase):
    def test_unverified_hospital_cannot_use_any_endpoint(self):
        pending = make_hospital(is_verified=False)
        pending_client = client_for(pending.user)
        request = make_request(hospital=pending)
        calls = [
            pending_client.post(BASE, PAYLOAD, format="json"),
            pending_client.get(BASE),
            pending_client.get(self.detail(request.pk)),
            pending_client.patch(self.detail(request.pk), {"units_required": 3}, format="json"),
            pending_client.post(self.cancel_url(request.pk)),
            pending_client.get(f"{BASE}summary/"),
        ]
        for response in calls:
            self.assertEqual(response.status_code, 403)
        self.assertIn("verified", calls[0].data["detail"])
        self.assertEqual(EmergencyRequest.objects.filter(hospital=pending).count(), 1)  # only the one made directly
        request.refresh_from_db()
        self.assertEqual(request.status, Status.OPEN)

    def test_unverified_hospital_can_still_see_its_status(self):
        pending_client = client_for(make_hospital(is_verified=False).user)
        self.assertEqual(pending_client.get("/api/auth/me/").status_code, 200)
        response = pending_client.get("/api/hospitals/me/")
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["is_verified"], False)

    def test_donor_is_forbidden(self):
        donor_client = client_for(make_donor().user)
        self.assertEqual(donor_client.post(BASE, PAYLOAD, format="json").status_code, 403)
        self.assertEqual(donor_client.get(BASE).status_code, 403)
        self.assertEqual(EmergencyRequest.objects.count(), 0)

    def test_anonymous_is_unauthorized(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.post(BASE, PAYLOAD, format="json").status_code, 401)
        self.assertEqual(anonymous.get(BASE).status_code, 401)
        self.assertEqual(anonymous.get(f"{BASE}summary/").status_code, 401)

    def test_staff_and_superusers_are_not_granted_hospital_access(self):
        admin = get_user_model().objects.create_superuser("root", "root@example.com", "pw")
        self.assertEqual(client_for(admin).get(BASE).status_code, 403)
        # A verified hospital's user who is also staff is treated as ADMIN, not as a hospital.
        self.hospital.user.is_staff = True
        self.hospital.user.save()
        self.assertEqual(client_for(self.hospital.user).get(BASE).status_code, 403)

    def test_inactive_hospital_profile_is_forbidden(self):
        self.hospital.is_active = False
        self.hospital.save()
        self.assertEqual(client_for(self.hospital.user).get(BASE).status_code, 403)

    def test_inactive_user_token_is_rejected(self):
        token = str(RefreshToken.for_user(self.hospital.user).access_token)
        self.hospital.user.is_active = False
        self.hospital.user.save()
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(client.get(BASE).status_code, 401)

    def test_unverified_after_admin_revocation_loses_access(self):
        self.assertEqual(self.client.get(BASE).status_code, 200)
        self.hospital.is_verified = False
        self.hospital.save()
        # Each real request loads a fresh user; do the same here (the role is cached per request).
        fresh_user = get_user_model().objects.get(pk=self.hospital.user_id)
        self.assertEqual(client_for(fresh_user).get(BASE).status_code, 403)


class ListRequestTests(RequestAPITestCase):
    def test_lists_only_own_requests_newest_first_with_pagination(self):
        old = make_request(hospital=self.hospital)
        new = make_request(hospital=self.hospital, required_blood_group="A-")
        EmergencyRequest.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=2))
        foreign = make_request(hospital=self.other)

        response = self.client.get(BASE)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        ids = [row["request_id"] for row in response.data["results"]]
        self.assertEqual(ids, [new.pk, old.pk])
        self.assertNotIn(foreign.pk, ids)
        self.assertEqual(
            set(response.data["results"][0]),
            {"request_id", "required_blood_group", "units_required", "urgency", "status", "status_display",
             "created_at", "is_editable", "is_cancellable"},
        )

    def test_pagination_pages(self):
        for _ in range(12):
            make_request(hospital=self.hospital)
        first = self.client.get(BASE)
        self.assertEqual(len(first.data["results"]), 10)
        self.assertIsNotNone(first.data["next"])
        self.assertEqual(len(self.client.get(BASE, {"page": 2}).data["results"]), 2)

    def test_filters_use_the_database(self):
        make_request(hospital=self.hospital, status=Status.OPEN, urgency="CRITICAL", required_blood_group="O+")
        make_request(hospital=self.hospital, status=Status.CANCELLED, urgency="NORMAL", required_blood_group="A+")
        make_request(hospital=self.hospital, status=Status.OPEN, urgency="NORMAL", required_blood_group="A+")
        make_request(hospital=self.other, status=Status.OPEN, urgency="CRITICAL", required_blood_group="O+")

        def count(**params):
            return self.client.get(BASE, params).data["count"]

        self.assertEqual(count(status="OPEN"), 2)
        self.assertEqual(count(status="CANCELLED"), 1)
        self.assertEqual(count(urgency="CRITICAL"), 1)
        self.assertEqual(count(required_blood_group="A+"), 2)
        self.assertEqual(count(status="OPEN", urgency="NORMAL", required_blood_group="A+"), 1)
        self.assertEqual(count(), 3)

    def test_invalid_filter_value_is_a_400(self):
        for params in ({"status": "DONE"}, {"urgency": "SOON"}, {"required_blood_group": "Z+"}):
            self.assertEqual(self.client.get(BASE, params).status_code, 400, params)


class DetailAndUpdateTests(RequestAPITestCase):
    def setUp(self):
        super().setUp()
        self.req = make_request(hospital=self.hospital, patient_reference="CASE-9", units_required=2, urgency="URGENT",
                                latitude="9.9312328", longitude="76.2673041")

    def test_owner_sees_details(self):
        response = self.client.get(self.detail(self.req.pk))
        self.assertEqual(response.status_code, 200)
        for key in ("request_id", "hospital_name", "patient_reference", "required_blood_group", "units_required",
                    "urgency", "latitude", "longitude", "status", "created_at", "updated_at"):
            self.assertIn(key, response.data)
        self.assertIs(response.data["is_editable"], True)

    def test_other_hospital_gets_404_everywhere(self):
        for response in (
            self.other_client.get(self.detail(self.req.pk)),
            self.other_client.patch(self.detail(self.req.pk), {"units_required": 9}, format="json"),
            self.other_client.post(self.cancel_url(self.req.pk)),
        ):
            self.assertEqual(response.status_code, 404)
            self.assertNotIn("CASE-9", str(response.data))
        self.req.refresh_from_db()
        self.assertEqual((self.req.units_required, self.req.status), (2, Status.OPEN))

    def test_edit_own_open_request_preserves_other_fields(self):
        before = self.req.updated_at
        response = self.client.patch(self.detail(self.req.pk), {"units_required": 4, "urgency": "CRITICAL"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.req.refresh_from_db()
        self.assertEqual((self.req.units_required, self.req.urgency), (4, "CRITICAL"))
        self.assertEqual((self.req.patient_reference, self.req.required_blood_group), ("CASE-9", "O+"))
        self.assertEqual(str(self.req.latitude), "9.9312328")
        self.assertGreater(self.req.updated_at, before)
        self.assertEqual(response.data["units_required"], 4)
        self.assertEqual(response.data["status"], Status.OPEN)

    def test_edit_location(self):
        response = self.client.patch(self.detail(self.req.pk), {"latitude": 10.5, "longitude": 76.5}, format="json")
        self.assertEqual(response.status_code, 200)
        self.req.refresh_from_db()
        self.assertEqual(str(self.req.latitude), "10.5000000")

    def test_edit_validates_fields(self):
        for payload in ({"units_required": 0}, {"required_blood_group": "Q"}, {"urgency": "X"},
                        {"latitude": 95}, {"latitude": None}, {"patient_reference": "John Smith, bed 2!"}):
            self.assertEqual(self.client.patch(self.detail(self.req.pk), payload, format="json").status_code, 400, payload)

    def test_non_open_requests_cannot_be_edited(self):
        for status in (Status.MATCHING, Status.DONORS_CONTACTED, Status.FULFILLED, Status.CANCELLED, Status.CLOSED):
            EmergencyRequest.objects.filter(pk=self.req.pk).update(status=status)
            response = self.client.patch(self.detail(self.req.pk), {"units_required": 9}, format="json")
            self.assertEqual(response.status_code, 409, status)
            self.req.refresh_from_db()
            self.assertEqual(self.req.units_required, 2)
            self.assertIs(self.client.get(self.detail(self.req.pk)).data["is_editable"], False)

    def test_patch_cannot_change_status_or_ownership(self):
        for payload in ({"status": "CANCELLED"}, {"status": "FULFILLED"}, {"hospital": self.other.pk},
                        {"hospital_id": self.other.pk}, {"request_id": 999}):
            response = self.client.patch(self.detail(self.req.pk), payload, format="json")
            self.assertEqual(response.status_code, 400, payload)
        self.req.refresh_from_db()
        self.assertEqual((self.req.status, self.req.hospital), (Status.OPEN, self.hospital))

    def test_put_and_delete_not_allowed(self):
        self.assertEqual(self.client.put(self.detail(self.req.pk), PAYLOAD, format="json").status_code, 405)
        self.assertEqual(self.client.delete(self.detail(self.req.pk)).status_code, 405)
        self.assertTrue(EmergencyRequest.objects.filter(pk=self.req.pk).exists())

    def test_unknown_id_is_404(self):
        self.assertEqual(self.client.get(self.detail(99999)).status_code, 404)


class CancelRequestTests(RequestAPITestCase):
    def test_cancel_open_request_keeps_the_record(self):
        req = make_request(hospital=self.hospital)
        response = self.client.post(self.cancel_url(req.pk))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["status"], "CANCELLED")
        self.assertEqual(response.data["status_display"], "Cancelled")
        req.refresh_from_db()
        self.assertEqual(req.status, Status.CANCELLED)
        self.assertTrue(EmergencyRequest.objects.filter(pk=req.pk).exists())

    def test_cancel_matching_and_donors_contacted(self):
        for status in (Status.MATCHING, Status.DONORS_CONTACTED):
            req = make_request(hospital=self.hospital, status=status)
            self.assertEqual(self.client.post(self.cancel_url(req.pk)).status_code, 200, status)
            req.refresh_from_db()
            self.assertEqual(req.status, Status.CANCELLED)

    def test_cannot_cancel_fulfilled_or_closed(self):
        for status in (Status.FULFILLED, Status.CLOSED):
            req = make_request(hospital=self.hospital, status=status)
            self.assertEqual(self.client.post(self.cancel_url(req.pk)).status_code, 409, status)
            req.refresh_from_db()
            self.assertEqual(req.status, status)

    def test_cancel_is_idempotent(self):
        req = make_request(hospital=self.hospital)
        first = self.client.post(self.cancel_url(req.pk))
        req.refresh_from_db()
        stamp = req.updated_at
        second = self.client.post(self.cancel_url(req.pk))
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        self.assertEqual(second.data["status"], "CANCELLED")
        req.refresh_from_db()
        self.assertEqual(req.updated_at, stamp)

    def test_cancel_requires_post(self):
        req = make_request(hospital=self.hospital)
        self.assertEqual(self.client.get(self.cancel_url(req.pk)).status_code, 405)

    def test_cancelled_request_can_no_longer_receive_matches(self):
        req = make_request(hospital=self.hospital)
        self.assertTrue(workflow.can_create_matches(req))
        self.client.post(self.cancel_url(req.pk))
        req.refresh_from_db()
        self.assertFalse(workflow.can_create_matches(req))
        for status, expected in ((Status.OPEN, True), (Status.MATCHING, True), (Status.DONORS_CONTACTED, False),
                                 (Status.FULFILLED, False), (Status.CANCELLED, False), (Status.CLOSED, False)):
            req.status = status
            self.assertEqual(workflow.can_create_matches(req), expected, status)


class SummaryTests(RequestAPITestCase):
    URL = f"{BASE}summary/"

    def test_empty_summary_is_all_zero(self):
        self.assertEqual(self.client.get(self.URL).data, {"total_requests": 0, "open_requests": 0, "critical_requests": 0})

    def test_counts_are_real_and_scoped_to_the_hospital(self):
        make_request(hospital=self.hospital, status=Status.OPEN, urgency="CRITICAL")
        make_request(hospital=self.hospital, status=Status.OPEN, urgency="NORMAL")
        make_request(hospital=self.hospital, status=Status.MATCHING, urgency="CRITICAL")
        make_request(hospital=self.hospital, status=Status.CANCELLED, urgency="CRITICAL")
        make_request(hospital=self.hospital, status=Status.FULFILLED, urgency="URGENT")
        make_request(hospital=self.other, status=Status.OPEN, urgency="CRITICAL")
        data = self.client.get(self.URL).data
        self.assertEqual(data, {"total_requests": 5, "open_requests": 2, "critical_requests": 2})
        self.assertEqual(self.other_client.get(self.URL).data["total_requests"], 1)

    def test_summary_reflects_create_and_cancel(self):
        created = self.client.post(BASE, PAYLOAD, format="json").data["request_id"]
        self.assertEqual(self.client.get(self.URL).data, {"total_requests": 1, "open_requests": 1, "critical_requests": 1})
        self.client.post(self.cancel_url(created))
        self.assertEqual(self.client.get(self.URL).data, {"total_requests": 1, "open_requests": 0, "critical_requests": 0})
