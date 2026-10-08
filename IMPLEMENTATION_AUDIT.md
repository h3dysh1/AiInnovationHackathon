# Ground Control implementation audit

Date: 7 October 2026. Scope: `AGENTS.md`, `roadmap.md`, `hackathon-brief.md`, application screens/services/domain modules, migrations, Edge Functions, existing checks, and read-only comparison with the deployed database.

The baseline audit below captured behavior before the implementation updates recorded here. “Implemented” means a substantive implementation exists; it does not mean its full device/provider exit condition has passed.

## Implementation progress — 8 October 2026

Steps 1–7 now have substantive implementations. This does not establish every hosted/provider/device exit condition. The findings below are the historical baseline, not the current feature inventory.

| Step | Implementation and acceptance |
| --- | --- |
| 1. Reliable incident receipt | Persisted originals, idempotent retries, private audio, attempt history, bounded asynchronous processing and single-use worker tickets. Hosted text and valid voice samples passed with real Gemini. |
| 2. Scheduling and demos | Explicit generate-times → assign-volunteers → review/publish flow; separate unrostered and active Riverside scenarios; readiness and start checks. Local scheduling/database checks and mobile web passed. Fresh hosted automatic roster acceptance was not reached. |
| 3. Incident understanding | Server-only structured Gemini extraction, validated references, editable human interpretation and durable processing stages. Hosted text/voice interpretation passed. |
| 4. Relationships and risks | Semantic correlation, preserved reports, mixed-signal risk evidence and deduplicated active risks. Hosted multi-report correlation/risk acceptance passed. |
| 5. Reviewed responses | Procedure retrieval, validated response drafts, editable requirements/instructions and explicit candidate selection. Local validation passed; hosted procedure retrieval succeeded, but draft generation exhausted retries with Gemini HTTP 503/timeouts. |
| 6. Safe reassignment and tracking | Deterministic eligibility, source/target coverage checks, atomic approval, retained assignment history and volunteer progress states. SQL scenarios passed; hosted no-show recommendation and Sarah's approved move through arrival passed. Full hosted AI-response closeout remains unverified. |
| 7. Operational follow-through | Readiness, briefing acknowledgement, no-show recommendations, event procedure references, timeline, response resolution, reviewed closeout and a fresh synthetic live-demo action. Local checks passed; native device acceptance remains outstanding. |

Final checks passed: Expo lint, TypeScript, Deno worker typecheck, 53 domain/worker tests, database migration reruns and role/coverage/history scenarios, and iOS/Android/web exports. Mobile web checks covered both roles and preserving response edits during polling. Database migrations through 028 and the incident worker were deployed.

Remaining acceptance limitations: a fresh hosted setup extraction remained running; its downstream certificate extraction and automatic roster walkthrough were not reached. Prepared demo certificates and plans are labelled synthetic fixtures, not proof of live extraction. Real AI response drafting failed as described above. Native microphone interaction needs a device walkthrough. No autonomous safety action was added. Since this progress note was first written, several P2 integrations have been added in advisory form: modelled weather from Open-Meteo, camera-based crowd estimates, phone push notifications (development or installed builds only) and a demo social feed built from hardcoded posts. Live social ingestion remains deferred.

## Main findings

1. **Automatic shift generation and volunteer assignment exist.** Mo triggers generation and approves publication. Scheduling is correctly deterministic, as the roadmap requires; it should not use an LLM as the optimizer.
2. **Real Gemini integration exists for setup extraction, certificate extraction and voice transcription.** The core live incident intelligence and response planning required by the roadmap are not implemented with AI.
3. **The live response flow is incomplete, and several existing SQL functions fail at runtime.** Screens and database tables should not have been counted as completed phase exit conditions.
4. **The seeded demo skips the features in question.** Its operating plan and certificate are preconfigured, its assignments are inserted through the manual assignment RPC, and its roster is already published. It proves login/access/storage and a prepared schedule, not Gemini extraction or automatic assignment.

## How scheduling actually works

1. Mo describes the event in **Set up and review plan → Generate plan / answer questions**. Gemini can propose posts, staffing requirements and operating windows. Mo applies, confirms and verifies the plan.
2. In **Crew and roster**, Mo chooses a shift length (default four hours) and presses **Generate shift draft from verified plan**. `create_shift_draft` splits each post's daily operating windows into shifts and copies the required staffing and qualifications. Example: Water B, 09:00–17:00, four-hour shifts → 09:00–13:00 and 13:00–17:00 each day.
3. On the resulting **draft**, **Generate / improve roster** invokes the `roster-generate` Edge Function. It selects volunteers using availability, qualification validity across the event, experience requirements, overlapping assignments, total/daily hour limits, preferences and an hours-balancing heuristic.
4. The algorithm prioritizes scarce qualifications, performs bounded search and returns a complete or partial draft. The database validates assignments again. Manual assignments remain locked during regeneration.
5. Mo reviews coverage and publishes. Volunteers then see their own assignments. Creating a replacement draft retains the last published roster until the replacement is published.

Mo does not need to assign every person manually. Triggering generation and reviewing publication are intended human controls. The current UI makes the distinction between generating shifts and filling them unclear, and hides **Generate / improve roster** when a published roster is selected. To see it from the prepared demo, create a replacement shift draft first; this changes the demo and was not done during the audit.

Scheduling limitations:

- One shift-length setting for a generation run; no built-in break/rest rules, shift-pattern suggestions, minimum rest between shifts or explanation of individual assignment choices.
- Fairness/preferences influence candidate order; the first complete solution is accepted. This is not a global optimality guarantee.
- Automatic assignment caps input at 500 shifts/500 crew. Shift generation separately allows 2,000 shifts. Larger generated plans therefore can exceed the assignment engine's supported size.
- The worker returns `searchLimited`, but the roster screen does not explain that limitation to Mo when showing a partial draft.
- The seeded roster's 24 assignments are manual, locked fixture assignments. Reusing those as the generation input would preserve them rather than demonstrate fresh automatic assignment.

Evidence: [`src/app/events/[id]/roster.tsx`](src/app/events/[id]/roster.tsx), [`src/domain/roster.ts`](src/domain/roster.ts), [`supabase/functions/roster-generate/index.ts`](supabase/functions/roster-generate/index.ts), [`supabase/migrations/202610070013_shifts_roster.sql`](supabase/migrations/202610070013_shifts_roster.sql), [`scripts/demo-fixture.ts`](scripts/demo-fixture.ts).

## What the AI implementation contains

| Requirement | Actual implementation | Assessment |
|---|---|---|
| Natural-language operating plan and document extraction | `setup-ai` calls Gemini, supplies event description/documents/answers/current structure, validates a structured candidate and stores a background job result. | Implemented; live provider success has not been demonstrated in this session. |
| Clarification and contradictions | Gemini outputs evidence-backed issues; the assistant shows one issue/gap, saves an answer and generates a new candidate. | Implemented basic loop; question priority follows returned array order, not an independent prioritization engine. |
| Provenance and human review | Source IDs/references/confidence, entity review, editable candidates and revision-gated verification. | Implemented at entity level. |
| Certificate extraction | `certificate-ai` sends PDF/image to Gemini, validates fields and uses deterministic holder/confidence/date checks; uncertain results require human review. | Implemented; Sarah's fixture bypasses extraction and is explicitly synthetic/pre-verified. |
| Voice transcription | `incident-ai` sends audio to Gemini, then writes a transcript before SQL analysis. | Implemented basic transcription; no live audio/provider acceptance test yet. |
| Natural-language incident interpretation | SQL substring matching for categories/severity/location; summary is truncated raw text; confidence is fixed at .65/.85. | Required AI service missing; current function also fails in local execution. |
| Semantic correlation and duplicate detection | Same location or category within two hours creates a relation with fixed confidence. No semantic model call; no implemented duplicate decision. | Partial rule-based scaffold. Originals are retained. |
| Mixed-signal emerging risk | Count recent heat-category incidents; emit a heat alert at two reports. | AI risk analysis and operational context missing; current function also fails in local execution. |
| Event procedure retrieval | Live snapshot lists titles of ready safety/operations documents. It does not retrieve relevant passages or ground responses in them, and does not use the setup `event_procedures` content. | Required retrieval service missing. |
| Resource needs and response planning | `propose_response` always inserts the same three generic actions and a `human_review` resource. Mo writes the instruction. | AI response planning/communication drafting missing. |
| Feasible replacement selection | Approval attempts to pick the first published assignment, without checking role, qualification, active shift, workload or source coverage. | Required deterministic candidate/coverage-protection engine missing. |
| Event summary | Closeout records counts and the supplied/static summary. | AI-generated summary missing. |

Evidence: [`supabase/functions/setup-ai/index.ts`](supabase/functions/setup-ai/index.ts), [`supabase/functions/certificate-ai/index.ts`](supabase/functions/certificate-ai/index.ts), [`supabase/functions/incident-ai/index.ts`](supabase/functions/incident-ai/index.ts), [`supabase/migrations/202610070017_incident_intelligence_response.sql`](supabase/migrations/202610070017_incident_intelligence_response.sql).

## Roadmap coverage

| Phases / area | Coverage | Remaining work |
|---|---|---|
| 0: foundation/authentication | Implemented | Real-device acceptance beyond backend login checks. |
| 1: organizations and event roles | Partial | Event membership permissions exist, but organization joining/member management does not. Signup only creates volunteers; coordinator creation is administrative. Global role still gates event creation/coordinator home. |
| 2: event creation | Mostly implemented | Approximate workforce-size field is absent; complete lifecycle transitions are not wired. |
| 3–4: setup, documents and maps | Implemented baseline | Text setup, private files, markings and editing exist. Setup voice and AI map interpretation are not implemented; sophisticated visual interpretation is deferred. |
| 5–8: extraction, provenance, gaps, conversation | Substantive implementation | Live Gemini extraction/contradiction/clarification acceptance remains unverified; setup UI requires explicit generation/apply/confirmation steps. |
| 9–11: review, manual correction, verification | Implemented baseline | Entity-level confirmations; broader operational readiness metrics are absent. |
| 12: recruitment/joining | Implemented baseline | Mo supplies a join code; automatic code generation/shareable invitation-link flow absent. |
| 13–15: profiles, certificates, availability | Implemented baseline | Event-specific acknowledgements absent. Certificate-request hint does not use authoritative qualification validity/alias matching. |
| 16–18: shifts, roster, publication | Implemented baseline | Generation discoverability, partial-result explanation, realistic heterogeneous/scaled acceptance and integrated readiness dashboard. |
| 19: attendance and replacement | Partial | Check-in/out and refresh-triggered late/missing states exist. Grace period is fixed at 30 minutes. Live qualification coverage and feasible replacement recommendations are absent. |
| 20: coordinator live dashboard | Partial | Screen loads after migration 019; polls every ten seconds. No complete location/resource state or relevant replacement recommendations. |
| 21: incident capture | Partial | Private voice/text capture and immediate persistence exist. Processing failures/retries and written context accompanying audio are not properly surfaced/preserved. |
| 22–24: understanding, correlation, risks | Incomplete | Keyword/category/location scaffolding, no required semantic AI, plus runtime defects below. |
| 25–26: retrieval and response planning | Missing core capability | Document titles/generic response templates do not meet grounded retrieval or feasible response exit conditions. |
| 27: approval and dispatch | Partial, currently broken | No modify/dismiss response flow, qualified resource selection, coverage protection or actual roster reassignment. Approval SQL error blocks dispatch. |
| 28: monitoring, timeline, resolution | Partial | Resolution/timeline records exist. Volunteer UI only exposes acknowledgement; decline/en-route/arrived/completed controls and coordinator dispatch/timeline monitoring are missing. |
| 29: closeout | Partial/inaccessible normal flow | Closeout function exists, but UI requires event status `live`, with no implemented transition into that status. No AI summary or closeout review screen. |

The complete canonical Riverside scenario has not been achieved. The reduced four-volunteer Water B fixture does not exercise float teams, source-post protection, qualified replacements, mixed-signal intelligence, resource planning or dispatch tracking.

## Defects and incomplete controls

### P0: incident-to-response execution defects

Targeted local PostgreSQL-compatible execution with all migrations and the demo fixture reproduced:

| Function | Observed failure | Consequence |
|---|---|---|
| `analyze_incident` | `column reference "summary" is ambiguous` | Incident categorization fails rather than producing structured analysis. Other same-name locals/columns also need review. |
| `detect_risk` | `function max(uuid) does not exist` | Heat risk detection fails. |
| `approve_response` | `column reference "a.roster_id" is ambiguous` | Approval transaction fails; no dispatch is created. |

A read-only query compared eight hosted function bodies against local migration source. The three failing functions and scheduling/response functions match the deployed code. Failures were reproduced locally, not by creating production incidents or approving production responses. Hosted behavior is inferred from identical definitions and normal PostgreSQL behavior, rather than claimed as a live mutation test.

### P0: response correctness and safety feasibility

Even after fixing the approval SQL error, `approve_response` uses `limit 1` on published assignments with no relevant candidate selection and no explicit approved person/resource list. It neither protects source-post coverage nor changes roster assignments. There is no idempotency/state guard preventing repeat approval from creating duplicate dispatches. This does not meet the roadmap's human-approved, deterministically feasible reallocation requirement.

### P0: incident reliability and UI

- `IncidentReport` supplies an inline loader to `useStaffing`, while the hook keys data/effects by loader identity. Without compiler memoization, rerenders can repeatedly refetch and invalidate fetched data. React Compiler is enabled in this project, so the actual bundled behavior needs a render/device test; this is a potential defect rather than a reproduced UI failure.
- `startIncidentAnalysis` returns false on invocation failure; the reporting screen ignores that result. There is no persistent incident job/lease/retry queue or visible provider error state comparable to setup/certificate processing.
- Incident processing is started from the client after persistence. Closing the app or losing connection at that point can leave a saved but unprocessed report. The server worker does not use the setup/certificate `waitUntil` background-job pattern.
- Voice transcription errors are swallowed. Optional written context is collected in the UI but not passed into the voice-report save. The original audio is retained, but separate raw context/transcript/analysis fields and history are incomplete.
- Text can be reported twice if a request commits and its reply is lost; reporting has no client request ID/idempotency key.

### P1: misleading live status and incomplete follow-through

- Live staffing counts check-ins but does not calculate whether the checked-in crew still meets First Aid/experience coverage. A headcount alone cannot detect the canonical qualified-volunteer no-show scenario.
- No-show calculation runs when the dashboard refreshes; no independent scheduled worker detects gaps while Mo is away. Volunteers marked `missing` have no check-in button, although the backend accepts check-in.
- The event's missing-certificate hint compares literal lowercased types, so `HLTAID011` does not match `First Aid`, despite the roster's valid alias handling. It also ignores expiry/review status.
- Risks are not maintained as event/location state. Once the SQL is repaired, repeated detection would append alerts rather than update the same active risk.
- Live incidents are sorted critical-first only; no complete severity ordering, relationship grouping/evidence display, or visible timeline.
- Dispatch status values exist in the database but have no enforced transition sequence and limited UI. Resolving an incident does not complete associated responses/dispatches/risks.
- The December-dated fixture has no active shifts today, no operational source documents, a pre-verified certificate and an already published roster. It is unsuitable for demonstrating the full live AI/rostering workflow without an additional scenario.

### Deferred scope

Real weather, social signals, crowd-density feeds, push notifications, advanced map interpretation, predictive analytics, external integrations and advanced optimization remain absent. The roadmap labels them P2; they should wait until the P0 loop works.

Update, 8 October 2026: weather, crowd-density estimates, push notifications and a demo social feed now exist, as described under Implementation progress above. The rest of this list is still absent.

## Recommended order of work

This order follows the P0 flow and its dependencies. Each step needs its completion check before the dependent work is considered ready. Existing working setup, certificate and roster services should be reused, with real-provider and role-specific validation throughout.

1. **Repair incident persistence and processing reliability.** Fix and regression-test the three reproduced SQL failures. Preserve original text, voice and written context; start processing reliably on the backend; add durable processing, retry and failure states; verify the reporting screen on a device. **Completion check:** a report survives app closure, a lost response and AI failure, remains visible to Mo, and can be retried without creating duplicate reports or dispatches.
2. **Make the existing automatic scheduling flow clear and demonstrable.** Distinguish generating shift times, automatically assigning eligible volunteers, and Mo reviewing/publishing the roster. Show uncovered requirements and bounded-search limitations. Add a separate unrostered scenario and a live scenario with qualified reserve crew; retain the prepared demo for quick exploration. Verify event roles and the controls needed to enter live operations. **Completion check:** Mo generates and publishes a roster without manually choosing every volunteer; Sarah sees her assignment and can check in; qualifications, availability and overlap constraints are enforced.
3. **Implement real AI incident interpretation.** Use structured Gemini output for incident extraction and event-location matching, validate every generated reference, and expose processing/review/failure states. Keep authoritative constraints deterministic. **Completion check:** text and voice reports produce validated interpretations against the event's actual locations; uncertain matches require review; provider failure leaves the original report available.
4. **Implement incident relationships and emerging-risk analysis.** Relate reports without deleting them, combine relevant reports and operational signals, and maintain active risks with evidence rather than appending duplicate alerts. **Completion check:** the canonical Riverside reports produce understandable relationships and an evidence-backed risk; repeat processing is idempotent and unrelated reports remain separate.
5. **Build feasible response recommendations and explicit approval.** Generate structured actions/resources grounded in available event procedures. Add the minimum procedure retrieval needed to support these recommendations, while leaving broader P1 retrieval work for later. Calculate qualified candidates and source-post coverage deterministically; show Mo the exact proposed people/actions before approval. **Completion check:** a recommendation cites its operational basis, moving a person cannot silently break coverage elsewhere, and approval executes only the reviewed plan once.
6. **Complete reassignment and response follow-through.** Apply approved changes to actual assignments, deliver volunteer instructions, enforce dispatch transitions, and propagate resolution to related response/risk state. Include the monitoring needed for Mo to see whether the approved response is progressing. **Completion check:** Mo's approval changes the intended assignments, affected volunteers can acknowledge and progress their task, and Mo can track and resolve the response with preserved history.
7. **Validate the complete P0 demo, then finish P1.** Run the canonical Riverside flow through both roles on a device with the hosted backend and real Gemini calls, including failure/retry cases. Verify existing event setup and certificate AI rather than relying on seeded results. Address any remaining P0 authentication/event-role gaps before adding P1 readiness, automated no-show replacement, broader procedure retrieval, richer timelines/monitoring and closeout. **Completion check:** create event → volunteer joins → certificate processed → roster generated → check-in → incident interpreted/correlated → risk identified → response proposed → Mo approves → reassignment → response tracked works end to end.

P2 integrations and advanced optimization remain deferred. This is an implementation sequence, not a claim that the missing features have been completed.

## Validation performed

- `node --test scripts/check-staffing.cjs scripts/check-staffing-workers.cjs scripts/check-setup-ai.cjs`: **27 passed**. Gemini provider calls are mocked in these tests.
- `node scripts/check-setup-database.cjs`: migrations, reruns, setup-to-join and certificate/availability/roster/publication scenarios passed. This suite does not execute the failed live incident/risk/approval paths.
- `npx expo lint`: passed.
- `npx tsc --noEmit`: passed.
- Targeted temporary local audit harness: reproduced all three live SQL failures and the fixed generic response template; no published assignment change or dispatch was produced.
- Read-only hosted source comparison: eight audited scheduling/incident/response function bodies match local migration source.
- Earlier session checks: four deployed functions active, Gemini secret name present, both demo logins and private certificate/schedule/dashboard access passed. These checks did not prove a live Gemini generation or successful incident-to-dispatch flow.

No application implementation, deployment or production-data changes were made in this audit. Only this report was added; temporary diagnostic scripts ran outside the repository. Tests passing do not override missing exit conditions or the targeted runtime failures above.
