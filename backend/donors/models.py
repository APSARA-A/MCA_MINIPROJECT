from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from core.choices import BloodGroup
from core.validators import (
    LATITUDE_VALIDATORS,
    LONGITUDE_VALIDATORS,
    POSITIVE_DECIMAL_VALIDATORS,
    phone_validator,
    validate_coordinate_pair,
    validate_not_future_date,
    validate_past_date,
)


class Donor(models.Model):
    class Gender(models.TextChoices):
        MALE = "MALE", "Male"
        FEMALE = "FEMALE", "Female"
        OTHER = "OTHER", "Other"

    donor_id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="donor_profile",
    )
    full_name = models.CharField("full name", max_length=100)
    date_of_birth = models.DateField(
        "date of birth", validators=[validate_past_date]
    )
    gender = models.CharField(max_length=10, choices=Gender.choices)
    blood_group = models.CharField(
        "blood group", max_length=3, choices=BloodGroup.choices
    )
    phone_number = models.CharField(
        "phone number", max_length=15, validators=[phone_validator]
    )
    whatsapp_number = models.CharField(
        "WhatsApp number",
        max_length=15,
        blank=True,
        validators=[phone_validator],
    )
    email = models.EmailField("email address", unique=True)
    address = models.TextField("address", blank=True)
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
    weight_kg = models.DecimalField(
        "weight (kg)",
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=POSITIVE_DECIMAL_VALIDATORS,
    )
    medical_condition = models.CharField(
        "medical condition", max_length=255, blank=True
    )
    is_active = models.BooleanField("active", default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["full_name"]
        indexes = [
            models.Index(
                fields=["blood_group", "is_active"], name="donor_group_active_idx"
            ),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.blood_group})"

    def clean(self):
        super().clean()
        validate_coordinate_pair(self.latitude, self.longitude)


class DonationHistory(models.Model):
    class Status(models.TextChoices):
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        REJECTED = "REJECTED", "Rejected"

    donation_id = models.BigAutoField(primary_key=True)
    donor = models.ForeignKey(
        Donor, on_delete=models.PROTECT, related_name="donations"
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.PROTECT,
        related_name="donations_received",
    )
    emergency_request = models.ForeignKey(
        "requests_app.EmergencyRequest",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="donations",
    )
    donation_date = models.DateField(
        "donation date", validators=[validate_not_future_date]
    )
    blood_group = models.CharField(
        "blood group", max_length=3, choices=BloodGroup.choices
    )
    units_donated = models.PositiveIntegerField(
        "units donated", default=1, validators=[MinValueValidator(1)]
    )
    status = models.CharField(max_length=20, choices=Status.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-donation_date", "-donation_id"]
        verbose_name = "donation history record"
        verbose_name_plural = "donation history"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(units_donated__gte=1),
                name="donation_units_gte_1",
            ),
        ]
        indexes = [
            models.Index(
                fields=["donor", "status", "-donation_date"],
                name="donation_donor_status_date_idx",
            ),
        ]

    def __str__(self):
        return f"Donation #{self.pk}: donor {self.donor_id} on {self.donation_date}"

    def clean(self):
        super().clean()
        if self.donor_id and self.blood_group and self.donor.blood_group != self.blood_group:
            raise ValidationError(
                {"blood_group": "Blood group must match the donor's blood group."}
            )
