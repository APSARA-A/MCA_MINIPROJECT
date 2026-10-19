"""Small factory helpers shared by the test modules."""
from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from itertools import count

from django.contrib.auth import get_user_model

from donors.models import Donor
from hospitals.models import Hospital
from matching.models import DonorRequestMatch
from requests_app.models import EmergencyRequest

_n = count(1)


def make_user():
    return get_user_model().objects.create_user(username=f"user{next(_n)}", password="x")


def make_donor(**overrides):
    n = next(_n)
    data = dict(
        user=make_user(),
        full_name=f"Donor {n}",
        date_of_birth=date(1998, 1, 1),
        gender=Donor.Gender.FEMALE,
        blood_group="O+",
        phone_number="9800000000",
        email=f"donor{n}@example.com",
    )
    data.update(overrides)
    return Donor.objects.create(**data)


def make_hospital(**overrides):
    n = next(_n)
    data = dict(
        user=make_user(),
        hospital_name=f"Hospital {n}",
        registration_number=f"REG-{n}",
        phone_number="+914840000000",
        email=f"hospital{n}@example.com",
        address="Test street",
    )
    data.update(overrides)
    return Hospital.objects.create(**data)


def make_request(hospital=None, **overrides):
    data = dict(
        hospital=hospital or make_hospital(),
        required_blood_group="O+",
        units_required=1,
    )
    data.update(overrides)
    return EmergencyRequest.objects.create(**data)


def make_match(request=None, donor=None, **overrides):
    return DonorRequestMatch.objects.create(
        emergency_request=request or make_request(),
        donor=donor or make_donor(),
        **overrides,
    )


def aware_now():
    return datetime.now(dt_timezone.utc)


def client_for(user):
    """APIClient authenticated as `user` (skips the JWT round trip)."""
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(user=user)
    return client
