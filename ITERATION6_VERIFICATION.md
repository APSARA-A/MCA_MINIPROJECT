# LifeLink Iteration 6 verification

## Scope

Implemented preliminary red-cell blood-group compatibility, configurable donor pre-screening,
Haversine proximity, matching services, hospital-owned JWT APIs, duplicate-safe SQLite match
records, nearest-first hospital matching screens, radius selection, request navigation and medical
review/history presentation. ML, WhatsApp, donor responses, screening approval and donation
completion remain outside this iteration.

## Checks

- Django system check: no issues.
- Django migration check: no changes detected.
- Full backend suite: 178 tests, including 41 new matching service/API tests and the existing tests.
- Matching app suite on Python 3.14.8 / Django 6.1.2: all 51 tests passed.
- Frontend: all 104 Vitest tests passed (10 test files).
- Frontend production build passed.
- Frontend lint passed without warnings.
- Actual Chromium browser with Django/SQLite and Vite: hospital login, emergency request list/details
  navigation, matching generation, nearest-first results, review candidates, repeated matching,
  radius changes, retained historical records, reload persistence, cancellation and disabled
  terminal-request generation passed.
- Browser desktop and 390 px mobile layouts inspected. Mobile document width was 390 px,
  equal to viewport width. No JavaScript or console errors in the final browser run.

The real-browser run used an isolated, temporary QA database and explicit test fixtures. No QA
users, donors, requests, screenshots or databases are shipped. The existing Figtree/Fraunces theme
fonts are bundled locally, with their licenses, to eliminate remote font failures during local use.

## Preservation

All original project files remain. Django models, migrations, the JWT authentication architecture,
SQLite configuration, package lockfile and original dependency requirements are preserved.
Two frontend assertions were updated because donor matching is now available instead of
"coming soon". The existing request workflow remains intact: only OPEN or MATCHING requests
can generate new matches; DONORS_CONTACTED is preserved and generation is denied.

The uploaded ZIP did not contain `backend/db.sqlite3`. This ZIP intentionally does not supply a
new database. Keep your existing database and `.env` when updating your local project.
For a fresh setup, run the existing migrations normally. Never reset or delete your database.

## Limits

Matching eligibility is preliminary; missing optional data remains explicitly review-required.
No contact details, medical free text or donor coordinates appear in match-list responses.
All medical decisions, donor consent, availability and component selection remain with the hospital.
The service assumes DonationHistory records represent whole-blood donations because the original
model has no component field. Facilities must approve local interval/age/weight settings before use.
This SQLite MVP calculates distances in Python and returns full stored-match lists; large-scale
pagination/geographic indexing and concurrent load testing are future work.

## How to use

1. Run the backend and frontend using README.md.
2. Sign in as a verified, active hospital.
3. Open an OPEN or MATCHING emergency request and choose **Find Matching Donors**.
4. Select 5, 10, 25 or 50 km, then choose **Find Nearby Donors**.
5. Review current candidates and review/history panels. Empty results are expected if no real
   donors meet compatibility, location and preliminary contact rules.

Stopped after Iteration 6.
