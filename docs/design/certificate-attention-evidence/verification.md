Certificate attention verification — 8 October 2026

- Backend: Ground Control migration 034 deployed; notification dependency 029 installed where missing. Human-review requirement, triggers and private attention state verified remotely.
- Local PostgreSQL: actual migration application/reruns; expiry before/during event; human approval cannot waive expiry; saved certificates checked on join; event-date changes; processing retries retain warnings; recurrence; deduplication; resolution; history and role isolation passed.
- Unit/worker checks: 20 passed, including runtime validation, evidence retention, AI failure, whole-event validity and notification destination.
- App: Expo lint, TypeScript, web export and diff whitespace checks passed.
- Browser: 390 × 844 mobile and 1024 × 900 tablet, using the current exported app and explicitly simulated certificate/notification records. Real demo login; operational writes intercepted. Verified inbox → Crew qualifications, warnings before/after approval, failed-save draft retention, retry and tablet overflow. Screenshots in this directory.
- Native device interaction and phone push delivery were not verified. No dependencies or native configuration changed; in-app notifications work independently of push and AI.

Previously automatically accepted certificates with no human review record now require review; originals, extraction and audit history remain retained. This implements an operational approval requirement without asserting legal compliance.
