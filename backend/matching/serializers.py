from rest_framework import serializers
from .services.matching_engine import SUPPORTED_RADII


class RadiusSerializer(serializers.Serializer):
    radius_km = serializers.ChoiceField(choices=SUPPORTED_RADII, default=25)

    def validate(self, attrs):
        if isinstance(self.initial_data.get('radius_km'), bool):
            raise serializers.ValidationError({'radius_km': 'Choose 5, 10, 25 or 50 km.'})
        return attrs


def candidate_data(donor, distance, screening, match=None, issues=None):
    # Deliberate allowlist: no contact details, coordinates or medical free text.
    return {
        'match_id': match.pk if match else None,
        'donor_name': donor.full_name, 'blood_group': donor.blood_group,
        'distance_km': round(distance, 2) if distance is not None else None,
        'system_eligible': screening['system_eligible'],
        'recorded_system_eligible': match.system_eligible if match else None,
        'eligible_for_contact': screening['eligible_for_contact'] and not issues,
        'screening_required': True, 'prescreening_outcome': screening['outcome'],
        'reasons': screening['reasons'], 'warnings': screening['warnings'],
        'current_issues': issues or [],
        'match_status': match.match_status if match else None,
        'notification_status': match.notification_status if match else None,
        'donor_response': match.donor_response if match else None,
    }
