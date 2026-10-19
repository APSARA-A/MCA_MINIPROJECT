from rest_framework import serializers
from django.utils import timezone
from core.choices import BloodGroup
from core.serializers import WhitelistUpdateMixin
from .models import DonationHistory


class ExplicitConfirmation(serializers.BooleanField):
    def to_internal_value(self, data):
        if data is not True:
            self.fail('invalid')
        return True


class DonationCompleteSerializer(WhitelistUpdateMixin, serializers.Serializer):
    donation_date = serializers.DateField()
    units_donated = serializers.IntegerField(min_value=1, max_value=50)
    blood_group = serializers.ChoiceField(choices=BloodGroup.choices, required=False)
    confirmed_completed = ExplicitConfirmation()

    def validate(self, attrs):
        if attrs['donation_date'] > timezone.localdate():
            raise serializers.ValidationError({'donation_date': 'Donation date cannot be in the future.'})
        if isinstance(self.initial_data.get('units_donated'), bool):
            raise serializers.ValidationError({'units_donated': 'Enter a whole number of units.'})
        return attrs


class FulfillSerializer(WhitelistUpdateMixin, serializers.Serializer):
    confirmed_fulfillment = ExplicitConfirmation()


class DonationHistorySerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(source='hospital.hospital_name', read_only=True)
    request_id = serializers.IntegerField(source='emergency_request_id', read_only=True, allow_null=True)

    class Meta:
        model = DonationHistory
        fields = ['donation_id', 'donation_date', 'hospital_name', 'request_id', 'blood_group', 'units_donated', 'status']
        read_only_fields = fields


class HospitalDonationHistorySerializer(DonationHistorySerializer):
    donor_name = serializers.CharField(source='donor.full_name', read_only=True)

    class Meta(DonationHistorySerializer.Meta):
        fields = [*DonationHistorySerializer.Meta.fields, 'donor_name']
        read_only_fields = fields
