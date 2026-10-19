from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from core.testing import aware_now, make_donor, make_hospital, make_match, make_request
from matching.models import DonorRequestMatch, MedicalScreening


class DonorRequestMatchTests(TestCase):
    def test_defaults(self):
        match = make_match()
        self.assertEqual(match.match_status, "IDENTIFIED")
        self.assertEqual(match.notification_status, "PENDING")
        self.assertEqual(match.donor_response, "PENDING")
        self.assertFalse(match.system_eligible)

    def test_donor_unique_per_request(self):
        match = make_match()
        with self.assertRaises(IntegrityError), transaction.atomic():
            DonorRequestMatch.objects.create(
                emergency_request=match.emergency_request, donor=match.donor
            )

    def test_same_donor_allowed_on_different_requests(self):
        match = make_match()
        make_match(request=make_request(), donor=match.donor)
        self.assertEqual(match.donor.request_matches.count(), 2)

    def test_negative_distance_rejected(self):
        match = make_match()
        match.distance_km = Decimal("-1")
        with self.assertRaises(ValidationError):
            match.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            DonorRequestMatch.objects.filter(pk=match.pk).update(distance_km=Decimal("-1"))

    def test_deleting_request_cascades_to_matches(self):
        match = make_match()
        match.emergency_request.delete()
        self.assertFalse(DonorRequestMatch.objects.filter(pk=match.pk).exists())


class MedicalScreeningTests(TestCase):
    def setUp(self):
        self.match = make_match()
        self.hospital = self.match.emergency_request.hospital

    def build(self, **overrides):
        data = dict(
            match=self.match,
            donor=self.match.donor,
            hospital=self.hospital,
            screening_date=aware_now(),
        )
        data.update(overrides)
        return MedicalScreening(**data)

    def test_valid_screening(self):
        screening = self.build(
            hemoglobin=Decimal("13.5"),
            blood_pressure="120/80",
            pulse=70,
            temperature=Decimal("36.7"),
            weight=Decimal("60"),
        )
        screening.full_clean()
        screening.save()
        self.assertEqual(screening.screening_status, "PENDING")
        self.assertEqual(self.match.screening, screening)

    def test_donor_must_match_the_match(self):
        with self.assertRaises(ValidationError) as ctx:
            self.build(donor=make_donor()).full_clean()
        self.assertIn("donor", ctx.exception.message_dict)

    def test_hospital_must_own_the_request(self):
        with self.assertRaises(ValidationError) as ctx:
            self.build(hospital=make_hospital()).full_clean()
        self.assertIn("hospital", ctx.exception.message_dict)

    def test_invalid_measurements_rejected(self):
        screening = self.build(
            hemoglobin=Decimal("-1"),
            blood_pressure="high",
            pulse=300,
            temperature=Decimal("90"),
            weight=Decimal("-5"),
        )
        with self.assertRaises(ValidationError) as ctx:
            screening.full_clean()
        for field in ("hemoglobin", "blood_pressure", "pulse", "temperature", "weight"):
            self.assertIn(field, ctx.exception.message_dict)

    def test_one_screening_per_match(self):
        self.build().save()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.build().save()
