from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from core.testing import make_hospital, make_match
from hospitals.models import Hospital


class HealthEndpointTests(TestCase):
    def test_health_returns_ok_json(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "project": "LifeLink"})


class AdminTests(TestCase):
    CHANGELISTS = [
        "donors_donor",
        "donors_donationhistory",
        "hospitals_hospital",
        "requests_app_emergencyrequest",
        "matching_donorrequestmatch",
        "matching_medicalscreening",
    ]

    def setUp(self):
        admin_user = get_user_model().objects.create_superuser(
            "admin", "admin@example.com", "pw"
        )
        self.client.force_login(admin_user)

    def test_all_six_models_registered_and_changelists_load(self):
        for name in self.CHANGELISTS:
            for view in ("changelist", "add"):
                url = reverse(f"admin:{name}_{view}")
                self.assertEqual(self.client.get(url).status_code, 200, url)

    def test_admin_can_verify_hospitals(self):
        hospitals = [make_hospital() for _ in range(2)]
        response = self.client.post(
            reverse("admin:hospitals_hospital_changelist"),
            {"action": "verify_hospitals", "_selected_action": [h.pk for h in hospitals]},
            follow=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Hospital.objects.filter(is_verified=True).count(), 2)

    def test_match_changelist_query_count_does_not_grow_with_rows(self):
        url = reverse("admin:matching_donorrequestmatch_changelist")
        make_match()
        with CaptureQueriesContext(connection) as one:
            self.client.get(url)
        for _ in range(5):
            make_match()
        with CaptureQueriesContext(connection) as many:
            self.client.get(url)
        self.assertEqual(len(one), len(many))
