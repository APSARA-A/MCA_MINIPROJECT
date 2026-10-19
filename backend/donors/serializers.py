from rest_framework import serializers

from core.serializers import WhitelistUpdateMixin, check_coordinate_pair
from core.validators import LATITUDE_VALIDATORS, LONGITUDE_VALIDATORS
from users.fields import CoordinateField

from .models import Donor


class DonorProfileSerializer(serializers.ModelSerializer):
    """Read-only summary used inside the /api/auth/ account payload.

    medical_condition is intentionally excluded so it never reaches the login
    or session payload.
    """

    has_location = serializers.SerializerMethodField()

    class Meta:
        model = Donor
        fields = [
            "donor_id",
            "full_name",
            "date_of_birth",
            "gender",
            "blood_group",
            "phone_number",
            "whatsapp_number",
            "address",
            "latitude",
            "longitude",
            "weight_kg",
            "has_location",
            "created_at",
        ]
        read_only_fields = fields

    def get_has_location(self, obj):
        return obj.latitude is not None and obj.longitude is not None


class DonorDetailSerializer(DonorProfileSerializer):
    """The signed-in donor's own full profile (GET/PATCH /api/donors/me/)."""

    class Meta(DonorProfileSerializer.Meta):
        fields = DonorProfileSerializer.Meta.fields + ["email", "medical_condition", "is_active", "updated_at"]
        read_only_fields = fields


class DonorProfileUpdateSerializer(WhitelistUpdateMixin, serializers.ModelSerializer):
    """Whitelist of fields a donor may edit. Blood group and date of birth are
    deliberately locked, as are user, donor_id, email and is_active."""

    latitude = CoordinateField(
        max_digits=10, decimal_places=7, required=False, allow_null=True, validators=LATITUDE_VALIDATORS
    )
    longitude = CoordinateField(
        max_digits=10, decimal_places=7, required=False, allow_null=True, validators=LONGITUDE_VALIDATORS
    )

    class Meta:
        model = Donor
        fields = [
            "full_name",
            "phone_number",
            "whatsapp_number",
            "address",
            "weight_kg",
            "medical_condition",
            "latitude",
            "longitude",
        ]

    def validate_full_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Enter your full name.")
        return value

    def validate_weight_kg(self, value):
        if value is not None and value > 300:
            raise serializers.ValidationError("Enter a realistic weight in kilograms.")
        return value

    def validate(self, attrs):
        check_coordinate_pair(self.instance, attrs)
        return attrs
