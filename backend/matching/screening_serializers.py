from rest_framework import serializers
from core.serializers import WhitelistUpdateMixin
from .models import MedicalScreening


class ScreeningDecisionSerializer(WhitelistUpdateMixin, serializers.ModelSerializer):
    screening_status = serializers.ChoiceField(choices=['APPROVED', 'REJECTED'])
    screened_by = serializers.CharField(max_length=100, allow_blank=False)

    class Meta:
        model = MedicalScreening
        fields = ['screening_status', 'hemoglobin', 'blood_pressure', 'pulse', 'temperature', 'weight',
                  'medical_notes', 'screened_by', 'rejection_reason']

    def validate(self, attrs):
        for field in ('hemoglobin', 'pulse', 'temperature', 'weight'):
            if isinstance(self.initial_data.get(field), bool):
                raise serializers.ValidationError({field: 'Enter a numeric measurement, not a boolean.'})
        if attrs['screening_status'] == 'REJECTED' and not attrs.get('rejection_reason', '').strip():
            raise serializers.ValidationError({'rejection_reason': 'A rejection reason is required.'})
        if attrs['screening_status'] == 'APPROVED' and attrs.get('rejection_reason', '').strip():
            raise serializers.ValidationError({'rejection_reason': 'Leave this blank for an approved decision.'})
        return attrs


class ScreeningRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicalScreening
        fields = ['screening_id', 'screening_date', 'hemoglobin', 'blood_pressure', 'pulse', 'temperature',
                  'weight', 'medical_notes', 'screening_status', 'rejection_reason', 'screened_by']
        read_only_fields = fields
