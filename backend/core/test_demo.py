import io
import os
from unittest.mock import patch
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from donors.models import DonationHistory
from matching.models import DonorRequestMatch, MedicalScreening
from requests_app.models import EmergencyRequest
from ml_prediction.services.predictor import predict_donation_propensity
from django.utils import timezone

class DemoIsolationTests(TestCase):
    def test_commands_reject_non_demo_environment_before_writing(self):
        for command in ('seed_demo_data','seed_sample_data'):
            with self.assertRaises(CommandError):call_command(command,stdout=io.StringIO())
        self.assertFalse(get_user_model().objects.exists())

    @override_settings(LIFELINK_DEMO_MODE=True)
    @patch.dict(os.environ, {'LIFELINK_DEMO_PASSWORD':'Synthetic-Local-Example-42'})
    def test_demo_is_idempotent_preserves_changes_and_uses_real_workflow(self):
        call_command('seed_demo_data',stdout=io.StringIO())
        self.assertEqual(get_user_model().objects.count(),6)
        self.assertEqual(DonorRequestMatch.objects.count(),5)
        self.assertEqual(MedicalScreening.objects.count(),1)
        self.assertEqual(DonationHistory.objects.count(),3)
        event=DonationHistory.objects.get(emergency_request__isnull=False)
        match=DonorRequestMatch.objects.get(donor=event.donor,emergency_request=event.emergency_request)
        self.assertEqual(match.match_status,'DONATED')
        self.assertEqual(event.emergency_request.status,'DONORS_CONTACTED')
        self.assertTrue(predict_donation_propensity(event.donor,timezone.localdate())['prediction_available'])
        before=list(DonationHistory.objects.values())
        request=EmergencyRequest.objects.get();request.urgency='NORMAL';request.save()
        call_command('seed_demo_data',stdout=io.StringIO())
        self.assertEqual(before,list(DonationHistory.objects.values()))
        self.assertEqual(EmergencyRequest.objects.get().urgency,'NORMAL')

    @override_settings(LIFELINK_DEMO_MODE=True)
    @patch.dict(os.environ, {'LIFELINK_DEMO_PASSWORD':'Synthetic-Local-Example-42'})
    def test_existing_account_collision_never_overwrites(self):
        user=get_user_model().objects.create_user(username='lifelink-demo-hospital',password='unchanged')
        with self.assertRaises(CommandError):call_command('seed_demo_data',stdout=io.StringIO())
        user.refresh_from_db();self.assertTrue(user.check_password('unchanged'))
        self.assertEqual(get_user_model().objects.count(),1)
