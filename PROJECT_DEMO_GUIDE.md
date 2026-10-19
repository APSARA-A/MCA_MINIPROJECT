# LifeLink project demonstration guide

LifeLink — Smart Blood Donor Matching and Donation Propensity Prediction Using Machine Learning

This guide describes a local MCA project demonstration using fictional accounts and a separate SQLite database. It does not describe a live clinical deployment.

## A. Overview and architecture

Hospitals need a way to find compatible nearby donors, prioritise contact, track voluntary responses and record hospital screening and completed donations. LifeLink combines deterministic red-cell compatibility and preliminary contact checks, Haversine distance, a trained Random Forest propensity model, manual WhatsApp preparation, explicit donor responses and hospital decisions.

React/Vite renders public, donor and hospital pages. Axios sends JWT-authenticated requests to Django REST Framework. Role and ownership checks run on the server. SQLite stores profiles, emergency requests, matches, screenings and donation events. The trusted, checksum-verified scikit-learn model is cached once per backend process; history-derived features are recalculated for subsequent analyses. WhatsApp is a manual external click-to-chat link in normal operation, not a messaging service.

## B. Backend setup

Use Python 3.12 and Node.js compatible with the existing package.json. Do not replace an existing database or migrations. For an existing installation, back up the SQLite file while the application is stopped before deployment; these instructions do not require deleting it.

Windows PowerShell, from the extracted LifeLink folder:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

If `.env` already exists, preserve it and edit it deliberately instead of copying over it. Use a unique random `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=True` for local HTTP only, localhost allowed hosts and the two documented Vite CORS origins. Do not commit `.env` or share tokens. The ordinary database remains `backend/db.sqlite3`.

For the demonstration, configure a **different new file** in the same PowerShell session:

```powershell
$env:LIFELINK_SQLITE_PATH = Join-Path (Get-Location) 'lifelink-demo.sqlite3'
$env:LIFELINK_DEMO_MODE = 'true'
python manage.py migrate
python manage.py seed_demo_data
python manage.py audit_database
python manage.py runserver 127.0.0.1:8000
```

The seed command prompts you to choose a strong local demo password. It is not included in this guide or printed by the command. `LIFELINK_DEMO_PASSWORD` is optional for controlled automation; do not put it in a shared file. The command refuses the ordinary `db.sqlite3`, refuses identifier collisions and does not reset existing passwords or workflow state on a repeat run. Keep the demo environment variables set for the server: they enable a safe message preview with no external WhatsApp navigation. The old `seed_sample_data` command is also restricted to an explicitly isolated database.

Fictional accounts, all using your locally chosen password:

| Login email | Scenario |
| --- | --- |
| `hospital@lifelink-demo.example` | Verified SYNTHETIC Demo Hospital |
| `history@lifelink-demo.example` | Two old completed events; real-model scoring available |
| `new@lifelink-demo.example` | No history; shown without an invented score |
| `available@lifelink-demo.example` | AVAILABLE response on the sample request |
| `unavailable@lifelink-demo.example` | NOT_AVAILABLE response |
| `completed@lifelink-demo.example` | Explicitly synthetic approved screening and completed event |

The sample request needs two units and has one synthetic completed unit; it remains active. All names, coordinates, contact numbers and events are fictional. Contacts use the reserved North American 555-01xx fictional range. No medical measurement is invented for the seeded screening; its notes explicitly identify a synthetic demonstration decision. The seed uses existing matching, arrival, screening and completion services and stores no fabricated probabilities. Click Analyze to obtain actual model inference.

For macOS/Linux, replace activation with `source .venv/bin/activate` and set variables using `export LIFELINK_SQLITE_PATH="$PWD/lifelink-demo.sqlite3"` and `export LIFELINK_DEMO_MODE=true`.

## C. Frontend setup

In another terminal:

```powershell
cd LifeLink\frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Again, preserve an existing `.env`. Set `VITE_API_BASE_URL=http://127.0.0.1:8000`. Open `http://localhost:5173` (or the URL printed by Vite). Backend API: `http://127.0.0.1:8000/api/`. The frontend receives the backend's `demo_only` flag and displays a synthetic message preview without an external send link.

## D. Demonstration workflow

1. Open the homepage and explain the three roles: donor, verified hospital and administrator.
2. Sign in as the verified demo hospital. Show real emergency, screening and donation counts.
3. Create a new O+ emergency request for **one unit**, with urgency chosen explicitly. The saved hospital coordinates are fictional `(0,0)`; use those for this demo rather than real GPS.
4. Find compatible nearby donors. Explain that O+ recipients can receive O+ or O− red cells in this preliminary mapping; the blood bank still performs typing and crossmatching.
5. Explain Haversine: great-circle distance from donor coordinates to request coordinates. It is not road travel time. Show the 5/10/25/50 km radii.
6. Click Analyze Donation Propensity. Show actual Random Forest scores for historical donors and the explicit unscored state for new donors.
7. Switch Nearest First, Highest Donation Propensity and Combined Priority. Explain that combined priority is an experimental 5 km band heuristic and cannot override contact restrictions or medical decisions.
8. On an eligible fictional donor card, click Contact via WhatsApp. In this isolated demo, show the synthetic message preview. No external WhatsApp chat opens; never remove this safeguard for the presentation.
9. Explain the normal manual contact confirmation. In the isolated fictional scenario, simulate a contact attempt and confirm it explicitly; opening or previewing the message alone does not establish real sending or delivery. Notification status is not automatically SENT.
10. In another browser/profile, sign in as that matched donor (for example the history donor) and show only their matched requests.
11. Respond AVAILABLE. Show that this establishes willingness, not physical arrival or medical fitness.
12. Return to the hospital and refresh responses. The stored match is retained.
13. Open Mark Arrived and explicitly confirm the fictional arrival.
14. Start Screening. Show the single pending record and blank optional measurements.
15. Enter `SYNTHETIC Demo Staff` and notes stating this is a fictional demonstration. Leave unmeasured values blank and explicitly choose APPROVED. Explain that real use requires an authorised hospital's actual examination. Optionally demonstrate rejection with a required reason on another fictional match; rejected donors cannot complete.
16. Open Complete Donation. Enter the current application-local date and one unit. Explicitly confirm a **synthetic demonstration donation in this isolated database**. Approval alone creates no donation.
17. Show the new donor and hospital history entry, DONATED match and recalculated completed units. No other matches are deleted. A repeated identical API submission cannot create a second event.
18. Use the separate fulfillment confirmation once the required unit has been met. Re-analyse another active request to explain how the new event changes future Frequency, Recency and Time; stored old outputs are not rewritten.

The seeded two-unit sample request can instead be used to show “one unit remaining” and then a second explicit synthetic completion before fulfillment. Do not edit its already completed record. Do not seed or simulate events in the real application database.

## E. Random Forest explanation

The uploaded trained artifact is `backend/ml_prediction/models/match4life_donation_model.pkl`: RandomForestClassifier, 300 trees, scikit-learn 1.6.1, feature order Recency/Frequency/Time, binary classes 0 and 1. The application uses the class-1 probability as the expected positive donation outcome. Do not claim a new accuracy measurement: this iteration checks inference and integration, not retraining or evaluation on the original dataset.

- **Recency:** months since the last completed donation at the prediction reference date.
- **Frequency:** number of completed donation events, not total units donated.
- **Time:** months since the first completed donation.
- Only COMPLETED, nonfuture events count; CANCELLED and REJECTED records do not. Months use elapsed days / 30.4375. Exact conversion in the original training notebook remains to be confirmed.
- Random Forest can learn nonlinear patterns and interactions across these historical features. The supplied model was retained as the project choice; this review does not establish that it outperforms other algorithms.
- Propensity is a historical estimate, not emergency availability, consent, guaranteed participation or clinical fitness. A new donor remains visible without invented history or a score.
- Compatibility and distance are deterministic constraints using different information, so they remain separate from this three-feature model.
- Historical datasets may differ from local emergency conditions. The integration does not establish local calibration, fairness or clinical validation.

## F. Common viva questions

| Question | Concise answer |
| --- | --- |
| What problem does LifeLink solve? | It helps verified hospitals find compatible nearby donors and track contact, responses, screening and completed donations. |
| Why use machine learning? | It adds a historical propensity estimate for prioritising contact; database rules still handle compatibility, ownership and workflow. |
| Why Random Forest? | It models nonlinear patterns with an ensemble of trees; this is the supplied trained artifact, not a new claim that it is the best model. |
| What are the input features? | Recency, Frequency and Time from actual completed donation history. |
| What is Haversine distance? | Great-circle distance between two latitude/longitude points on an approximately spherical Earth. |
| How is blood compatibility checked? | A deterministic ABO/RhD red-cell mapping, followed by mandatory blood-bank screening and crossmatching. |
| How does ranking work? | Nearest first, highest available propensity or experimental geographic-band combined priority; unscored donors remain visible. |
| How does WhatsApp work? | The API prepares an encoded click-to-chat link. A person manually sends it; link opening is not proof of contact or delivery. Demo mode previews safely. |
| Why is medical screening necessary? | Availability and historical propensity do not establish present medical eligibility. The authorised hospital records the decision. |
| How is history updated? | Only explicit physical donation confirmation after approved screening atomically adds a completed event and marks DONATED. |
| Why SQLite? | It suits this local academic MVP and requires little setup; concurrent multi-hospital production use needs separate assessment. |
| How is JWT used? | Login returns short-lived access and refresh tokens; protected requests send Bearer access tokens and can refresh once. |
| How are permissions enforced? | Server-resolved active roles, hospital verification and owner-scoped object queries; client-supplied identities cannot grant access. |
| What are the limitations? | Historical model generalisation, no delivery receipts, preliminary whole-blood policies, local token storage, no individual staff audit or screening correction workflow. |
| What could be improved later? | Validated local model evaluation, staff-level audit/corrections, approved messaging integration, production session management and deployment hardening. These are not implemented here. |

## Verification and troubleshooting

```powershell
python manage.py check
python manage.py check --deploy
python manage.py makemigrations --check --dry-run
python manage.py test
python manage.py audit_database
# From frontend:
npm test -- --run
npm run build
npm run lint
```

Default local `check --deploy` reports development-only console email/HTTP/DEBUG findings. Do not use these settings in production. With DEBUG=False, secure cookies and HTTPS redirect default on, a unique 50+ character secret is required and SMTP is selected. HSTS must be enabled only after TLS is verified; include-subdomains/preload are deliberately not enabled because they can affect other hosts. This iteration did not test hosting, HTTPS certificates, email delivery or clinical operation.

If the database is empty, run migrations on the intended **new** demo file. Do not delete or replace an existing database. The audit command opens SQLite in read-only mode and never repairs suspicious records. If the RF artifact is missing or incompatible, the UI keeps donors visible and reports unavailable inference; restore the trusted original file and restart. For hospital restrictions, check verified/active status in Django Admin, not by editing API payloads. For CORS, use the configured Vite origin exactly.

See FINAL_TEST_REPORT.md for actual execution results and readiness scope. This is the final iteration; no new development iteration is started.
