import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from core.validators import (
    LATITUDE_VALIDATORS,
    LONGITUDE_VALIDATORS,
    validate_coordinate_pair,
)
from donors.models import Donor
from donors.serializers import DonorProfileSerializer
from hospitals.models import Hospital
from hospitals.serializers import HospitalProfileSerializer

from .fields import CoordinateField
from .roles import DONOR, HOSPITAL, get_account
from .services import create_user_account, email_in_use, normalize_email

User = get_user_model()

REGISTRATION_NUMBER_RE = re.compile(r"^[A-Z0-9][A-Z0-9/\-]{3,99}$")


class RegistrationBase(serializers.ModelSerializer):
    """Shared account fields and checks for donor and hospital sign-up."""

    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(
        write_only=True, trim_whitespace=False, style={"input_type": "password"}
    )
    confirm_password = serializers.CharField(
        write_only=True, trim_whitespace=False, style={"input_type": "password"}
    )
    latitude = CoordinateField(
        max_digits=10,
        decimal_places=7,
        required=False,
        allow_null=True,
        validators=LATITUDE_VALIDATORS,
    )
    longitude = CoordinateField(
        max_digits=10,
        decimal_places=7,
        required=False,
        allow_null=True,
        validators=LONGITUDE_VALIDATORS,
    )

    def validate_email(self, value):
        email = normalize_email(value)
        if email_in_use(email):
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return email

    def validate(self, attrs):
        errors = {}
        if attrs["password"] != attrs["confirm_password"]:
            errors["confirm_password"] = ["Passwords do not match."]
        try:
            validate_password(attrs["password"], user=User(email=attrs.get("email", "")))
        except DjangoValidationError as exc:
            errors["password"] = list(exc.messages)
        try:
            validate_coordinate_pair(attrs.get("latitude"), attrs.get("longitude"))
        except DjangoValidationError as exc:
            errors["location"] = list(exc.messages)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def _split(self, validated_data):
        validated_data = dict(validated_data)
        password = validated_data.pop("password")
        validated_data.pop("confirm_password")
        return password, validated_data


class DonorRegistrationSerializer(RegistrationBase):
    class Meta:
        model = Donor
        fields = [
            "full_name",
            "email",
            "password",
            "confirm_password",
            "date_of_birth",
            "gender",
            "blood_group",
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

    def validate_date_of_birth(self, value):
        if value < timezone.localdate() - timedelta(days=365 * 120):
            raise serializers.ValidationError("Enter a valid date of birth.")
        return value

    def create(self, validated_data):
        password, data = self._split(validated_data)
        with transaction.atomic():
            user = create_user_account(data["email"], password)
            return Donor.objects.create(user=user, **data)


class HospitalRegistrationSerializer(RegistrationBase):
    registration_number = serializers.CharField(max_length=100)

    class Meta:
        model = Hospital
        # is_verified and is_active are deliberately absent: clients cannot set them.
        fields = [
            "hospital_name",
            "registration_number",
            "email",
            "password",
            "confirm_password",
            "phone_number",
            "address",
            "latitude",
            "longitude",
        ]

    def validate_hospital_name(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Enter the hospital's full name.")
        return value

    def validate_registration_number(self, value):
        value = value.strip().upper()
        if not REGISTRATION_NUMBER_RE.match(value):
            raise serializers.ValidationError(
                "Use 4 or more letters, digits, hyphens or slashes."
            )
        if Hospital.objects.filter(registration_number__iexact=value).exists():
            raise serializers.ValidationError(
                "A hospital with this registration number is already registered."
            )
        return value

    def create(self, validated_data):
        password, data = self._split(validated_data)
        with transaction.atomic():
            user = create_user_account(data["email"], password)
            return Hospital.objects.create(
                user=user, is_verified=False, is_active=True, **data
            )


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)


def build_account_payload(user, role=None, profile=None):
    """Safe account summary used by login and /auth/me/. Never includes password
    data or medical details."""
    if role is None:
        role, profile = get_account(user)
    profile_data = None
    if role == DONOR:
        profile_data = DonorProfileSerializer(profile).data
    elif role == HOSPITAL:
        profile_data = HospitalProfileSerializer(profile).data
    return {
        "id": user.id,
        "email": user.email,
        "role": role,
        "profile": profile_data,
    }


class AccountTokenRefreshSerializer(TokenRefreshSerializer):
    """Reject removed users/profiles safely instead of exposing a server error."""

    def validate(self, attrs):
        from rest_framework.exceptions import AuthenticationFailed
        from rest_framework_simplejwt.settings import api_settings
        refresh = self.token_class(attrs['refresh'])
        identity = refresh.payload.get(api_settings.USER_ID_CLAIM)
        user = User.objects.filter(**{api_settings.USER_ID_FIELD: identity}).first() if identity else None
        if user is None or not user.is_active or get_account(user)[0] is None:
            raise AuthenticationFailed('No active account found for the given token.', code='no_active_account')
        return super().validate(attrs)
