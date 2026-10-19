from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from core.testing import make_donor, make_hospital, make_user
from donors.models import DonationHistory, Donor


class DonorModelTests(TestCase):
    def test_valid_donor_passes_full_clean_and_has_str(self):
        donor = make_donor(latitude=Decimal("9.9312"), longitude=Decimal("76.2673"))
        donor.full_clean()
        self.assertIn("(O+)", str(donor))

    def test_date_of_birth_must_be_in_past(self):
        donor = make_donor()
        donor.date_of_birth = timezone.localdate()
        with self.assertRaises(ValidationError) as ctx:
            donor.full_clean()
        self.assertIn("date_of_birth", ctx.exception.message_dict)

    def test_weight_must_be_positive(self):
        donor = make_donor()
        donor.weight_kg = Decimal("0")
        with self.assertRaises(ValidationError) as ctx:
            donor.full_clean()
        self.assertIn("weight_kg", ctx.exception.message_dict)

    def test_coordinate_ranges(self):
        donor = make_donor()
        donor.latitude, donor.longitude = Decimal("91"), Decimal("181")
        with self.assertRaises(ValidationError) as ctx:
            donor.full_clean()
        self.assertIn("latitude", ctx.exception.message_dict)
        self.assertIn("longitude", ctx.exception.message_dict)

    def test_latitude_without_longitude_rejected(self):
        donor = make_donor()
        donor.latitude = Decimal("10")
        with self.assertRaises(ValidationError):
            donor.full_clean()

    def test_phone_format(self):
        donor = make_donor()
        donor.phone_number = "abc123"
        with self.assertRaises(ValidationError) as ctx:
            donor.full_clean()
        self.assertIn("phone_number", ctx.exception.message_dict)

    def test_email_must_be_unique(self):
        make_donor(email="same@example.com")
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_donor(email="same@example.com")

    def test_one_donor_per_user(self):
        user = make_user()
        make_donor(user=user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_donor(user=user)


class DonationHistoryTests(TestCase):
    def setUp(self):
        self.donor = make_donor(blood_group="A+")
        self.hospital = make_hospital()

    def build(self, **overrides):
        data = dict(
            donor=self.donor,
            hospital=self.hospital,
            donation_date=date.today() - timedelta(days=30),
            blood_group="A+",
            status=DonationHistory.Status.COMPLETED,
        )
        data.update(overrides)
        return DonationHistory(**data)

    def test_valid_record_and_default_units(self):
        record = self.build()
        record.full_clean()
        record.save()
        self.assertEqual(record.units_donated, 1)
        self.assertEqual(self.donor.donations.count(), 1)

    def test_future_date_rejected(self):
        with self.assertRaises(ValidationError) as ctx:
            self.build(donation_date=timezone.localdate() + timedelta(days=1)).full_clean()
        self.assertIn("donation_date", ctx.exception.message_dict)

    def test_units_must_be_at_least_one(self):
        with self.assertRaises(ValidationError) as ctx:
            self.build(units_donated=0).full_clean()
        self.assertIn("units_donated", ctx.exception.message_dict)

    def test_db_constraint_blocks_zero_units(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.build(units_donated=0).save()

    def test_blood_group_must_match_donor(self):
        with self.assertRaises(ValidationError) as ctx:
            self.build(blood_group="B-").full_clean()
        self.assertIn("blood_group", ctx.exception.message_dict)

    def test_donor_is_protected_from_deletion(self):
        from django.db.models import ProtectedError

        self.build().save()
        with self.assertRaises(ProtectedError):
            self.donor.delete()
