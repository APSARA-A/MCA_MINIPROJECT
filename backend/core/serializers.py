"""Serializer helpers shared by the profile endpoints."""
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from core.validators import validate_coordinate_pair


class WhitelistUpdateMixin:
    """Reject any submitted key that is not an editable field of the serializer.

    Protected fields (blood_group, is_verified, user, ...) are not declared on
    the update serializer, so naming them in a request is an explicit 400
    instead of being silently ignored.
    """

    protected_message = "This field cannot be changed."

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            unknown = {key: [self.protected_message] for key in data.keys() if key not in self.fields}
            if unknown:
                raise serializers.ValidationError(unknown)
        return super().to_internal_value(data)


def check_coordinate_pair(instance, attrs):
    """Latitude and longitude must both be set or both be empty after the update."""
    latitude = attrs.get("latitude", getattr(instance, "latitude", None))
    longitude = attrs.get("longitude", getattr(instance, "longitude", None))
    try:
        validate_coordinate_pair(latitude, longitude)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({"location": list(exc.messages)})
