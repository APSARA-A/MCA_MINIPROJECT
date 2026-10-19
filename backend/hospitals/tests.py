from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from core.testing import make_hospital


class HospitalTests(TestCase):
    def test_unverified_by_default(self):
        self.assertFalse(make_hospital().is_verified)

    def test_registration_number_unique(self):
        make_hospital(registration_number="DUP-1")
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_hospital(registration_number="DUP-1")

    def test_coordinate_and_phone_validation(self):
        hospital = make_hospital()
        hospital.latitude, hospital.longitude = Decimal("-91"), Decimal("200")
        hospital.phone_number = "12"
        with self.assertRaises(ValidationError) as ctx:
            hospital.full_clean()
        for field in ("latitude", "longitude", "phone_number"):
            self.assertIn(field, ctx.exception.message_dict)
