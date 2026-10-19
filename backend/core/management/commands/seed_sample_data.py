"""Create a small, repeatable set of sample records for development.

Usage: python manage.py seed_sample_data
Sample users have unusable passwords; they cannot log in.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from core.demo import require_isolated_demo

from donors.models import DonationHistory, Donor
from hospitals.models import Hospital
from matching.models import DonorRequestMatch, MedicalScreening
from requests_app.models import EmergencyRequest


def make_user(username):
    User = get_user_model()
    user, created = User.objects.get_or_create(username=username)
    if created:
        user.set_unusable_password()
        user.save()
    return user


class Command(BaseCommand):
    help = "Create sample hospital, donors, request, match, donation and screening."

    @transaction.atomic
    def handle(self, *args, **options):
        require_isolated_demo()
        hospital, _ = Hospital.objects.get_or_create(
            registration_number="SAMPLE-REG-001",
            defaults=dict(
                user=make_user("sample_hospital"),
                hospital_name="Sample City Hospital",
                phone_number="+914840000001",
                email="hospital@example.com",
                address="MG Road, Kochi",
                latitude=Decimal("9.9312000"),
                longitude=Decimal("76.2673000"),
                is_verified=True,
            ),
        )
        donor_a, _ = Donor.objects.get_or_create(
            email="donor.a@example.com",
            defaults=dict(
                user=make_user("sample_donor_a"),
                full_name="Sample Donor A",
                date_of_birth=date(1999, 5, 20),
                gender=Donor.Gender.FEMALE,
                blood_group="O+",
                phone_number="+919800000001",
                whatsapp_number="+919800000001",
                latitude=Decimal("9.9816000"),
                longitude=Decimal("76.2999000"),
                weight_kg=Decimal("58.50"),
            ),
        )
        Donor.objects.get_or_create(
            email="donor.b@example.com",
            defaults=dict(
                user=make_user("sample_donor_b"),
                full_name="Sample Donor B",
                date_of_birth=date(1995, 11, 2),
                gender=Donor.Gender.MALE,
                blood_group="A+",
                phone_number="9800000002",
                weight_kg=Decimal("72.00"),
            ),
        )
        request, _ = EmergencyRequest.objects.get_or_create(
            hospital=hospital,
            patient_reference="SAMPLE-PT-001",
            defaults=dict(
                required_blood_group="O+",
                units_required=2,
                urgency=EmergencyRequest.Urgency.URGENT,
                latitude=hospital.latitude,
                longitude=hospital.longitude,
            ),
        )
        match, _ = DonorRequestMatch.objects.get_or_create(
            emergency_request=request,
            donor=donor_a,
            defaults=dict(distance_km=Decimal("6.12"), system_eligible=True),
        )
        DonationHistory.objects.get_or_create(
            donor=donor_a,
            hospital=hospital,
            donation_date=timezone.localdate() - timedelta(days=200),
            defaults=dict(
                blood_group="O+",
                units_donated=1,
                status=DonationHistory.Status.COMPLETED,
            ),
        )
        MedicalScreening.objects.get_or_create(
            match=match,
            defaults=dict(
                donor=donor_a,
                hospital=hospital,
                screening_date=timezone.now(),
                hemoglobin=Decimal("13.5"),
                blood_pressure="118/76",
                pulse=72,
                temperature=Decimal("36.8"),
                weight=Decimal("58.50"),
                screened_by="Sample Nurse",
            ),
        )
        self.stdout.write(self.style.SUCCESS("Sample data ready."))
