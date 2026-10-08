# Ground Control functional readiness

## Interrupted-work review — 8 October 2026

The assessment below is a historical snapshot. A subsequent review of the current working tree found substantial implementation beyond its gap list:

- Role/event-scoped notification inboxes, unread counts, notification triggers, push-device registration, delivery retries and receipt tracking (`src/services/push.native.ts`, `supabase/migrations/202610080029_operational_notifications.sql`). Native push is explicitly unavailable in Expo Go; installed/development-build delivery remains unverified.
- A persisted, account-scoped incident outbox with stable request IDs, retained voice files, reconnect/foreground retries and optional native background tasks (`src/services/incident-outbox.ts`, `src/services/incident-background.native.ts`). Native offline/relaunch/background acceptance remains unverified; Expo Go skips background registration.
- An operations worker and scheduled recovery for interrupted setup/certificate jobs (`supabase/functions/operations-worker/index.ts`, migration 029). This is repository implementation, not fresh evidence of hosted activation.
- Opt-in live weather ingestion and explicitly synthetic social signals (migration 030), plus configurable deterministic roster rest/continuous-work constraints enforced in generation and database assignment/live-candidate checks (migration 031). Production social ingestion, broader optimization and future-roster rescheduling remain outstanding.

The review reran Expo lint and TypeScript successfully; 47 targeted onboarding, incident-draft, staffing, setup/provider-validation, certificate-worker and incident-intelligence tests passed. `check-setup-database.cjs` passed all-migration application/rerun and setup/staffing/role-isolation scenarios; `check-live-operations.cjs` passed coverage, atomic approval, dispatch, resolution and closeout scenarios. These existing suites do not establish full acceptance of the new notification/outbox/weather/rest-rule features.

Gemini integration is already implemented server-side. The remaining documented provider acceptance gaps are response drafting after HTTP 503/timeouts, fresh setup completion, and downstream fresh certificate extraction/automatic roster acceptance. Native microphone acceptance is also still outstanding. No fresh provider/device walkthrough or remote mutation was performed in this review.

Deployment follow-through needs verification: the existing incident deployment helper applies migrations through 028 and deploys `incident-ai`; it does not install 029–031 or deploy `operations-worker`. The older hosted snapshot therefore cannot prove these additions are active. Most application functionality is present, but “complete apart from Gemini” would overstate the available deployment/device evidence.

## Earlier assessment

Checked 8 October 2026. This is a functionality assessment, independent of visual design. Application and backend code were inspected; isolated local checks were run; deployed metadata and aggregate outcomes were queried read-only. No incidents, accounts, approvals or other remote data were created or changed during this assessment.

## Direct answer: volunteer voice report → Mo → response

The pipeline exists, but it is not an autonomous rescheduling or push-alert system.

| Stage | Current behavior | Readiness |
| --- | --- | --- |
| Record | Volunteer grants microphone access, records, optionally adds written context, and presses Send report. | Implemented; actual native microphone walkthrough remains outstanding. |
| Receive | Private audio is uploaded and an incident is persisted with a stable request ID. Receipt does not wait for AI. Originals and retry identity are retained. | Implemented; previous hosted voice acceptance passed. Offline drafts require manual retry. |
| Understand | Server worker transcribes audio, interprets severity/category/location, correlates reports and evaluates supported emerging risks. Generated references are validated. | Implemented; deployed data includes a transcribed voice report completing the modern risk stage. |
| Show Mo | Raw reports, processing failures, interpreted incidents and risk evidence appear in the selected event's live dashboard, refreshed about every ten seconds while mounted. | Implemented in-app. No push notification, background alert or cross-event unread alert feed. |
| Propose response | Mo requests a response draft. AI retrieves event procedures and drafts instructions/resource requirements. Reports do not automatically trigger this action. | Implemented, but latest hosted AI draft failed with HTTP 503; successful real-provider completion of this stage is still required. |
| Review | Mo can edit the response, choose eligible volunteers, dismiss it or approve it. A manual response remains possible when AI fails. | Implemented. |
| Move crew | Approval atomically rechecks eligibility and source/target coverage, closes the previous assignment's effective window and creates the live replacement assignment. | Implemented; previous hosted approved no-show replacement reached arrival. This is not regeneration of the entire future roster. |
| Track | Volunteers can accept/decline, mark en route, arrived and completed. Mo can monitor progress and resolve responses. | Implemented; receiving dispatch instructions depends on opening the event view, which polls. No push delivery. |

An incident must never silently order an evacuation, declare an emergency or move people through an AI decision. Human approval is a deliberate safety requirement, not missing automation. Deterministic no-show detection can create a replacement recommendation automatically; the actual move still requires approval.

Primary implementation: `src/app/events/[id]/incident.tsx`, `src/services/staffing.ts`, `supabase/functions/incident-ai/index.ts`, `supabase/functions/_shared/live-intelligence.ts`, `src/domain/live-intelligence.ts`, `src/app/events/[id]/live.tsx`, `src/components/response-review.tsx`, `supabase/migrations/202610080024_live_response.sql`, and `src/app/events/[id].tsx`.

## What exists beyond that incident flow

- Authentication, volunteer registration/profile onboarding, event joining and event-specific availability/qualification onboarding.
- Event configuration, documents, site markings, natural-language operating-plan extraction, clarification, editable candidate review and confirmation.
- Certificate upload, server-side AI extraction, deterministic validity checks and human review for uncertain results.
- Deterministic shift generation and automatic volunteer assignment, coverage review and explicit roster publication.
- Own schedules, assignment check-in/out, scheduled attendance/no-show detection and coverage exceptions.
- Original incident retention, human interpretation corrections, related reports, risk evidence, procedure retrieval, response review, safe dispatch, operational timelines, resolution and reviewed closeout.

“Exists” means substantive implementation, not proof that every provider/device acceptance condition has passed. Prepared demo certificates and operating plans are synthetic fixtures and cannot establish extraction success.

## Remaining work, ordered by functional importance

| Priority | Gap | Required completion |
| --- | --- | --- |
| P0 acceptance/reliability | Real-provider response drafting failed. | Resolve provider failure/retry behavior and demonstrate real incident → grounded response draft → human review → approved dispatch → arrival → resolution/closeout. Preserve manual fallback and source reports. |
| P0 acceptance | Native voice capture has not been exercised end to end on a device. | Record through the app, send, close the screen, verify transcription/analysis and Mo receipt; cover permission denial, interruptions and retry without duplicate incidents. |
| P1 reliability | A deployed setup job remained running for approximately 570 minutes. | Validate the existing stale-job retry (available after four minutes), ensure jobs eventually reach a meaningful terminal state, and complete a fresh setup extraction. Incident processing has stronger scheduled recovery than setup. |
| P0 acceptance | Fresh certificate extraction and automatic roster acceptance were not reached in the recorded hosted walkthrough. | Complete a fresh event → join → actual certificate extraction/review → availability → automatically generated roster → publication → check-in walkthrough. These features are implemented, not proven missing. |
| P2 in current roadmap; significant operational delivery gap | Mo and volunteers receive no push notifications. | Add role/event-scoped delivery for urgent incidents, risk alerts and dispatch instructions, with foreground/background handling and delivery/read states. Approval boundaries must remain intact. |
| P1/P2 scope decision | Reporting has saved drafts and explicit retries, not a background offline send queue. | If offline reporting is required, add durable queued uploads, reconnect retry and an unmistakable distinction between saved locally and received by Ground Control. |
| P1/P2 scope decision | Incident response proposals require Mo to request drafting; no automatic incident-to-proposal trigger. | Decide which validated incidents/risks should generate a recommendation automatically. Never automatically approve or execute it. |
| P2 / operational scale | Automatic roster generation is capped at 500 shifts and 500 volunteers; no global-optimality guarantee or complete break/rest-rule system. | Validate realistic large heterogeneous events and define required scheduling rules before increasing limits or adding optimization. Partial results currently explain search limits. |
| P2 | External integrations are deferred. | Live weather, production social-signal ingestion, crowd-density feeds, external workforce integrations and richer AI map interpretation require separate implementation. Existing social/mock processing is not a live ingestion pipeline. |

A future-roster-wide automatic reschedule triggered by an incident is not implemented. The existing response flow handles reviewed live reassignment for the remaining assignment window. Treat wider rescheduling as a separate feature with constraints, preview, approval and publication requirements.

## Current deployed evidence

See `hosted-readiness.json` for the read-only snapshot at 00:33 UTC on 8 October 2026:

- `incident-ai` is active at version 13; staged intelligence and reviewed approval functions are installed.
- The incident-processing cron is active every minute. Its latest three SQL executions succeeded. This proves scheduler execution, not that a new AI-provider request succeeds now.
- Five incidents completed the modern risk stage, including one transcribed voice report.
- One response is failed at the draft stage with: “AI provider unavailable (HTTP 503). Your inputs are saved.”
- One dispatch has reached `arrived`.
- One setup job is still `running`, last updated around nine and a half hours before the check.
- Setup, certificate and roster Edge Functions are deployed and active. Deployment alone does not prove their full workflows succeed.

These records corroborate the previous hosted acceptance described in the 8 October progress addendum of `IMPLEMENTATION_AUDIT.md`. The older baseline below that addendum contains superseded missing-feature/SQL-defect findings and must not be read as the current inventory.

## Checks run in this assessment

- `node scripts/check-incident-worker.cjs`: nine checks passed, including asynchronous receipt, authorization, invalid transcripts, durable failures, duplicate claims and retained transcription.
- `node scripts/check-live-intelligence.cjs`: four checks passed for uncertain/invented references, relations, supported risk evidence and response validation.
- `node scripts/check-live-stages.cjs`: passed durable stage/retry, correlation, risk and response database scenarios.
- `node scripts/check-live-operations.cjs`: passed coverage/eligibility constraints, atomic/idempotent approval, role isolation, dispatch transitions and reviewed resolution/closeout scenarios.

These are isolated local tests, not a fresh real-provider or device acceptance run. Hosted acceptance scripts were deliberately not executed because they create remote demo data and operational actions. No application behavior, backend configuration or remote data was changed. Only this report and the aggregate read-only snapshot were added.
