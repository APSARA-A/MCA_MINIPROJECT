from rest_framework import serializers

from core.serializers import WhitelistUpdateMixin, check_coordinate_pair
from core.validators import LATITUDE_VALIDATORS, LONGITUDE_VALIDATORS
from users.fields import CoordinateField

from .models import Hospital


class HospitalProfileSerializer(serializers.ModelSerializer):
    """The signed-in hospital's own profile (read-only)."""

    has_location = serializers.SerializerMethodField()
    verification_status = serializers.SerializerMethodField()

    class Meta:
        model = Hospital
        fields = [
            "hospital_id",
            "hospital_name",
            "registration_number",
            "phone_number",
            "email",
            "address",
            "latitude",
            "longitude",
            "is_verified",
            "verification_status",
            "is_active",
            "has_location",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_has_location(self, obj):
        return obj.latitude is not None and obj.longitude is not None

    def get_verification_status(self, obj):
        return "VERIFIED" if obj.is_verified else "PENDING"


class HospitalProfileUpdateSerializer(WhitelistUpdateMixin, serializers.ModelSerializer):
    """Hospitals may edit only phone, address and location. Name, registration
    number, email, is_verified, is_active and user are locked."""

    latitude = CoordinateField(
        max_digits=10, decimal_places=7, required=False, allow_null=True, validators=LATITUDE_VALIDATORS
    )
    longitude = CoordinateField(
        max_digits=10, decimal_places=7, required=False, allow_null=True, validators=LONGITUDE_VALIDATORS
    )

    class Meta:
        model = Hospital
        fields = ["phone_number", "address", "latitude", "longitude"]

    def validate_address(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter the hospital's address.")
        return value

    def validate(self, attrs):
        check_coordinate_pair(self.instance, attrs)
        return attrs
