from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from core.testing import make_hospital, make_request
from requests_app.models import EmergencyRequest


class EmergencyRequestTests(TestCase):
    def test_defaults(self):
        req = make_request()
        self.assertEqual(req.status, EmergencyRequest.Status.OPEN)
        self.assertEqual(req.urgency, EmergencyRequest.Urgency.NORMAL)
        self.assertEqual(str(req), f"Request #{req.pk}: O+ (NORMAL)")

    def test_units_must_be_at_least_one(self):
        req = make_request()
        req.units_required = 0
        with self.assertRaises(ValidationError) as ctx:
            req.full_clean()
        self.assertIn("units_required", ctx.exception.message_dict)
        with self.assertRaises(IntegrityError), transaction.atomic():
            EmergencyRequest.objects.filter(pk=req.pk).update(units_required=0)

    def test_invalid_choices_rejected(self):
        req = make_request()
        req.required_blood_group, req.urgency, req.status = "Z+", "SOON", "DONE"
        with self.assertRaises(ValidationError) as ctx:
            req.full_clean()
        for field in ("required_blood_group", "urgency", "status"):
            self.assertIn(field, ctx.exception.message_dict)

    def test_hospital_with_requests_cannot_be_deleted(self):
        hospital = make_hospital()
        make_request(hospital=hospital)
        with self.assertRaises(ProtectedError):
            hospital.delete()
