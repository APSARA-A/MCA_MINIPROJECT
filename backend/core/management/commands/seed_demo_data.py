"""Fictional, isolated, repeatable demonstration through existing workflow services."""
import getpass
import os
from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from core.demo import require_isolated_demo
from donors.models import Donor, DonationHistory
from donors.donation_services import complete_donation
from hospitals.models import Hospital
from matching.models import DonorRequestMatch
from matching.screening_services import mark_arrived, start_screening, decide_screening
from matching.services.matching_engine import find_matching_donors
from requests_app.models import EmergencyRequest

MARKER = 'LIFELINK-SYNTHETIC-DEMO-v1'
ACCOUNTS = ['hospital', 'history', 'new', 'available', 'unavailable', 'completed']

class Command(BaseCommand):
    help = 'Seed fictional demo accounts into an explicitly isolated SQLite database; never overwrites existing accounts.'

    @transaction.atomic
    def handle(self, *args, **options):
        require_isolated_demo()
        User = get_user_model()
        names = [f'lifelink-demo-{key}' for key in ACCOUNTS]
        existing = list(User.objects.filter(username__in=names).values_list('username', flat=True))
        if existing:
            if len(existing) == len(names) and EmergencyRequest.objects.filter(patient_reference=MARKER, hospital__user__username=names[0]).exists():
                self.stdout.write('Demo already exists; accounts, passwords, decisions and history were left unchanged.')
                return
            raise CommandError('Demo account collision or incomplete fixture. No records changed; choose a fresh separate demo database.')
        emails = [f'{key}@lifelink-demo.example' for key in ACCOUNTS]
        if User.objects.filter(email__in=emails).exists() or Donor.objects.filter(email__in=emails).exists() or Hospital.objects.filter(email__in=emails).exists() or Hospital.objects.filter(registration_number=MARKER).exists():
            raise CommandError('Demo identifiers are already in use. No existing records will be overwritten.')
        password = os.getenv('LIFELINK_DEMO_PASSWORD') or getpass.getpass('Choose a strong local demo password (not saved in documentation): ')
        try:
            validate_password(password)
        except ValidationError as exc:
            raise CommandError('; '.join(exc.messages)) from exc
        def user(key):
            return User.objects.create_user(username=f'lifelink-demo-{key}', email=f'{key}@lifelink-demo.example', password=password)
        hospital = Hospital.objects.create(user=user('hospital'), hospital_name='SYNTHETIC Demo Hospital', registration_number=MARKER,
            phone_number='+12025550100', email=emails[0], address='Fictional demo location; no real facility', latitude=0, longitude=0, is_verified=True)
        donors = {}
        for index, key in enumerate(ACCOUNTS[1:], 1):
            donor = Donor(user=user(key), full_name=f'SYNTHETIC Demo {key.title()}', email=f'{key}@lifelink-demo.example',
                date_of_birth=date(1998,1,1), gender='MALE', blood_group='O+', phone_number=f'+1202555010{index}', whatsapp_number=f'+1202555010{index}',
                address='Fictional demonstration only', latitude=Decimal('0.00') + Decimal(index)/1000, longitude=0, weight_kg=60)
            donor.full_clean(); donor.save(); donors[key]=donor
        today = timezone.localdate()
        for days in (730, 200):
            event = DonationHistory(donor=donors['history'], hospital=hospital, donation_date=today-timedelta(days=days), blood_group='O+', units_donated=1, status='COMPLETED')
            event.full_clean(); event.save()
        emergency = EmergencyRequest(hospital=hospital, patient_reference=MARKER, required_blood_group='O+', units_required=2, urgency='CRITICAL', latitude=0, longitude=0)
        emergency.full_clean(); emergency.save()
        matches={}
        for candidate in find_matching_donors(emergency,25):
            donor=candidate['donor']; key=next(key for key,value in donors.items() if value.pk==donor.pk)
            match=DonorRequestMatch(emergency_request=emergency,donor=donor,distance_km=Decimal(str(candidate['distance_km'])).quantize(Decimal('.01')),system_eligible=True)
            match.full_clean();match.save();matches[key]=match
        # These are explicitly synthetic scenario states, not delivery evidence.
        emergency.status='DONORS_CONTACTED';emergency.save(update_fields=['status','updated_at'])
        for key in ('available','completed'):
            match=matches[key];match.donor_response='AVAILABLE';match.match_status='AVAILABLE';match.responded_at=timezone.now();match.save()
        match=matches['unavailable'];match.donor_response='NOT_AVAILABLE';match.match_status='UNAVAILABLE';match.responded_at=timezone.now();match.save()
        match=matches['history'];match.match_status='CONTACTED';match.save(update_fields=['match_status'])
        completed=mark_arrived(matches['completed']);completed=start_screening(completed)
        completed=decide_screening(completed, {'screening_status':'APPROVED','screened_by':'SYNTHETIC Demo Staff', 'medical_notes':'Synthetic demonstration decision, not a real clinical record. Measurements intentionally omitted.'})
        complete_donation(completed, {'donation_date':today,'units_donated':1,'blood_group':'O+','confirmed_completed':True})
        self.stdout.write(self.style.SUCCESS('Isolated synthetic demo ready. Logins: '+', '.join(emails)+'. Password was supplied locally and is not printed.'))
