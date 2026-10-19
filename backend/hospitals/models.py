from django.conf import settings
from django.db import models

from core.validators import (
    LATITUDE_VALIDATORS,
    LONGITUDE_VALIDATORS,
    phone_validator,
    validate_coordinate_pair,
)


class Hospital(models.Model):
    hospital_id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hospital_profile",
    )
    hospital_name = models.CharField("hospital name", max_length=150)
    registration_number = models.CharField(
        "registration number", max_length=100, unique=True
    )
    phone_number = models.CharField(
        "phone number", max_length=15, validators=[phone_validator]
    )
    email = models.EmailField("email address", unique=True)
    address = models.TextField("address")
    latitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        validators=LATITUDE_VALIDATORS,
    )
    longitude = models.DecimalField(
        max_digits=10,
        decimal_places=7,
        null=True,
        blank=True,
        validators=LONGITUDE_VALIDATORS,
    )
    is_verified = models.BooleanField(
        "verified by admin",
        default=False,
        help_text="Hospitals stay unverified until an administrator approves them.",
    )
    is_active = models.BooleanField("active", default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["hospital_name"]
        indexes = [
            models.Index(
                fields=["is_verified", "is_active"], name="hospital_verified_active_idx"
            ),
        ]

    def __str__(self):
        return self.hospital_name

    def clean(self):
        super().clean()
        validate_coordinate_pair(self.latitude, self.longitude)
