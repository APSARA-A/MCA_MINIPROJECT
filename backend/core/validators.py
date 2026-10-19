"""Reusable field validators for LifeLink models."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.utils import timezone

# Optional leading "+", then 7-14 digits (max 15 characters, matching max_length=15).
phone_validator = RegexValidator(
    regex=r"^\+?[0-9]{7,14}$",
    message="Enter a valid phone number: digits only, optional leading +, 7 to 14 digits.",
)

blood_pressure_validator = RegexValidator(
    regex=r"^[0-9]{2,3}/[0-9]{2,3}$",
    message="Enter blood pressure as systolic/diastolic, for example 120/80.",
)

LATITUDE_VALIDATORS = [
    MinValueValidator(Decimal("-90")),
    MaxValueValidator(Decimal("90")),
]
LONGITUDE_VALIDATORS = [
    MinValueValidator(Decimal("-180")),
    MaxValueValidator(Decimal("180")),
]
POSITIVE_DECIMAL_VALIDATORS = [MinValueValidator(Decimal("0.01"))]


def validate_past_date(value):
    if value >= timezone.localdate():
        raise ValidationError("Date must be in the past.")


def validate_not_future_date(value):
    if value > timezone.localdate():
        raise ValidationError("Date cannot be in the future.")


def validate_coordinate_pair(latitude, longitude):
    """Latitude and longitude must be supplied together or not at all."""
    if (latitude is None) != (longitude is None):
        raise ValidationError(
            "Provide both latitude and longitude, or leave both empty."
        )
