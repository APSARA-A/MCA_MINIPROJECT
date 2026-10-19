from rest_framework import serializers
from matching.models import DonorRequestMatch
from requests_app.workflow import ACTIVE_STATUSES

RESPONDABLE_STATUSES = frozenset({'IDENTIFIED', 'CONTACTED', 'AVAILABLE', 'UNAVAILABLE'})


class DonorResponseSerializer(serializers.Serializer):
    response = serializers.ChoiceField(choices=['AVAILABLE', 'NOT_AVAILABLE'])

    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) - {'response'}:
            raise serializers.ValidationError({'detail': 'Only the response field is accepted.'})
        return super().to_internal_value(data)


class MatchResponseSerializer(serializers.ModelSerializer):
    request_id = serializers.IntegerField(source='emergency_request_id', read_only=True)
    hospital_name = serializers.CharField(source='emergency_request.hospital.hospital_name', read_only=True)
    required_blood_group = serializers.CharField(source='emergency_request.required_blood_group', read_only=True)
    urgency = serializers.CharField(source='emergency_request.urgency', read_only=True)
    request_status = serializers.CharField(source='emergency_request.status', read_only=True)
    request_created_at = serializers.DateTimeField(source='emergency_request.created_at', read_only=True)
    can_respond = serializers.SerializerMethodField()

    class Meta:
        model = DonorRequestMatch
        fields = ['match_id', 'request_id', 'hospital_name', 'required_blood_group', 'urgency',
                  'request_status', 'request_created_at', 'match_status', 'donor_response',
                  'notification_status', 'created_at', 'responded_at', 'can_respond']
        read_only_fields = fields

    def get_can_respond(self, obj):
        return obj.emergency_request.status in ACTIVE_STATUSES and obj.match_status in RESPONDABLE_STATUSES
