from django.core.validators import MinValueValidator
from django.db import models

from core.choices import BloodGroup
from core.validators import (
    LATITUDE_VALIDATORS,
    LONGITUDE_VALIDATORS,
    validate_coordinate_pair,
)


class EmergencyRequest(models.Model):
    class Urgency(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        URGENT = "URGENT", "Urgent"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        MATCHING = "MATCHING", "Matching"
        DONORS_CONTACTED = "DONORS_CONTACTED", "Donors contacted"
        FULFILLED = "FULFILLED", "Fulfilled"
        CANCELLED = "CANCELLED", "Cancelled"
        CLOSED = "CLOSED", "Closed"

    request_id = models.BigAutoField(primary_key=True)
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.PROTECT,
        related_name="emergency_requests",
    )
    patient_reference = models.CharField(
        "patient reference",
        max_length=100,
        blank=True,
        help_text="Internal reference only. Do not enter the patient's real name.",
    )
    required_blood_group = models.CharField(
        "required blood group", max_length=3, choices=BloodGroup.choices
    )
    units_required = models.PositiveIntegerField(
        "units required", validators=[MinValueValidator(1)]
    )
    urgency = models.CharField(
        max_length=20, choices=Urgency.choices, default=Urgency.NORMAL
    )
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
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.OPEN
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(units_required__gte=1),
                name="emergency_request_units_gte_1",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "urgency"], name="request_status_urgency_idx"),
            models.Index(
                fields=["required_blood_group", "status"],
                name="request_group_status_idx",
            ),
        ]

    def __str__(self):
        return f"Request #{self.pk}: {self.required_blood_group} ({self.urgency})"

    def clean(self):
        super().clean()
        validate_coordinate_pair(self.latitude, self.longitude)
