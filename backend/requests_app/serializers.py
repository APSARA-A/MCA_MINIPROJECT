import re

from rest_framework import serializers

from core.choices import BloodGroup
from core.serializers import WhitelistUpdateMixin, check_coordinate_pair
from core.validators import LATITUDE_VALIDATORS, LONGITUDE_VALIDATORS
from users.fields import CoordinateField

from . import workflow
from .models import EmergencyRequest

# A case identifier, not free text: stops people typing sentences or names.
PATIENT_REFERENCE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _\-/.#]*$")
MAX_UNITS = 50


class EmergencyRequestListSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_editable = serializers.SerializerMethodField()
    is_cancellable = serializers.SerializerMethodField()

    class Meta:
        model = EmergencyRequest
        fields = [
            "request_id",
            "required_blood_group",
            "units_required",
            "urgency",
            "status",
            "status_display",
            "created_at",
            "is_editable",
            "is_cancellable",
        ]
        read_only_fields = fields

    def get_is_editable(self, obj):
        return workflow.is_editable(obj)

    def get_is_cancellable(self, obj):
        return workflow.is_cancellable(obj)


class EmergencyRequestDetailSerializer(EmergencyRequestListSerializer):
    hospital_name = serializers.CharField(source="hospital.hospital_name", read_only=True)

    class Meta(EmergencyRequestListSerializer.Meta):
        fields = [
            "request_id",
            "hospital_name",
            "patient_reference",
            "required_blood_group",
            "units_required",
            "urgency",
            "latitude",
            "longitude",
            "status",
            "status_display",
            "created_at",
            "updated_at",
            "is_editable",
            "is_cancellable",
        ]
        read_only_fields = fields


class EmergencyRequestWriteSerializer(WhitelistUpdateMixin, serializers.ModelSerializer):
    """Create and PATCH. `hospital` and `status` are not fields, so naming
    either in a request body is rejected; both are set only by the server."""

    patient_reference = serializers.CharField(max_length=100, required=False, allow_blank=True)
    required_blood_group = serializers.ChoiceField(choices=BloodGroup.choices)
    units_required = serializers.IntegerField(min_value=1, max_value=MAX_UNITS)
    urgency = serializers.ChoiceField(choices=EmergencyRequest.Urgency.choices, required=False)
    latitude = CoordinateField(
        max_digits=10, decimal_places=7, allow_null=False, validators=LATITUDE_VALIDATORS
    )
    longitude = CoordinateField(
        max_digits=10, decimal_places=7, allow_null=False, validators=LONGITUDE_VALIDATORS
    )

    class Meta:
        model = EmergencyRequest
        fields = [
            "patient_reference",
            "required_blood_group",
            "units_required",
            "urgency",
            "latitude",
            "longitude",
        ]

    def validate_patient_reference(self, value):
        value = value.strip()
        if value and not PATIENT_REFERENCE_RE.match(value):
            raise serializers.ValidationError(
                "Use a case code with letters, digits, spaces and - _ / . # only. "
                "Do not enter the patient's name."
            )
        return value

    def validate(self, attrs):
        # Coordinates are mandatory for the MVP because matching needs them.
        if self.instance is None:
            check_coordinate_pair(None, attrs)
        else:
            check_coordinate_pair(self.instance, attrs)
        return attrs
