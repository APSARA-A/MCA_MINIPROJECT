from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from rest_framework import serializers

SEVEN_PLACES = Decimal("0.0000001")


class CoordinateField(serializers.DecimalField):
    """Decimal field that rounds browser GPS values to 7 decimal places.

    navigator.geolocation returns floats with many decimals, which the model's
    DecimalField(decimal_places=7) would otherwise reject. Zero is valid.
    """

    def to_internal_value(self, data):
        if isinstance(data, (int, float, str)) and not isinstance(data, bool):
            try:
                data = str(Decimal(str(data).strip()).quantize(SEVEN_PLACES, ROUND_HALF_UP))
            except (InvalidOperation, ValueError):
                pass  # let DecimalField report the error
        return super().to_internal_value(data)
