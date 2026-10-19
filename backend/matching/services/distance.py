"""Straight-line geographic distance, not road distance or travel time."""
from math import asin, cos, isfinite, radians, sin, sqrt


def validate_coordinates(latitude, longitude):
    if latitude is None or longitude is None:
        raise ValueError('Both latitude and longitude are required.')
    try:
        if isinstance(latitude, bool) or isinstance(longitude, bool):
            raise ValueError
        lat, lon = float(latitude), float(longitude)
    except (TypeError, ValueError, OverflowError):
        raise ValueError('Coordinates must be finite numbers.') from None
    if not isfinite(lat) or not -90 <= lat <= 90:
        raise ValueError('Latitude must be between -90 and 90.')
    if not isfinite(lon) or not -180 <= lon <= 180:
        raise ValueError('Longitude must be between -180 and 180.')
    return lat, lon


def calculate_distance_km(lat1, lon1, lat2, lon2):
    lat1, lon1 = validate_coordinates(lat1, lon1)
    lat2, lon2 = validate_coordinates(lat2, lon2)
    lat1, lon1, lat2, lon2 = map(radians, (lat1, lon1, lat2, lon2))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(min(1.0, max(0.0, a))))
