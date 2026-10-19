import uuid

from django.contrib.auth import get_user_model

from donors.models import Donor
from hospitals.models import Hospital


def normalize_email(value):
    return value.strip().lower()


def email_in_use(email):
    """Email must be unique across User, Donor and Hospital (case-insensitive)."""
    User = get_user_model()
    return (
        User.objects.filter(email__iexact=email).exists()
        or Donor.objects.filter(email__iexact=email).exists()
        or Hospital.objects.filter(email__iexact=email).exists()
    )


def generate_username():
    """Collision-resistant username. Email is the login identifier, so the
    username is an internal key; a UUID4 is unique without a lookup loop and
    never leaks personal data."""
    return f"u{uuid.uuid4().hex}"


def create_user_account(email, password):
    """Create the Django User with a hashed password. Call inside atomic()."""
    return get_user_model().objects.create_user(
        username=generate_username(),
        email=email,
        password=password,
    )
