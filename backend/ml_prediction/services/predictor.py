"""Trusted, read-only Random Forest inference. No fitting or invented fallback values."""
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
import warnings
import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.exceptions import InconsistentVersionWarning
from .features import FEATURE_NAMES, extract_donor_features

MODEL_PATH = Path(__file__).resolve().parents[1] / 'models' / 'match4life_donation_model.pkl'
MODEL_SHA256 = '871a86b9e1b2e140ab2c3782b92daa072d722f2fb4a4960effc351c95168b70c'
MODEL_VERSION = '1.6.1'
MODEL_NAME = 'Random Forest'


class ModelUnavailable(Exception):
    """Public reason code only; underlying paths and exceptions stay private."""


def verify_model(model):
    if not isinstance(model, RandomForestClassifier):
        raise ModelUnavailable('MODEL_METADATA_MISMATCH')
    if model.n_estimators != 300 or len(getattr(model, 'estimators_', ())) != 300:
        raise ModelUnavailable('MODEL_METADATA_MISMATCH')
    if getattr(model, 'n_features_in_', None) != 3 or list(getattr(model, 'feature_names_in_', ())) != list(FEATURE_NAMES):
        raise ModelUnavailable('MODEL_FEATURE_MISMATCH')
    classes = list(getattr(model, 'classes_', ()))
    if len(classes) != 2 or set(classes) != {0, 1} or not callable(getattr(model, 'predict_proba', None)):
        raise ModelUnavailable('MODEL_METADATA_MISMATCH')
    return classes.index(1)


@lru_cache(maxsize=1)
def _model_state():
    # Cache success and failure per worker. Restart after installing/restoring the model.
    if sklearn.__version__ != MODEL_VERSION:
        return None, 'MODEL_VERSION_MISMATCH'
    try:
        if sha256(MODEL_PATH.read_bytes()).hexdigest() != MODEL_SHA256:
            return None, 'MODEL_INTEGRITY_MISMATCH'
        with warnings.catch_warnings():
            warnings.simplefilter('error', InconsistentVersionWarning)
            model = joblib.load(MODEL_PATH)
        verify_model(model)
        return model, None
    except FileNotFoundError:
        return None, 'MODEL_FILE_MISSING'
    except InconsistentVersionWarning:
        return None, 'MODEL_VERSION_MISMATCH'
    except ModelUnavailable as exc:
        return None, str(exc)
    except Exception:
        return None, 'MODEL_LOAD_FAILED'


def load_model():
    model, reason = _model_state()
    if reason:
        raise ModelUnavailable(reason)
    return model


def model_health():
    _, reason = _model_state()
    return {'model_name': MODEL_NAME, 'model_available': reason is None,
            'unavailable_reason': reason}


def unavailable(reason, features=None):
    return {'prediction_available': False, 'model_name': MODEL_NAME,
            'donation_probability': None, 'predicted_class': None,
            'features': features, 'reason': reason}


def predict_donation_propensity(donor, reference_date):
    extracted = extract_donor_features(donor, reference_date)
    if not extracted['features_available']:
        return unavailable(extracted['reason'])
    features = extracted['features']
    try:
        model = load_model()
        positive_index = list(model.classes_).index(1)
        frame = pd.DataFrame([features], columns=list(FEATURE_NAMES))
        predicted = np.asarray(model.predict(frame))
        probabilities = np.asarray(model.predict_proba(frame), dtype=float)
        if predicted.shape != (1,) or predicted[0] not in (0, 1) or probabilities.shape != (1, 2):
            return unavailable('INVALID_MODEL_OUTPUT', features)
        if not np.all(np.isfinite(probabilities)) or np.any(probabilities < 0) or np.any(probabilities > 1) or not np.isclose(probabilities.sum(), 1):
            return unavailable('INVALID_MODEL_OUTPUT', features)
        return {'prediction_available': True, 'model_name': MODEL_NAME,
                'donation_probability': float(probabilities[0, positive_index]),
                'predicted_class': int(predicted[0]), 'features': features, 'reason': None}
    except ModelUnavailable as exc:
        return unavailable(str(exc), features)
    except Exception:
        return unavailable('PREDICTION_FAILED', features)
