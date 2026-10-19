# Iteration 7 verification — 2026-10-11

## Model verified in the installed project environment

The supplied binary is used without retraining: sklearn.ensemble.RandomForestClassifier (not a Pipeline), 300 configured and fitted trees, three inputs in exact order Recency, Frequency, Time, classes [0, 1], predict and predict_proba available. scikit-learn 1.6.1 loads it without compatibility warnings. Python 3.12.14 was used for verification.

SHA-256: 871a86b9e1b2e140ab2c3782b92daa072d722f2fb4a4960effc351c95168b70c.

## Implementation

Completed, nonfuture DonationHistory events supply Frequency (event count), Recency (days since last donation / 30.4375), and Time (days since first donation / 30.4375). Fractional months are retained. Missing completed history produces a null score and INSUFFICIENT_DONATION_HISTORY. Cancelled/rejected/future records do not contribute. Query annotations avoid per-donor history queries.

The cached, hash-checked loader validates the exact model metadata and sklearn version; failures are cached and reported safely. Prediction uses a named, ordered pandas DataFrame and selects positive class 1 by looking up classes_. Scores are computed dynamically, never written to a prediction table.

GET /api/ml/requests/{request_id}/predictions/ requires JWT and the owning verified, active hospital. It reuses existing hospital access, compatibility, eligibility and stored-match logic, omits private medical details and raw features, retains low-scoring/unscored donors, and performs no database writes.

React adds optional analysis, loading/errors, actual one-decimal percentages and explicit unavailable labels. Default nearest ordering uses full distance. Propensity ranking separates unscored donors. Combined priority uses preliminary contact rules, 5 km distance bands, then score availability/probability, exact distance and match ID. This deterministic heuristic is experimental. Radius changes and regeneration invalidate scores; stale requests are ignored. Existing review-only and historical matches remain visible.

## Actual executed checks

- Django check: passed, no issues.
- makemigrations --check --dry-run: passed, no changes.
- ML backend suite: 26 passed (12.447 seconds).
- Full backend suite: 204 passed (87.944 seconds), including the previous 178 tests.
- Frontend suite: 119 passed in 12 files.
- npm run build: passed (Vite 8.3.4).
- npm run lint: passed.
- Chromium browser against real Django and React: passed real JWT login, match generation, actual model predictions, all ranking modes, missing-history visibility, radius/history handling and score invalidation. No console/page errors. At 390 px mobile viewport, document width was 390 px. Desktop and mobile screenshots were inspected.
- Browser fixture model outputs: 0.5605317192269871 and 0.6433333333333333; displayed 56.1% and 64.3%. New donor returned null. These belong only to isolated QA fixtures, which are excluded from the deliverable.
- Prediction API tests compare full database state before/after, verify unchanged responses/statuses and no duplicated matches, and exercise JWT/ownership/role restrictions.
- Original models and migration files are unchanged; every original archive file is retained. No schema changes.

## Remaining issue and installation

The model records feature names, but does not record how training converted dates to months. The implementation documents days / 30.4375; confirm this against the original training notebook before deployment. The output is an experimental historical donation propensity estimate, with no claimed emergency-response calibration or accuracy.

Use Python 3.12 and install backend/requirements.txt in a compatible environment, then follow README. Preserve the existing deployment db.sqlite3 and .env when updating; neither is packaged. No WhatsApp, medical screening implementation, retraining or Iteration 8 was added.

## Changed files relative to Iteration 6

- README.md
- backend/config/urls.py
- backend/matching/views.py
- backend/ml_prediction/views.py
- backend/requirements.txt
- frontend/src/__tests__/matching.test.jsx
- frontend/src/pages/HospitalDonorMatches.jsx
- frontend/src/styles/dashboard.css

## Added files

- backend/ml_prediction/models/match4life_donation_model.pkl
- backend/ml_prediction/serializers.py
- backend/ml_prediction/services/__init__.py
- backend/ml_prediction/services/features.py
- backend/ml_prediction/services/predictor.py
- backend/ml_prediction/services/ranking.py
- backend/ml_prediction/test_api.py
- backend/ml_prediction/test_services.py
- backend/ml_prediction/urls.py
- frontend/src/__tests__/mlPrediction.test.jsx
- frontend/src/__tests__/mlPredictionService.test.js
- frontend/src/services/mlPredictionService.js
- ITERATION7_VERIFICATION.md (this report)
