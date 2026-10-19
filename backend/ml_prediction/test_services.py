from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
import pandas as pd
from django.test import SimpleTestCase, TestCase
from sklearn.ensemble import RandomForestClassifier
from core.testing import make_donor, make_hospital
from donors.models import DonationHistory
from .services import predictor
from .services.features import DAYS_PER_MONTH, extract_donor_features, with_donation_features
from .services.ranking import rank_predictions


class FeatureTests(TestCase):
    def setUp(self):
        self.today = date(2026, 10, 11)
        self.donor = make_donor()
        self.hospital = make_hospital()

    def donation(self, days, status='COMPLETED', units=1):
        return DonationHistory.objects.create(donor=self.donor, hospital=self.hospital,
            blood_group='O+', donation_date=self.today - timedelta(days=days), status=status, units_donated=units)

    def test_recency_frequency_time_and_units(self):
        for days in (730, 365, 122): self.donation(days, units=3)
        features = extract_donor_features(self.donor, self.today)['features']
        self.assertAlmostEqual(features['Recency'], 122 / DAYS_PER_MONTH)
        self.assertEqual(features['Frequency'], 3)
        self.assertAlmostEqual(features['Time'], 730 / DAYS_PER_MONTH)
        self.assertEqual(list(features), ['Recency', 'Frequency', 'Time'])

    def test_cancelled_rejected_future_ignored(self):
        self.donation(122)
        self.donation(5, 'CANCELLED')
        self.donation(2, 'REJECTED')
        self.donation(-10)
        features = extract_donor_features(self.donor, self.today)['features']
        self.assertEqual(features['Frequency'], 1)
        self.assertEqual(features['Recency'], features['Time'])

    def test_today_counts_zero_elapsed_months(self):
        self.donation(0)
        self.assertEqual(extract_donor_features(self.donor, self.today)['features'],
                         {'Recency': 0, 'Frequency': 1, 'Time': 0})

    def test_no_usable_history(self):
        self.donation(2, 'CANCELLED')
        self.donation(-2)
        result = predictor.predict_donation_propensity(self.donor, self.today)
        self.assertFalse(result['prediction_available'])
        self.assertIsNone(result['donation_probability'])
        self.assertIsNone(result['features'])
        self.assertEqual(result['reason'], 'INSUFFICIENT_DONATION_HISTORY')

    def test_annotation_queries_and_reference_date_guard(self):
        self.donation(122)
        donor = with_donation_features(type(self.donor).objects.filter(pk=self.donor.pk), self.today).get()
        with self.assertNumQueries(0):
            self.assertEqual(extract_donor_features(donor, self.today)['features']['Frequency'], 1)
        with self.assertNumQueries(1):
            self.assertFalse(extract_donor_features(donor, self.today - timedelta(days=200))['features_available'])

    def test_real_model_output_matches_class_one_probability(self):
        for days in (730, 365, 122): self.donation(days)
        result = predictor.predict_donation_propensity(self.donor, self.today)
        self.assertTrue(result['prediction_available'])
        model = predictor.load_model()
        frame = pd.DataFrame([result['features']], columns=['Recency', 'Frequency', 'Time'])
        self.assertAlmostEqual(result['donation_probability'], float(model.predict_proba(frame)[0, list(model.classes_).index(1)]))
        self.assertIn(result['predicted_class'], (0, 1))
        self.assertGreaterEqual(result['donation_probability'], 0)
        self.assertLessEqual(result['donation_probability'], 1)

    def test_positive_class_index_is_not_assumed(self):
        self.donation(122)
        fake = SimpleNamespace(classes_=np.array([1, 0]), predict=lambda frame: np.array([1]),
            predict_proba=lambda frame: np.array([[.8, .2]]))
        with patch.object(predictor, 'load_model', return_value=fake):
            self.assertEqual(predictor.predict_donation_propensity(self.donor, self.today)['donation_probability'], .8)

    def test_failures_and_invalid_output_are_safe(self):
        self.donation(122)
        for probabilities in ([1.1, -.1], [float('nan'), .5], [.2, .2]):
            fake = SimpleNamespace(classes_=np.array([0, 1]), predict=lambda frame: np.array([1]),
                predict_proba=lambda frame: np.array([probabilities]))
            with patch.object(predictor, 'load_model', return_value=fake):
                result = predictor.predict_donation_propensity(self.donor, self.today)
                self.assertEqual(result['reason'], 'INVALID_MODEL_OUTPUT')
                self.assertIsNone(result['donation_probability'])
        with patch.object(predictor, 'load_model', side_effect=RuntimeError('private stack /path/secret')):
            result = predictor.predict_donation_propensity(self.donor, self.today)
            self.assertEqual(result['reason'], 'PREDICTION_FAILED')
            self.assertNotIn('private', str(result))


class ModelTests(SimpleTestCase):
    def tearDown(self): predictor._model_state.cache_clear()

    def test_actual_metadata_and_cached_loading(self):
        predictor._model_state.cache_clear()
        with patch.object(predictor.joblib, 'load', wraps=predictor.joblib.load) as loader:
            model = predictor.load_model()
            self.assertIs(model, predictor.load_model())
            self.assertEqual(loader.call_count, 1)
        self.assertIsInstance(model, RandomForestClassifier)
        self.assertEqual(model.n_estimators, 300)
        self.assertEqual(len(model.estimators_), 300)
        self.assertEqual(model.n_features_in_, 3)
        self.assertEqual(list(model.feature_names_in_), ['Recency', 'Frequency', 'Time'])
        self.assertEqual(list(model.classes_), [0, 1])
        self.assertEqual(predictor.verify_model(model), 1)

    def test_missing_version_errors_and_failure_cache(self):
        predictor._model_state.cache_clear()
        with patch.object(predictor, 'MODEL_PATH', Path('/nonexistent/qa-model.pkl')):
            for _ in range(2):
                with self.assertRaisesMessage(predictor.ModelUnavailable, 'MODEL_FILE_MISSING'): predictor.load_model()
            self.assertEqual(predictor._model_state.cache_info().misses, 1)
        predictor._model_state.cache_clear()
        with patch.object(predictor.sklearn, '__version__', 'wrong'):
            self.assertEqual(predictor.model_health()['unavailable_reason'], 'MODEL_VERSION_MISMATCH')

    def test_integrity_failure_prevents_loading(self):
        predictor._model_state.cache_clear()
        with patch.object(predictor, 'MODEL_SHA256', 'wrong'), patch.object(predictor.joblib, 'load') as loader:
            self.assertEqual(predictor.model_health()['unavailable_reason'], 'MODEL_INTEGRITY_MISMATCH')
            loader.assert_not_called()

    def test_corrupt_load_sanitized(self):
        predictor._model_state.cache_clear()
        with patch.object(predictor.joblib, 'load', side_effect=RuntimeError('Private error')):
            self.assertEqual(predictor.model_health()['unavailable_reason'], 'MODEL_LOAD_FAILED')

    def test_feature_order_rejected(self):
        model = predictor.load_model()
        with patch.object(model, 'feature_names_in_', np.array(['Frequency', 'Recency', 'Time'])):
            with self.assertRaisesMessage(predictor.ModelUnavailable, 'MODEL_FEATURE_MISMATCH'): predictor.verify_model(model)


class RankingTests(SimpleTestCase):
    def rows(self):
        return [
            {'match_id': 1, '_distance': 1, 'eligible_for_contact': True, 'prediction_available': True, 'donation_probability': .1},
            {'match_id': 2, '_distance': 2, 'eligible_for_contact': True, 'prediction_available': True, 'donation_probability': .9},
            {'match_id': 3, '_distance': .5, 'eligible_for_contact': True, 'prediction_available': False, 'donation_probability': None},
            {'match_id': 4, '_distance': .1, 'eligible_for_contact': False, 'prediction_available': True, 'donation_probability': 1},
        ]

    def test_nearest_full_precision(self):
        self.assertEqual([r['match_id'] for r in rank_predictions(self.rows(), 'NEAREST')], [4, 3, 1, 2])
        rows = self.rows(); rows[0]['_distance'], rows[1]['_distance'] = 1.2344, 1.2333
        order = [r['match_id'] for r in rank_predictions(rows, 'NEAREST')]
        self.assertLess(order.index(2), order.index(1))

    def test_propensity_retains_unscored_without_promoting_ineligible(self):
        self.assertEqual([r['match_id'] for r in rank_predictions(self.rows(), 'PROPENSITY')], [2, 1, 3, 4])

    def test_combined_respects_eligibility_and_bands(self):
        self.assertEqual([r['match_id'] for r in rank_predictions(self.rows(), 'COMBINED')], [2, 1, 3, 4])
        rows = self.rows(); rows[1]['_distance'] = 6
        self.assertEqual([r['match_id'] for r in rank_predictions(rows, 'COMBINED')], [1, 3, 2, 4])
