from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase, SimpleTestCase, override_settings
from django.utils import timezone
from core.testing import make_donor, make_hospital, make_request
from donors.models import DonationHistory
from .services.compatibility import get_compatible_donor_groups, is_blood_compatible
from .services.distance import calculate_distance_km
from .services.eligibility import calculate_age, evaluate_donor_prescreening
from .services.matching_engine import find_matching_donors


class CompatibilityTests(SimpleTestCase):
    def test_all_recipients(self):
        expected = {'O-': {'O-'}, 'O+': {'O-', 'O+'}, 'A-': {'A-', 'O-'},
                    'A+': {'A-', 'A+', 'O-', 'O+'}, 'B-': {'B-', 'O-'},
                    'B+': {'B-', 'B+', 'O-', 'O+'}, 'AB-': {'AB-', 'A-', 'B-', 'O-'},
                    'AB+': {'O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'}}
        for recipient, groups in expected.items():
            with self.subTest(recipient=recipient):
                self.assertEqual(set(get_compatible_donor_groups(recipient)), groups)
                for donor in expected:
                    self.assertEqual(is_blood_compatible(donor, recipient), donor in groups)

    def test_direction(self):
        self.assertTrue(is_blood_compatible('O-', 'AB+'))
        self.assertFalse(is_blood_compatible('AB+', 'O-'))

    def test_unknown(self):
        for group in ('X', '', None):
            with self.assertRaises(ValueError):
                get_compatible_donor_groups(group)
            with self.assertRaises(ValueError):
                is_blood_compatible(group, 'O+')


class DistanceTests(SimpleTestCase):
    def test_same_and_zero_coordinates(self):
        self.assertEqual(calculate_distance_km(Decimal('0'), Decimal('0'), 0, 0), 0)

    def test_known_pair(self):
        self.assertAlmostEqual(calculate_distance_km(0, 0, 0, 1), 111.1949, places=3)
        self.assertAlmostEqual(calculate_distance_km(51.5074, -0.1278, 48.8566, 2.3522), 343.56, delta=1)

    def test_invalid_and_missing(self):
        for pair in ((91, 0), (-91, 0), (0, 181), (0, -181), (None, 0), (0, None),
                     (float('nan'), 0), (0, float('inf')), (True, 0), ('bad', 0)):
            with self.subTest(pair=pair), self.assertRaises(ValueError):
                calculate_distance_km(*pair, 0, 0)

    def test_antipodal(self):
        self.assertAlmostEqual(calculate_distance_km(0, 0, 0, 180), 20015.0868, places=3)


class EligibilityTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.donor = make_donor(latitude=0, longitude=0)
        self.hospital = make_hospital()

    def evaluate(self):
        return evaluate_donor_prescreening(self.donor, self.today)

    def donation(self, days=10, status='COMPLETED'):
        return DonationHistory.objects.create(donor=self.donor, hospital=self.hospital,
            donation_date=self.today - timedelta(days=days), blood_group=self.donor.blood_group,
            status=status)

    def test_age_birthday(self):
        self.assertEqual(calculate_age(date(2000, 10, 12), date(2026, 10, 11)), 25)
        self.assertEqual(calculate_age(date(2000, 10, 11), date(2026, 10, 11)), 26)
        self.assertEqual(calculate_age(date(2000, 2, 29), date(2026, 2, 28)), 25)
        self.assertIsNone(calculate_age(date(2030, 1, 1), date(2026, 1, 1)))

    def test_age_range(self):
        for dob in (date(self.today.year - 17, 1, 1), date(self.today.year - 61, 1, 1)):
            self.donor.date_of_birth = dob
            self.assertFalse(self.evaluate()['eligible_for_contact'])

    def test_inactive_accounts(self):
        self.donor.is_active = False
        self.assertFalse(self.evaluate()['eligible_for_contact'])
        self.donor.is_active = True
        self.donor.user.is_active = False
        self.assertFalse(self.evaluate()['eligible_for_contact'])

    def test_missing_optional_data_is_reviewable_not_clearance(self):
        result = self.evaluate()
        self.assertTrue(result['eligible_for_contact'])
        self.assertTrue(result['screening_required'])
        self.assertEqual(result['outcome'], 'REVIEW_REQUIRED')
        self.assertGreaterEqual(len(result['warnings']), 2)

    @override_settings(MATCHING_MIN_WEIGHT_KG=50)
    def test_optional_weight_policy(self):
        self.assertTrue(self.evaluate()['eligible_for_contact'])
        self.donor.weight_kg = Decimal('49')
        self.assertFalse(self.evaluate()['eligible_for_contact'])
        self.donor.weight_kg = Decimal('50')
        self.assertTrue(self.evaluate()['eligible_for_contact'])

    def test_medical_text_requires_review_without_keyword_clearance(self):
        for text in ('None', 'healthy', 'some condition'):
            self.donor.medical_condition = text
            result = self.evaluate()
            self.assertFalse(result['eligible_for_contact'])
            self.assertEqual(result['outcome'], 'REVIEW_REQUIRED')
            self.assertNotIn(text, str(result))

    def test_interval_completed_and_boundaries(self):
        for gender, days in (('MALE', 90), ('FEMALE', 120)):
            self.donor.gender = gender
            record = self.donation(days=days - 1)
            self.assertFalse(self.evaluate()['eligible_for_contact'])
            record.donation_date = self.today - timedelta(days=days)
            record.save()
            self.assertTrue(self.evaluate()['eligible_for_contact'])
            record.delete()

    def test_noncompleted_and_future_records_ignored(self):
        for status in ('CANCELLED', 'REJECTED'):
            self.donation(status=status)
        self.donation(days=-10)
        self.assertTrue(self.evaluate()['eligible_for_contact'])

    def test_latest_completed_is_used(self):
        self.donation(days=300)
        self.donation(days=10)
        self.assertFalse(self.evaluate()['eligible_for_contact'])

    def test_unknown_interval_policy(self):
        self.donor.gender = 'OTHER'
        self.donation(days=300)
        self.assertEqual(self.evaluate()['outcome'], 'REVIEW_REQUIRED')
        self.assertFalse(self.evaluate()['eligible_for_contact'])

    def test_location_missing(self):
        self.donor.latitude = None
        self.assertFalse(self.evaluate()['eligible_for_contact'])


class EngineTests(TestCase):
    def setUp(self):
        self.emergency = make_request(latitude=0, longitude=0)

    def test_radius_filter_sort_and_zero(self):
        far = make_donor(latitude=0, longitude=Decimal('.3'))
        near = make_donor(latitude=0, longitude=Decimal('.01'))
        same = make_donor(latitude=0, longitude=0, blood_group='O-')
        make_donor(latitude=None, longitude=None)
        make_donor(latitude=0, longitude=0, blood_group='AB+')
        rows = find_matching_donors(self.emergency, 5)
        self.assertEqual([row['donor'].pk for row in rows], [same.pk, near.pk])
        self.assertEqual(len(find_matching_donors(self.emergency, 50)), 3)
        self.assertEqual(find_matching_donors(self.emergency, 50)[-1]['donor'].pk, far.pk)

    def test_inactive_and_recent_excluded(self):
        make_donor(latitude=0, longitude=0, is_active=False)
        inactive = make_donor(latitude=0, longitude=0)
        inactive.user.is_active = False
        inactive.user.save()
        recent = make_donor(latitude=0, longitude=0)
        DonationHistory.objects.create(donor=recent, hospital=self.emergency.hospital,
            donation_date=timezone.localdate(), blood_group='O+', status='COMPLETED')
        self.assertEqual(find_matching_donors(self.emergency), [])

    def test_invalid_radius_location_and_status(self):
        for radius in (0, 30, -1, True):
            with self.assertRaises(ValueError):
                find_matching_donors(self.emergency, radius)
        for state in ('CANCELLED', 'FULFILLED', 'CLOSED'):
            self.emergency.status = state
            with self.assertRaises(ValueError):
                find_matching_donors(self.emergency)
        self.emergency.status = 'OPEN'
        self.emergency.latitude = None
        with self.assertRaises(ValueError):
            find_matching_donors(self.emergency)

    def test_no_n_plus_one_history_queries(self):
        for _ in range(8):
            make_donor(latitude=0, longitude=0)
        with self.assertNumQueries(2):
            self.assertEqual(len(find_matching_donors(self.emergency)), 8)
