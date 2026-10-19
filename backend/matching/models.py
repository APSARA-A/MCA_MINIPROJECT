from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from core.validators import (
    POSITIVE_DECIMAL_VALIDATORS,
    blood_pressure_validator,
)


class DonorRequestMatch(models.Model):
    class NotificationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    class DonorResponse(models.TextChoices):
        PENDING = "PENDING", "Pending"
        AVAILABLE = "AVAILABLE", "Available"
        NOT_AVAILABLE = "NOT_AVAILABLE", "Not available"
        NO_RESPONSE = "NO_RESPONSE", "No response"

    class MatchStatus(models.TextChoices):
        IDENTIFIED = "IDENTIFIED", "Identified"
        CONTACTED = "CONTACTED", "Contacted"
        AVAILABLE = "AVAILABLE", "Available"
        UNAVAILABLE = "UNAVAILABLE", "Unavailable"
        ARRIVED = "ARRIVED", "Arrived"
        SCREENING = "SCREENING", "Screening"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        DONATED = "DONATED", "Donated"
        CANCELLED = "CANCELLED", "Cancelled"

    match_id = models.BigAutoField(primary_key=True)
    emergency_request = models.ForeignKey(
        "requests_app.EmergencyRequest",
        on_delete=models.CASCADE,
        related_name="matches",
    )
    donor = models.ForeignKey(
        "donors.Donor",
        on_delete=models.PROTECT,
        related_name="request_matches",
    )
    distance_km = models.DecimalField(
        "distance (km)",
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    system_eligible = models.BooleanField("system eligible", default=False)
    notification_status = models.CharField(
        max_length=20,
        choices=NotificationStatus.choices,
        default=NotificationStatus.PENDING,
    )
    donor_response = models.CharField(
        max_length=20,
        choices=DonorResponse.choices,
        default=DonorResponse.PENDING,
    )
    match_status = models.CharField(
        max_length=20,
        choices=MatchStatus.choices,
        default=MatchStatus.IDENTIFIED,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "donor request match"
        verbose_name_plural = "donor request matches"
        constraints = [
            models.UniqueConstraint(
                fields=["emergency_request", "donor"],
                name="unique_donor_per_request",
            ),
            models.CheckConstraint(
                condition=models.Q(distance_km__isnull=True)
                | models.Q(distance_km__gte=0),
                name="match_distance_not_negative",
            ),
        ]
        indexes = [
            models.Index(
                fields=["donor_response", "match_status"],
                name="match_response_status_idx",
            ),
            models.Index(fields=["donor", "match_status"], name="match_donor_status_idx"),
        ]

    def __str__(self):
        return f"Match #{self.pk}: request {self.emergency_request_id}, donor {self.donor_id}"


class MedicalScreening(models.Model):
    class ScreeningStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    screening_id = models.BigAutoField(primary_key=True)
    match = models.OneToOneField(
        DonorRequestMatch,
        on_delete=models.PROTECT,
        related_name="screening",
    )
    donor = models.ForeignKey(
        "donors.Donor",
        on_delete=models.PROTECT,
        related_name="screenings",
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.PROTECT,
        related_name="screenings",
    )
    screening_date = models.DateTimeField("screening date")
    hemoglobin = models.DecimalField(
        "hemoglobin (g/dL)",
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("1")), MaxValueValidator(Decimal("25"))],
    )
    blood_pressure = models.CharField(
        "blood pressure (mmHg)",
        max_length=20,
        blank=True,
        validators=[blood_pressure_validator],
    )
    pulse = models.PositiveIntegerField(
        "pulse (bpm)",
        null=True,
        blank=True,
        validators=[MinValueValidator(20), MaxValueValidator(250)],
    )
    temperature = models.DecimalField(
        "temperature (°C)",
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("30")), MaxValueValidator(Decimal("45"))],
    )
    weight = models.DecimalField(
        "weight (kg)",
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=POSITIVE_DECIMAL_VALIDATORS
        + [MaxValueValidator(Decimal("500"))],
    )
    medical_notes = models.TextField("medical notes", blank=True)
    screening_status = models.CharField(
        max_length=20,
        choices=ScreeningStatus.choices,
        default=ScreeningStatus.PENDING,
    )
    rejection_reason = models.TextField("rejection reason", blank=True)
    screened_by = models.CharField("screened by", max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-screening_date"]
        indexes = [
            models.Index(fields=["screening_status"], name="screening_status_idx"),
        ]

    def __str__(self):
        return f"Screening #{self.pk} for match {self.match_id}"

    def clean(self):
        super().clean()
        errors = {}
        if self.match_id:
            match = self.match
            if self.donor_id and self.donor_id != match.donor_id:
                errors["donor"] = "Donor must be the donor of the selected match."
            if self.hospital_id and self.hospital_id != match.emergency_request.hospital_id:
                errors["hospital"] = (
                    "Hospital must be the hospital that owns the emergency request."
                )
        if errors:
            raise ValidationError(errors)
