# LifeLink

Smart Blood Donor Matching and Donation Propensity Prediction Using Machine Learning.

**Stack:** React (Vite) · Django + DRF · SQLite · SimpleJWT · scikit-learn

## Prerequisites (Windows 11)

- Python 3.12 recommended (Iteration 7 tested with Python 3.12.14; use this version for the pinned ML dependencies): `python --version`
- Node.js 20.19+ or 22.12+ (tested with Node.js 24.19.0): `node --version`

## Backend setup (PowerShell)

```powershell
cd LifeLink\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

If activation is blocked, run once:
`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

Test: open http://127.0.0.1:8000/api/health/ and expect `{"status": "ok", "project": "LifeLink"}`.

## Frontend setup (PowerShell, second terminal)

```powershell
cd LifeLink\frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open http://localhost:5173 and look for **Backend connected**.

## Project layout

- `backend/config` Django settings and root URLs
- `backend/core` health endpoint
- `backend/users, donors, hospitals, requests_app, matching, ml_prediction, notifications_app` authentication, profiles, requests, matching, ML and manual contact/response APIs
- `frontend/src` components, pages, services (API calls), styles

## Environment variables

Backend `backend/.env`: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`
Frontend `frontend/.env`: `VITE_API_BASE_URL`

## Iteration 2: database models and admin

```powershell
cd LifeLink\backend
.\.venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_sample_data   # only in an explicitly isolated demo database; see PROJECT_DEMO_GUIDE.md
python manage.py test
python manage.py runserver 127.0.0.1:8000
```

Admin: http://127.0.0.1:8000/admin/ (Donors, Donation history, Hospitals, Emergency requests, Donor request matches, Medical screenings).
To verify hospitals: Hospitals list, tick rows, choose "Verify selected hospitals".

## Iteration 3: registration, login and roles

First, set a long secret key in `backend\.env` (the JWT signing key is derived from it):

```powershell
cd LifeLink\backend
python -c "import secrets; print(secrets.token_urlsafe(64))"   # paste into DJANGO_SECRET_KEY in .env
```

Admin sign-in uses the **email** on the superuser account. If yours has none, add it in Django Admin (Users) first.

Run (two terminals):

```powershell
# Terminal 1
cd LifeLink\backend; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt; python manage.py runserver 127.0.0.1:8000
# Terminal 2
cd LifeLink\frontend; npm install; Copy-Item .env.example .env -ErrorAction SilentlyContinue; npm run dev
```

Tests:

```powershell
cd LifeLink\backend; python manage.py test      # Django
cd LifeLink\frontend; npm test                  # Vitest
```

API: `POST /api/auth/register/donor/`, `POST /api/auth/register/hospital/`, `POST /api/auth/login/`,
`GET /api/auth/me/`, `POST /api/auth/token/refresh/`, `GET /api/donors/me/` (donors only), `GET /api/hospitals/me/` (hospitals only).

Security notes (local MVP, not production-ready):
- JWTs are kept in `sessionStorage`, readable by any script on the page (XSS). Production should use httpOnly SameSite cookies.
- Logout only clears tokens in the browser; refresh tokens are not blacklisted server-side. Access tokens last 15 minutes, refresh tokens 1 day.
- Login is limited to 10 attempts per minute and registration to 20 per hour per client.
- Hospitals can only be verified through Django Admin (Hospitals list, "Verify selected hospitals").

## Iteration 4: homepage, dashboards and profile management

New routes: `/donor/profile`, `/hospital/profile` (plus the existing dashboards, now with a sidebar layout).
New API: `PATCH /api/donors/me/` (full name, phone, WhatsApp, address, weight, medical condition, location) and
`PATCH /api/hospitals/me/` (phone, address, location). Any other field in the request body is rejected with HTTP 400.

Verify:

```powershell
cd LifeLink\backend
python manage.py check
python manage.py test
python manage.py makemigrations --check --dry-run   # expect: No changes detected
cd ..\frontend
npm test
npm run build
```

No database changes in this iteration: do not delete `db.sqlite3` or any migration.

## Iteration 5: emergency blood requests

Verified hospitals only. All endpoints require a JWT; the hospital is always taken from the token.

| Method and path | Purpose |
|---|---|
| `POST /api/emergency-requests/` | Create (always starts as OPEN; hospital and status cannot be sent) |
| `GET /api/emergency-requests/` | Own requests, newest first. Filters: `status`, `urgency`, `required_blood_group`, `page` |
| `GET /api/emergency-requests/summary/` | `total_requests`, `open_requests`, `critical_requests` (critical and still active) |
| `GET /api/emergency-requests/{id}/` | Details (404 for another hospital's request) |
| `PATCH /api/emergency-requests/{id}/` | Edit patient_reference, blood group, units, urgency, location; OPEN requests only (409 otherwise) |
| `POST /api/emergency-requests/{id}/cancel/` | Cancel OPEN, MATCHING or DONORS_CONTACTED; repeat calls succeed; FULFILLED/CLOSED return 409 |

Pages: `/hospital/emergency`, `/hospital/emergency/new`, `/hospital/emergency/:id`, `/hospital/emergency/:id/edit`.

Status rules live in `backend/requests_app/workflow.py`. Iteration 6 must call `can_create_matches()` before adding a match.
No model or migration changes were needed in this iteration.


## Iteration 6: nearby donor matching

1. Sign in as an **active, verified hospital**.
2. Open Emergency Requests, select an active request, and click **Find Matching Donors**.
3. Select 5, 10, 25 or 50 km and click **Find Nearby Donors**.
4. Review nearest-first candidates, medical review flags and preserved historical matches.

| Method and path | Purpose |
|---|---|
| `POST /api/matching/requests/{id}/generate/` | Generate with `{"radius_km": 25}`; default 25 km |
| `GET /api/matching/requests/{id}/?radius_km=25` | Stored matches plus current pre-screening and radius issues |

Route: `/hospital/emergency/:id/matches`. Only the hospital that owns the request can access either API.
Another hospital receives 404. Unverified/inactive hospitals and donors are denied. Invalid radius/location
returns 400; generating against CANCELLED, FULFILLED or CLOSED returns 409. There is no match-status PATCH API.
OPEN changes to MATCHING only after a successful operation, including a successful empty result.
MATCHING can be matched again. DONORS_CONTACTED is preserved and cannot generate new matches, following the existing lifecycle policy.

### Policy and medical review

Preliminary **red-cell ABO/RhD** compatibility is checked in the donor-to-recipient direction.
Straight-line Haversine distance uses full precision for radius filtering and sorting; display/storage uses two decimals.
Missing/invalid location excludes a donor from nearby recommendations; zero latitude/longitude are valid.

Local MVP defaults: age 18–60, male whole-blood interval 90 days, female interval 120 days.
These are configurable project policies that require the collection facility's approval, not universal clinical rules.
Only the latest COMPLETED donation on or before today counts; CANCELLED, REJECTED and future-dated records do not.
DonationHistory has no component field: this iteration assumes all completed history is **whole blood**.
It must not be used for platelet/plasma interval decisions.

Missing optional weight and medical information remain **REVIEW_REQUIRED**, with hospital screening required.
They do not automatically exclude otherwise compatible, objectively unblocked donors from contact candidates.
Any nonempty medical-condition text is sent to a separate review queue; its contents are not interpreted or disclosed.
A donor with completed history and an unconfigured gender interval requires review before contact.
`system_eligible` only means the implemented preliminary contact rules passed, never medical clearance.
No donor availability/consent, ML probability, WhatsApp contact, medical approval or donation completion is fabricated.
The blood bank retains final typing, crossmatching, component selection and screening decisions.

Optional `.env` configuration:

```dotenv
MATCHING_MIN_AGE=18
MATCHING_MAX_AGE=60
MATCHING_MALE_INTERVAL_DAYS=90
MATCHING_FEMALE_INTERVAL_DAYS=120
# Optional facility-approved preliminary weight threshold; unset by default:
# MATCHING_MIN_WEIGHT_KG=50
```

### Repeated matching and response contract

Generation returns current `matches`, `review_candidates` (not saved as contact matches), and
`historical_matches` (retained records that are no longer current recommendations).
GET returns all stored records in `matches`, with `eligible_for_contact` and `current_issues` for current suitability.
`total_matches` counts the accompanying `matches` array. Review-required candidates are not medically cleared.
No contact information, donor coordinates or medical free text appears in matching responses.

The unique donor/request constraint and `get_or_create` prevent duplicates. Only untouched IDENTIFIED/PENDING/PENDING
records may have their stored distance refreshed. Responses, notification state, responded_at and advanced/manual
workflow decisions are preserved. Current distance and screening are computed for display; stale or out-of-radius
history is flagged instead of deleted. Atomic writes use a conditional request update to acquire SQLite's write
reservation before lifecycle validation and matching, rather than relying on PostgreSQL-style row locks.
The SQLite MVP loads candidate lists in memory; large-scale pagination and geographic indexing are future work.

### Updating your existing local project

Keep your existing `backend/db.sqlite3`, `.env`, migrations and virtual environment. This update requires **no new
migrations** and does not alter the original models. The uploaded Iteration 5 ZIP did not contain `db.sqlite3`;
this deliverable does not supply a replacement database or sample production donors. For a fresh installation,
run `python manage.py migrate`. For an existing installation, continue using your existing database.

Run:

```powershell
cd LifeLink\backend
python manage.py check
python manage.py test
python manage.py makemigrations --check --dry-run
cd ..\frontend
npm ci
npm test
npm run lint
npm run build
```

The existing theme fonts are now served locally, with font licenses included, so the app does not depend on Google Fonts during development.

See `ITERATION6_VERIFICATION.md` for tested results and verification limits. Iteration 7 is documented below.


## Iteration 7: Random Forest donation propensity

The supplied `match4life_donation_model.pkl` is bundled in `backend/ml_prediction/models/`.
It is a fitted RandomForestClassifier with **300 trees**, inputs exactly `Recency`, `Frequency`, `Time`,
and classes `[0, 1]`. The old ten-feature model is not used. No model training occurs in the application.

Install the updated dependencies into your existing compatible virtual environment:

```powershell
cd LifeLink\backend
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py check
python manage.py runserver 127.0.0.1:8000
```

The tested ML stack is scikit-learn 1.6.1, NumPy 2.2.6, SciPy 1.15.3, pandas 2.2.3 and joblib 1.5.3.
Django, authentication, SQLite, existing models and migrations are preserved. Use Python 3.12 for a
reproducible installation. Restart the backend after changing dependencies or restoring the model file.
A cached loader checks the exact scikit-learn version, model metadata and SHA-256 of the supplied artifact.
It caches both success and failure per worker. An unavailable model never blocks rule-based matching.
Do not upload a pickle from an untrusted source or swap the model without an explicit reviewed update.

### History features

Use only COMPLETED donation events with `donation_date <= reference_date`:

- Recency: `(reference_date - most_recent_completed_date).days / 30.4375`.
- Frequency: number of completed **events**, not units donated.
- Time: `(reference_date - first_completed_date).days / 30.4375`.

30.4375 = 365.25 / 12. Fractional months are retained; no fabricated defaults are used.
A donation today has zero elapsed months. CANCELLED/REJECTED/future records are ignored.
Without completed history, the result is unavailable with null probability, not 0%.
The artifact verifies month/event feature names but contains no date-conversion training code;
exact agreement with training rounding/calendar conventions still needs that code. This documented
average-month conversion should be checked against the training notebook before deployment.

A single batched ORM aggregation provides counts/first/last dates for all matched donors. Inference
uses a pandas DataFrame with the verified column order. Class 1 is located through `classes_`.
Every output is checked for finite probabilities within [0, 1], expected shape and valid class.
No Prediction table or new migrations are added; predictions are computed dynamically and the API
performs no match/request/status writes.

### API

`GET /api/ml/requests/{id}/predictions/?radius_km=25&ranking=NEAREST`

Only the owning verified, active hospital with JWT authentication may access it. Unauthorized hospitals
cannot see another hospital's request. Medical free text, contact details, donor coordinates and raw
history feature values are not returned in match rows.

Optional radius: 5, 10, 25 or 50 km. Optional ranking: `NEAREST`, `PROPENSITY`, `COMBINED`.
The response includes `model_available`, safe unavailable reason codes, reference date and a `predictions`
array with match ID, donor name, blood group, distance, current preliminary eligibility/review flags,
prediction availability, nullable donation probability, predicted class and original workflow statuses.
All stored matches remain visible; restricted/history records are explicitly not current recommendations.

### Ranking and interface

On the existing matching page, choose **Analyze Donation Propensity**. It fetches predictions without
regenerating matches. Percentages use one decimal place; new donors show **Insufficient Donation History**.
Missing/incompatible models and failed predictions have separate messages and no invented score.
Changing radius or regenerating matches clears old predictions. Ranking changes fetch a fresh read-only
view. Donor responses, notification state, system_eligible and match statuses are never changed by ML.

- **Nearest First** (default): exact Haversine distance, then match ID.
- **Highest Donation Propensity**: current contact-rule candidates first, scored first, probability
  descending, exact distance and match ID. The UI places unscored current donors in a separate section.
- **Combined Priority**: current contact-rule candidates first, then 5 km distance band; within each
  band, scored donors first, probability descending, exact distance, then match ID.

The combined ordering is a deterministic **experimental heuristic**, not a clinically validated score.
It does not discard low scores or unscored donors and cannot override compatibility/eligibility rules.
Full precision governs backend sorting; rounded display ties preserve the returned order in React.
The Random Forest estimate reflects historical donation patterns, not current consent, medical fitness,
availability or acceptance of an emergency request. No accuracy claims, notifications or screening
workflow were added in Iteration 7. Iteration 8 is documented below.

See `ITERATION7_VERIFICATION.md` for actual checks, changed files and remaining limitations.


## Iteration 8: manual WhatsApp contact and donor responses

Install the updated `backend/requirements.txt` (adds `phonenumbers==9.0.16`). Existing JWT,
SQLite database, models, migrations, matching and the exact Random Forest artifact remain unchanged.
No new migrations are required. Keep your existing `db.sqlite3` and `.env` when updating.

### Notification endpoints

All endpoints use the existing JWT authentication. Hospital endpoints require the owning verified,
active hospital and active Django user; donor endpoints require an active donor and active user.
Foreign matches/requests return 404, without exposing contacts or patient information.

| Method | Path | Action |
| --- | --- | --- |
| GET | `/api/notifications/matches/{id}/whatsapp-link/` | Read-only prepared URL and message, for a currently contactable match on an active request. |
| POST | `/api/notifications/matches/{id}/mark-contacted/` | Explicit confirmation of an actual contact attempt; only IDENTIFIED becomes CONTACTED. |
| POST | `/api/notifications/matches/{id}/respond/` | Owning donor submits only `{"response":"AVAILABLE"}` or `{"response":"NOT_AVAILABLE"}`. |
| GET | `/api/notifications/donor/requests/` | Own active/history lists and real actionable pending count. |
| GET | `/api/notifications/requests/{id}/responses/` | Hospital-owned real response counts and match response details. |

WhatsApp numbers are validated with phone-number metadata and normalized to international digits.
A blank WhatsApp number may fall back to the registered phone. An invalid configured WhatsApp number
returns an error. Only clearly valid Indian mobile numbers may omit +91; other international numbers
need an explicit `+country code` or `00` prefix. Valid formatting does not prove WhatsApp membership.

Prepared messages include LifeLink, hospital, blood group, urgency, request reference and hospital
address when present. They omit internal patient references and patient-identifying details.
**Contact via WhatsApp** opens only the authorized HTTPS wa.me URL in a separate tab with opener/referrer
protection. If popup blocking prevents opening, a safe **Open prepared WhatsApp message** link remains.
The hospital must manually send the message. Neither generating nor opening it updates any record,
marks contact, marks notification SENT, or proves sending/delivery. No notification logs are invented.

**Confirm Contact Attempt** asks whether contact was actually attempted. The atomic backend updates
IDENTIFIED to CONTACTED and OPEN/MATCHING to DONORS_CONTACTED. Retries and advanced match stages
preserve existing decisions and responses. Notification status and responded_at remain unchanged.
Terminal emergency requests reject contact actions. Current compatibility and preliminary contact
rules are rechecked before a new initial contact; ML probability cannot override restrictions.

### Donor response and hospital review

Route `/donor/requests` is role-protected and linked from the donor dashboard and sidebar.
The donor sees only their matched requests and can choose **I'm Available** or **Not Available**.
These set donor_response and AVAILABLE/UNAVAILABLE match status with responded_at, without changing
notification status. Identical retries retain the original timestamp. Changes are allowed only from
IDENTIFIED, CONTACTED, AVAILABLE or UNAVAILABLE while the request is active. ARRIVED, SCREENING,
APPROVED, REJECTED, DONATED and CANCELLED matches reject responses; cancelled/fulfilled/closed
requests have no active response buttons. Neither response is medical approval.

Hospital match cards retain distance, compatibility, review flags, Random Forest scores and ranking.
They show current responses and explicit labels: Matched, Contact Attempted, Donor Available,
Donor Not Available. Contacted requests remain accessible through **View Donor Matches** from details.
Response cards refresh after generation/contact confirmation, on window focus, every 30 seconds while
visible, or using **Refresh Responses**. Donor requests likewise refresh on focus/visible intervals or
manually. This is polling, not a live WebSocket feed. Response changes update cards without regenerating
matches or discarding existing ML scores.

Counts come from SQLite: total_matched is every stored match; awaiting_response counts donor_response
PENDING; available counts AVAILABLE; not_available counts NOT_AVAILABLE. NO_RESPONSE is neither
pending nor an explicit availability response. Contacted counts matches **currently** at CONTACTED.
The existing schema has no contact-attempt timestamp; later availability responses replace CONTACTED,
so this count is not a lifetime contact count or WhatsApp delivery count. Counts may overlap and include
retained history. Pending donor dashboard count includes only active, respondable PENDING matches.

Atomic writes acquire SQLite's write reservation before rereading match/request state. They preserve
advanced workflow and avoid overwriting concurrent lifecycle decisions; no reliance on PostgreSQL
row locks. No donation history or medical screening is created.

See `ITERATION8_VERIFICATION.md` for checks at the previous stage. Iteration 9 extends this workflow below. No Twilio, automatic sending or WhatsApp Business API is implemented.


## Iteration 9 — Screening, completed donations and history

Reuse the existing models and SQLite database. There are no new migrations. Run existing setup commands; do not reset your database. Existing JWT roles, matching, RF ranking, WhatsApp preparation and donor responses remain available.

Only a verified active hospital owning the emergency request can perform screening, completion or fulfillment. An AVAILABLE response allows explicit physical-arrival confirmation; ARRIVED allows a single PENDING screening record. Hospital staff enter optional actual measurements and explicitly choose APPROVED or REJECTED. Missing measurements stay unrecorded. Rejection requires a reason. Finalized decisions cannot be overwritten. Measurements are visible only through the owning hospital screening API.

Approval alone creates no donation. Physical donation confirmation requires APPROVED match and screening, AVAILABLE response, active request, valid nonfuture date on/after the screening decision's local date, and 1–50 whole units. Blood group must match the donor's recorded group. Completion atomically creates one COMPLETED DonationHistory event and marks DONATED. Identical retries return the existing record; conflicting repeats and ambiguous legacy records return 409. SQLite write reservation serializes this API workflow without introducing a duplicate model or changing the schema.

Completed units are recalculated from actual nonfuture COMPLETED records for the request. Completion never automatically fulfills it or alters other matches. Once units meet the requirement, the owning hospital must separately confirm fulfillment. Donor history contains only the authenticated donor's completed events; hospital history contains only its own records with optional request filtering and pagination. Dashboard summaries use real records. Future RF feature extraction reads the updated history; the trained model is unchanged.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/screening/matches/{id}/mark-arrived/` | Confirm arrival |
| POST | `/api/screening/matches/{id}/start/` | Start pending screening |
| GET | `/api/screening/matches/{id}/` | Authorized record and action flags |
| POST | `/api/screening/matches/{id}/decision/` | Explicit hospital decision |
| GET | `/api/screening/hospital/summary/` | Real dashboard counts |
| GET | `/api/screening/hospital/queue/` | Paginated workflow queue |
| POST | `/api/donations/matches/{id}/complete/` | Confirm physical donation |
| POST | `/api/donations/requests/{id}/fulfill/` | Separately confirm fulfillment |
| GET | `/api/donations/requests/{id}/progress/` | Actual completed/remaining units |
| GET | `/api/donations/donor/history/` | Own completed history |
| GET | `/api/donations/hospital/history/` | Hospital history; optional `request_id` |

Example completion payload (replace with the actual event):
```json
{"donation_date":"2026-10-11","units_donated":1,"confirmed_completed":true}
```
Fulfillment payload: `{"confirmed_fulfillment":true}`. Confirmation fields require literal JSON `true`. Both actions have explicit confirmation dialogs in React.

| React route | Page |
| --- | --- |
| `/hospital/matches/:matchId/screening` | HospitalMedicalScreening |
| `/hospital/matches/:matchId/donation` | HospitalDonationCompletion |
| `/donor/donation-history` | DonorDonationHistory |
| `/hospital/donation-history` | HospitalDonationHistory |
| `/hospital/screening` | HospitalScreeningQueue |

See `ITERATION9_VERIFICATION.md` for the complete file manifest, executed tests and limitations at that stage. Final integration verification is documented below.

## Iteration 10 — Final integration and demonstration

Final status: **READY WITH MINOR LIMITATIONS** for a local academic demonstration after the documented setup. See `FINAL_TEST_REPORT.md` for actual checks, changes, limitations and the distinction between local and production deployment.

- Preserves all existing routes, models, migrations and the trusted Random Forest artifact.
- Fixes deleted/inactive-account refresh handling and prevents a late frontend refresh from restoring a logged-out session or overwriting a new login.
- Keeps confirmation-dialog keyboard focus inside the dialog and restores the trigger on close. Radius/ranking controls have concise accessible labels. Homepage copy describes historical propensity accurately.
- Provides `audit_database`, which opens SQLite read-only and reports integrity, foreign keys, duplicates, ownership/status inconsistencies, donation units/dates, indexes and unapplied migrations without automatically changing records.
- Provides `seed_demo_data` for an explicitly separate database. It uses fictional accounts, real workflow services and real inference when analysed. Repeat runs leave existing records unchanged. Demo mode previews prepared WhatsApp messages without opening a chat or exposing an external send link.

### Safe demonstration

Follow `PROJECT_DEMO_GUIDE.md`, including its Windows setup, six fictional accounts, 18-step workflow, RF explanation and 15 viva answers. Set `LIFELINK_SQLITE_PATH` to a separate new `lifelink-demo.sqlite3` and `LIFELINK_DEMO_MODE=true` for both seeding and the backend server. Run migrations only on the intended database and run `seed_demo_data`; choose a strong password locally at its prompt. Never use the ordinary application database to seed demonstration donations. Clear these environment variables when intentionally returning to ordinary operation.

The original input archive did not include deployment data. The local default database placeholder is empty and was left unchanged. A fresh installation must run the existing migrations; they were successfully applied and audited in the isolated demo setup. Use the read-only audit against your own existing database before claiming its data is validated.

### Environment and security

The normal database path still defaults to `backend/db.sqlite3`. `LIFELINK_SQLITE_PATH` is an optional explicit override for isolated demonstrations. No existing data is automatically moved or copied. Backend `.env` remains private; preserve an existing file when upgrading. Frontend API base configuration remains `VITE_API_BASE_URL`.

`DJANGO_DEBUG=False` requires a unique 50+ character secret and rejects the supplied placeholder/development key. Secure session/CSRF cookies and HTTPS redirect then default on; console email is replaced by SMTP configuration. `DJANGO_SECURE_SSL_REDIRECT` and `DJANGO_SECURE_HSTS_SECONDS` are explicit deployment controls. Configure TLS before HSTS; subdomain/preload policies deliberately remain off. Default development `check --deploy` findings do not establish a production-ready deployment. No email delivery or hosted TLS deployment was exercised.

JWT Bearer endpoints use server-side role/ownership permissions; Django Admin retains CSRF protection. CORS is an explicit localhost allowlist by default. Local demo tokens remain in sessionStorage. Logout clears the browser session but does not revoke already issued JWTs on the server; access tokens expire after 15 minutes and refresh tokens after one day. Production session/revocation design, individual staff audit/corrections, validated clinical policies and model calibration remain outside this final iteration.

### Final verification commands

```powershell
# backend, with intended environment/database configuration
python manage.py check
python manage.py check --deploy
python manage.py makemigrations --check --dry-run
python manage.py test
python manage.py audit_database
# frontend
npm test -- --run
npm run build
npm run lint
```

ML location remains `backend/ml_prediction/models/match4life_donation_model.pkl`. Only the trusted checksum-verified artifact is loaded, once per process. No retraining, replacement, accuracy claim or new dependency was introduced. All functionality from Iterations 1–9 remains in place. Iteration 10 is the final iteration.
