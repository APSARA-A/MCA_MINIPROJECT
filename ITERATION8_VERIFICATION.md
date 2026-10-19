# Iteration 8 verification — 2026-10-11

## Implemented endpoints

All paths below are relative to /api/notifications/ and use existing JWT authentication.

| Method | Path | Authorization and behavior |
| --- | --- | --- |
| GET | matches/{match_id}/whatsapp-link/ | Owning verified, active hospital and active user. Current contact rules required. Returns prepared URL/message without any writes. |
| POST | matches/{match_id}/mark-contacted/ | Owning verified, active hospital. Active request required. IDENTIFIED becomes CONTACTED; advanced statuses and responses preserved. |
| POST | matches/{match_id}/respond/ | Active owning donor. Body accepts only response AVAILABLE or NOT_AVAILABLE. |
| GET | donor/requests/ | Active donor only; own active/history rows and real pending count. |
| GET | requests/{request_id}/responses/ | Owning verified, active hospital; SQLite counts and authorized response details. |

## WhatsApp workflow

Phone numbers are normalized and validated with phonenumbers 9.0.16. Explicit +country/00 prefixes support valid international numbers; only unambiguous valid Indian mobiles may omit +91. Blank WhatsApp can fall back to phone; invalid supplied WhatsApp does not silently fall back.

Prepared messages include LifeLink, hospital name/address, request reference, blood group and urgency, omit patient references and identifying data, and ask donors to log in. Safe HTTPS wa.me navigation uses noopener/noreferrer, with a user-clickable fallback link if a popup is blocked. The hospital must manually send the message.

Generating/opening a link does not change any match or request record, confirm contact, mark SENT, or prove sending/delivery. A separate confirmation dialog asks whether contact was actually attempted. Its atomic endpoint advances IDENTIFIED to CONTACTED and OPEN/MATCHING requests to DONORS_CONTACTED; repeat and advanced-state calls preserve existing decisions. Notification status and donor responses are unchanged. No notification logs are invented.

## Donor and hospital workflow

New React route: /donor/requests, protected by existing donor-role route and profile gate. Sidebar and dashboard navigation are enabled; pending dashboard count comes from the API. Active and historical matches are separate. Availability buttons save the signed-in donor's response, prevent repeated submissions, update the card and refresh real records. Conflicts refresh lifecycle state so closed requests lose response actions.

AVAILABLE/NOT_AVAILABLE set donor_response and AVAILABLE/UNAVAILABLE status with responded_at. Identical repeats preserve the timestamp. Changes are allowed only from IDENTIFIED, CONTACTED, AVAILABLE or UNAVAILABLE while the request is active. ARRIVED, SCREENING, APPROVED, REJECTED, DONATED and CANCELLED stages reject responses. Cancelled/fulfilled/closed requests reject them. No medical approval or donation history is created.

Hospital cards preserve compatibility, preliminary eligibility, Haversine distances, RF scores and ranking. Counts and response details refresh after generation/contact confirmation, on window focus, every 30 seconds when visible, or manually. A changed response refreshes matching and existing analysis without regenerating matches; unavailable-to-available donors return to current recommendations. Request details retain View Donor Matches navigation after contact starts.

Count definitions: total_matched includes every stored match; awaiting_response counts PENDING; available counts AVAILABLE; not_available counts NOT_AVAILABLE. NO_RESPONSE is neither pending nor an explicit availability response. Contacted counts matches currently at CONTACTED. Counts may overlap and include retained history. The schema has no contact-attempt timestamp, so later responses replace that stage and this is not a lifetime contact or delivery count.

## Actual checks executed

Environment: Python 3.12.14, Node.js 24.19.0, complete pinned requirements including scikit-learn 1.6.1 and phonenumbers 9.0.16.

- python manage.py check: passed, no issues.
- python manage.py makemigrations --check --dry-run: passed, no changes.
- python manage.py test notifications_app --noinput: 27 passed in 13.149 seconds.
- Full backend python manage.py test --noinput, executed from backend/: 231 passed in 101.023 seconds, including all previous 204 tests.
- Full frontend npm test -- --run: 146 passed in 14 files (5.20 seconds), including prior iteration coverage.
- npm run build: passed, Vite 8.3.4 production build (141 modules).
- npm run lint: passed with no lint warnings.
- Real Chromium against Django/React in isolated QA database: passed separate hospital/donor JWT sessions, match creation, real RF predictions retained during response updates, authorized prepared link and encoded message, no contact/delivery update when opening, separate confirmation, AVAILABLE then NOT_AVAILABLE then AVAILABLE restoration, accurate hospital counts, no duplicate matches, cancellation and donor historical view, desktop/mobile layout. Console/page errors: none. At mobile width 390 px, document width was 390 px.
- Browser counts from the actual QA database: total 3, available 1/awaiting 2 after AVAILABLE, not available 1 after NOT_AVAILABLE. No delivery or availability values were fabricated.
- WhatsApp navigation was inspected with window.open intercepted for QA; no actual message was sent. Real WhatsApp membership, sending and delivery were not verified or claimed.
- Backend tests cover URL encoding/privacy, phone formats/errors/fallback, real JWT and owner/role/active restrictions, idempotency and unchanged timestamps, protected workflow states, no new records, donor isolation and exact SQLite counts.

## Preservation and remaining limits

Every one of the 209 Iteration 7 archive files is retained. Original models and migrations are byte-for-byte unchanged. The ML services/API and exact bundled model are unchanged. Model SHA-256 remains 871a86b9e1b2e140ab2c3782b92daa072d722f2fb4a4960effc351c95168b70c.

No schema migrations, authentication changes, Twilio, WhatsApp Business API, automatic messaging, screening, donation completion or Iteration 9 were added. Existing deployment db.sqlite3 and .env must be preserved; no replacement DB, credentials or QA fixtures are shipped. Install updated backend/requirements.txt before running.

No known blocking Iteration 8 issue remains. Limits: valid phone formatting does not prove a WhatsApp account; click-to-chat cannot verify delivery; contacted is a current-stage count; response updates use polling/focus/manual refresh rather than a push feed. The prior ML training month-conversion convention still needs confirmation from the training notebook (application uses elapsed days / 30.4375). Donor/history list pagination remains future scaling work.

## Modified files relative to Iteration 7

- README.md
- backend/config/urls.py
- backend/notifications_app/views.py
- backend/requirements.txt
- frontend/src/App.jsx
- frontend/src/__tests__/app.test.jsx
- frontend/src/__tests__/matching.test.jsx
- frontend/src/__tests__/mlPrediction.test.jsx
- frontend/src/components/DashboardLayout.jsx
- frontend/src/pages/DonorDashboard.jsx
- frontend/src/pages/EmergencyRequestDetails.jsx
- frontend/src/pages/HospitalDonorMatches.jsx
- frontend/src/styles/dashboard.css

## Added files

- backend/notifications_app/permissions.py
- backend/notifications_app/serializers.py
- backend/notifications_app/services/__init__.py
- backend/notifications_app/services/whatsapp.py
- backend/notifications_app/test_notifications.py
- backend/notifications_app/urls.py
- frontend/src/__tests__/notificationService.test.js
- frontend/src/__tests__/notifications.test.jsx
- frontend/src/components/HospitalResponseSummary.jsx
- frontend/src/components/MatchContactActions.jsx
- frontend/src/pages/DonorBloodRequests.jsx
- frontend/src/services/notificationService.js
- frontend/src/utils/matchStatus.js
- ITERATION8_VERIFICATION.md (this report)
