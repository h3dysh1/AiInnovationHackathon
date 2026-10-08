# Ground Control

## Prepared Riverside demo

`npm run demo:seed` creates a separate **Riverside 2026 - Demo** in the configured Ground Control Supabase project. It needs `SUPABASE_ACCESS_TOKEN` in the ignored `.ground-control-backend-secrets` file or command environment; it does not need a local Gemini key. Public app credentials alone cannot create confirmed demo accounts. The command stops before remote changes when administrative credentials are missing.

The fixture includes Mo Demo, Sarah Demo and three supporting volunteers; a private PDF explicitly labelled **synthetic demo certificate**; Sarah's pre-verified `HLTAID011` First Aid fixture valid through 2028; availability for 12–14 December 2026; Water Station B with four staff including one First Aid holder; and a fully covered published roster with six shifts per volunteer. Join code: **RIVERDEMO26**. This is a reduced Riverside scenario for skipping setup, not the complete festival staffing plan. No incidents, check-ins or safety approvals are fabricated. Certificate extraction can be demonstrated separately with a new upload.

The standalone synthetic certificate is also available at [`demo/sarah-first-aid.pdf`](demo/sarah-first-aid.pdf). Its holder is **Sarah Demo**; use that profile name when demonstrating extraction and holder matching.

Random passwords and account emails are saved only in the ignored `.ground-control-demo-logins.json` file with owner-only permissions. Sign in as Mo to view the event, or Sarah to view shifts, check in and report incidents. The event belongs to the separate Mo demo account. Repeating the command retains the existing event and its operational history, rather than resetting it. Partial account/upload failures retain credentials for retry; the event/roster seed is transactional. `node scripts/check-demo.cjs` checks the fixture against the local migration harness (PGlite is installed with the dev dependencies).

**Hosted demo:** the fixture has been created on project `vpkedekkwbzfpaseycuc`, and Mo/Sarah logins, volunteer schedules, private certificate download, and coordinator dashboard access have been checked. The existing `incident-ai` function has also been deployed. Migration `202610070019_fix_live_snapshot.sql` repairs an undefined-alias error in the live dashboard summary without changing event data or role permissions. Real-device interaction and live Gemini transcription remain unverified.

**Gemini key location:** server functions read the `GEMINI_API_KEY` Supabase Edge Function secret for project `vpkedekkwbzfpaseycuc`. Hosted secret presence has been verified without reading its value. Administrative access is in the ignored `.ground-control-backend-secrets` file; `.env.local` contains only public Supabase client configuration.

Ground Control is an Expo 57 / React Native app for event coordinators and volunteers. The existing foundation includes account registration, persisted sign-in, role-specific home screens, profiles, coordinator-owned organisations, and event creation/editing. Phases 3–12 implement event setup, maps, operational document ingestion, Gemini-assisted extraction and clarification, human review, a manual operating-plan editor, verification, recruitment publishing, and joining. Phases 13–18 add reusable certificates, Gemini extraction with human review, availability, deterministic shift/roster generation, coverage review, and published volunteer schedules.

## Connect Supabase

1. Create a Supabase project and run the SQL files in `supabase/migrations/` in filename order in its SQL Editor. `202610070003_phase3_site_posts.sql` is the original site editor migration and creates a private `site-maps` bucket and site/post tables. `202610070004_fix_map_storage_rls.sql` corrects its map policies. The revised Phase 3 workspace uses `202610070005_phase3_setup_workspace.sql`. Map placement uses `202610070006_site_map_positions.sql` followed by `202610070007_map_shapes_check_in.sql` and `202610070008_locations_and_posts.sql`. For an existing project, run only migrations that have not already been applied. Migrations 005, 007, 008 and the new 009–014 can be rerun safely. Apply map migrations in order; if rerunning an older one, reapply the later ones too.
2. Copy `.env.example` to `.env.local`. Fill in the **Project URL** and **publishable key** from Supabase's Connect panel. Restart Expo after changing environment variables. Never put a service-role key in the app.
3. In Supabase Auth settings, enable Email sign-in and keep email confirmation enabled. New users open Supabase's confirmation link, then return to Expo Go and sign in. Supabase's default Site URL may send the browser to `http://localhost:3000` after confirmation; the confirmation itself still succeeds. New Free projects using Supabase's default email sender cannot edit the template without custom SMTP.
4. Register a user in the app. New accounts are volunteers. To make a trusted user a coordinator, run the following in the SQL Editor, replacing the email address:

```sql
update public.account_roles
set role = 'coordinator'
where user_id = (select id from auth.users where email = 'mo@example.com');
```

Sign out and sign back in after changing a role. Only an administrator can update `account_roles`; the mobile app cannot grant coordinator access.
This account role chooses the home screen and permits organisation/event creation. Operational access is based on active event membership. An event owner is automatically a coordinator for that event; a person may coordinate one event and volunteer at another. The owner can assign coordinator/safety-lead roles through **Event team & roles**.

## Phase 2 event flow

Sign in as a coordinator and tap **Create event**. Choose an existing organisation or create one, enter event details and schedule, then review and create a draft. Creation opens **Set up event**. Existing events open from the coordinator home screen and have a setup entry point alongside event editing. Events start as drafts. Recruitment publishing is available only after the current operating plan is verified; clients cannot directly change lifecycle status.

For the Riverside demo, enter `Riverside 2026`, dates `2026-12-12` through `2026-12-14`, and timezone `Australia/Melbourne`. Daily operating hours use 24-hour `HH:MM` format.

## Revised Phase 3 setup flow

Open an event and tap **Set up event**. Describe the event in natural language, then **Save description**. The context is retained per event in Supabase. Unsaved drafts are kept on the device separately for each user/event and restored when setup is reopened; a failed network save retains the draft. **Review setup notes** displays the saved description and records that the notes were reviewed. Editing and saving again resets that notes review. Progress describes only these context steps, not operational readiness.

The workspace also supports direct site-map upload. Tap **Add locations & posts on map** to create and position areas and posts on the uploaded plan. The assistant uses the saved description and included documents to generate a candidate operating plan. Reviewing notes does not confirm staffing, safety coverage, or an AI-generated plan. Setup routes, documents and map items are restricted to the event’s coordinators and safety leads by both route checks and database policies.

To verify Phase 3, save a Riverside description, leave and reopen setup, and check that the exact saved context appears. Review the notes, then edit/save and verify the review resets. Try a save while disconnected, reconnect, and retry; the description should survive. Volunteers and coordinators without a managing membership must not access the event's setup records.

## Existing map and manual site editor

From setup, tap **Open manual site editor**. Add physical locations, then add one or more staffing posts within each location. A post is a staffed task: Gate A can have ticket checking and queue management posts. Each post has a minimum volunteer count and criticality. Add certification or experience requirements with a minimum qualified count. Site-map upload also remains available here. Previously saved maps, locations, posts and requirements remain intact. Migration 008 also copies previously drawn zone pins/circles into locations and retains the old records for compatibility.

## Tap-to-add site map

Open **Add locations & posts on map** from event setup. Upload the plan, choose **Add location** or **Add post**, then tap the image. Name the item, choose a **Pin** or **Circle**, and save. Locations and posts initially use pins; switch either to a circle when useful. Use **Smaller/Larger** or **Set circle edge on map** to resize a circle; use **Move on map** to reposition it. Tap an existing marking or choose it in the saved list to edit. Save or cancel before editing another item.

Locations belong directly to the event. Create a physical location first, such as Gate A, then add multiple posts at it, such as Ticket checking and Queue management. Choose the parent location explicitly when creating a post; tapping inside one drawn location circle preselects it for confirmation. Creating a post does not create another location. New posts start with minimum coverage 1 and normal criticality; set staffing and qualifications in the manual editor. Existing post staffing, instructions and qualifications are preserved by map edits. Posts without their own position use their location's position.

For a post, choose **Add check-in circle** to configure a separate area. Resize it or move its centre independently of the post. Dashed boundaries and CI labels distinguish these areas from location/post markings. This saves setup geometry only: actual volunteer check-in comes in the attendance phase. Image circles are not GPS fences and cannot verify physical presence. Geographic reference points, calibration and distance estimates are deferred; saved venue/scale data from the earlier implementation is retained but is no longer part of this screen.

Circle radii are percentages of the shorter image edge, so they stay circular on portrait and landscape images and across screen sizes. They do not represent metres. Circles can extend beyond the visible image and are clipped at its edges.

Replacing the image requires confirmation and atomically clears pins, circles, check-in areas and any old scale, while retaining the operational structure. Saves check the image revision; geometry from an older image cannot silently attach to a replacement. Unsaved map drafts are kept locally per user/event, retain a stable ID for safe save retries, and can be repositioned after an image change. If local storage fails the app asks you to keep the screen open. Uploads also retain an ambiguously referenced image rather than deleting potentially saved data; a network interruption can leave an unused file.

Test by creating a location circle and two different post pins at that same location, adding a separate post check-in area, saving, and reopening. Confirm both posts remain under the same location with their own staffing requirements. Move/resize location and check-in circles independently. Cancel a replacement to retain markings; confirm it to clear markings but retain site items and requirements. Try saving offline, reopen to restore the draft, reconnect and retry without duplicating the post. Volunteers and coordinators without a managing membership must not access this event's map records. Run `node scripts/check-site-geometry.cjs` and `node --test scripts/check-map-services.cjs` for geometry, revision and failure checks. Live RLS and phone taps must also be checked on the connected project.

## Phases 4–12: documents through joining

From **Set up event**, upload operational/safety documents or open the assistant. Supported originals are PDF, TXT, Markdown, CSV, TSV, JPEG and PNG, up to 10 MB each. Word/Excel files need PDF/CSV exports. Each analysis accepts at most 10 included documents totalling 12 MB. Excluding a document retains its original. Files remain private; signed viewing links expire after five minutes.

The assistant saves answers before starting a persisted background job. The backend calls Gemini, validates its structured response against event sources, places, dates and staffing constraints, and saves a candidate. It never applies or confirms the candidate automatically. The conversation asks one question at a time; answers and failed jobs remain visible, and local answer drafts survive reopening. Quota failures, missing configuration and incomplete model output have explicit failure states and retry controls.

**Review & verify operating plan** shows provenance, extraction confidence, candidate editing, missing information, contradictions, current staffing and record confirmations. A new candidate must be applied or explicitly dismissed with a recorded reason before verification. Included documents also require either an applied analysis or a recorded manual review. Applying a candidate merges records by location/post name without deleting omitted records. Name changes can create new records; the manual editor supports removing erroneous posts, moving posts, and removing empty locations. Operating-hour changes that overlap existing windows require correction in the manual editor. Candidate edits are retained on the device per user/event/job. A stale candidate cannot overwrite newer setup changes.

The precision editor supports locations, posts, qualification requirements, supervisors, escalation contacts, criticality and instructions. **Operating hours & procedures** edits dated, daily time windows, optional staffing overrides and procedure text. Qualified counts must fit the base staffing and every operating window. Current windows are same-day periods in the event timezone; split overnight work into separate windows.

Confirm consequential records, resolve blocking questions, and **Verify current operating plan**. Empty plans, missing supervision/escalation/hours, invalid coverage, unreviewed documents and unconfirmed operational requirements prevent verification. A post confirmation also acknowledges whether its recorded qualification requirements are sufficient. Low-risk location descriptions do not require confirmation. Editing authoritative setup invalidates verification in the same transaction. Changes are retained in an event history.

After verification, **Publish volunteer recruitment** accepts a unique code such as `RIVERSIDE26`. A signed-in volunteer can preview only the event summary, confirm joining, and see it in **My events**. Repeated joins do not create duplicate memberships or overwrite coordinator/safety-lead roles. Setup changes pause new joins until the plan is verified again. Publishing here opens recruitment only. Roster publication is a separate, human-approved action in Phases 16–18; live attendance and incidents remain later phases.

## Gemini backend configuration

The backend function is `supabase/functions/setup-ai/index.ts`. Provider-specific code lives only in `supabase/functions/_shared/ai-provider.ts`; runtime validation and the operating-plan schema are shared with the app in `src/domain/operating-plan.ts`. A provider change requires a new adapter and server settings, with no intended changes to app screens or stored event records.

Default server settings:

| Secret | Value |
| --- | --- |
| `AI_PROVIDER` | `gemini` |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GEMINI_API_KEY` | Server-only Google AI Studio key |

The chosen [Gemini 3.5 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) supports document extraction and currently has a free tier, subject to provider quotas and availability ([pricing](https://ai.google.dev/gemini-api/docs/pricing)). Free-tier content may be used to improve Google products, so use synthetic demo documents rather than real volunteer certificates or sensitive event documents. There is no automatic paid-provider fallback. The app remains usable through manual review when AI is unavailable.

Hosted prerequisites are migrations **009–014**, applied in that order after existing 001–008, and deployment of **setup-ai**, **certificate-ai** and **roster-generate** with the server secrets above. These migrations and functions have already been deployed to the configured Supabase project. No API key belongs in an `EXPO_PUBLIC_*` variable or the Expo bundle.

### What you need to do once

The app already has the Supabase project URL and publishable key you supplied. You do **not** need to create another project, run SQL manually, or add a service-role key.

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey). The project uses `gemini-3.5-flash-lite` on the free tier. Google says free-tier prompts may be used to improve its products, so use synthetic certificates and event documents for your demo rather than real personal records.
2. Create a [Supabase personal access token](https://supabase.com/dashboard/account/tokens), scoped to project `vpkedekkwbzfpaseycuc`. Grant only **Database: read/write**, **Edge Functions: read/write**, and **Edge Function Secrets: read/write**. Supabase says your account must already have the corresponding project access; changing secrets requires Owner or Administrator access. The token is an account-management credential, not your project service-role key.
3. In the project folder, copy `.env.backend.example` to `.ground-control-backend-secrets`. Fill in only `SUPABASE_ACCESS_TOKEN` and `GEMINI_API_KEY`; keep `AI_PROVIDER=gemini` and `GEMINI_MODEL=gemini-3.5-flash-lite`. This local file is ignored by Git. Never paste these secrets into chat or put them in `.env.local`.
4. Restart Expo with `npx expo start --clear`, open the app in Expo Go, and test the Riverside flow below. Keep synthetic demo records because the free tier may use prompt contents to improve Google products.

A non-interactive deployment helper is available as `node scripts/deploy-setup.cjs`. It is restricted to this project and requires `SUPABASE_ACCESS_TOKEN` and `GEMINI_API_KEY` in its environment or an ignored `.ground-control-backend-secrets` file. It checks existing database prerequisites, applies only 009–014, sets this project’s server AI secrets, and deploys `setup-ai`, `certificate-ai` and `roster-generate`. It does not reset the database. Missing credentials cause it to stop without prompting or changing remote state. The migrations and functions have already been applied successfully; rerun the helper after rotating the exposed credentials to update the hosted Gemini secret and redeploy the functions.

The functions have gateway `verify_jwt=false` because they validate the user’s bearer token themselves with Supabase Auth. User-scoped operations use that JWT and event-scoped RPC authorization. Certificate finalization uses Supabase’s built-in server-only `SUPABASE_SERVICE_ROLE_KEY` for one restricted database RPC; it is never placed in the app or your local credentials file. `EdgeRuntime.waitUntil` runs analysis after the immediate acceptance response. A 90-second provider timeout and four-minute job lease allow retries after interrupted background work. Local function serving uses the configured `per_worker` policy.

## Validation and Riverside acceptance flow

Automated checks:

```sh
npx expo lint
npx tsc --noEmit
node scripts/check-site-geometry.cjs
node --test scripts/check-map-services.cjs scripts/check-setup-ai.cjs
node scripts/check-setup-database.cjs
```

The database test uses the PGlite dev dependency installed by `npm install`, or the package path specified by `PGLITE_MODULE`. It applies the actual migrations against local Postgres with Supabase Auth/Storage schema stubs. It checks migration reruns, creator membership, Riverside extraction/application/review/publishing/joining, private originals, raw answer retention after AI failure, stale proposals, coverage constraints and coordinator/safety-lead/volunteer isolation. Storage network behaviour and a live Gemini response still require the hosted services.

The backend is independently checked using `deno check --config supabase/functions/deno.json supabase/functions/setup-ai/index.ts`. The Expo TypeScript config excludes server-only files intentionally. `npx expo export --platform all` checks Android, iOS and web bundle compatibility. These checks do not replace testing real phone taps or document selection on a device.

For the Riverside acceptance flow, describe Water Station B as needing **four total volunteers including one First Aid holder**, with explicit dates, operating hours, a supervisor and an escalation contact. Include the demo operational and safety documents and site map. Generate a candidate; clarify ambiguous counts or missing responsibilities; review source references; apply; confirm the operational records; verify; publish with `RIVERSIDE26`; and join using a separate volunteer account. A subsequent staffing edit must reset verification and pause new joins. An AI failure must retain the documents, description and saved answers.

## Run on your phone

1. Install Node.js 22.13 or newer and Expo Go on your phone.
2. In this folder, run `npm install` and then `npm start`.
3. Keep your computer and phone on the same Wi-Fi network, then scan the QR code shown in the terminal. On iPhone, use the Camera app; on Android, use Expo Go.

If your phone cannot reach the local development server, try `npx expo start --tunnel`. Your computer must keep running the development server while you use Expo Go.

## Develop

- Screens live in `src/app/`; profile types and Supabase access live outside the route directory.
- Install Expo-compatible dependencies with `npx expo install <package>`.
- Before declaring a change complete, run `npx expo lint` and `npx tsc --noEmit`.

Expo Go is for development and demos. It supports the native modules included in Expo Go. If your project needs another native library or an installable standalone app, create a development or production build later.


## Phases 13–18: certificates through published rosters

Volunteer onboarding starts from **My events**: volunteers complete their profile and upload all
certificates they already hold before joining shifts. When an event contains a certification
requirement, the volunteer event screen compares that requirement with their uploaded certificate
types and provides an **Add missing certificate** prompt when needed. Coordinators stay in the
coordinator event workspace; volunteer availability, shifts and certificate actions are not shown
on coordinator event pages.

- **My profile → My certificates:** upload a private PDF/JPEG/PNG (up to 10 MB). Originals are immutable; archiving removes a qualification from eligibility without deleting evidence. Processing confirms receipt first, then extracts asynchronously. Failure leaves evidence available for retry or manager review.
- **Event → My availability & preferences:** submit multiple windows in the event timezone, preferred/avoided posts, preferred times, desired/max total hours and daily limit. Experience labels only satisfy hard requirements after another event manager reviews them. Network errors leave the form intact.
- **Event → Roster & shifts → Review crew qualifications:** inspect original evidence, holder/type/dates, full-event validity, low-confidence results and experience. An account cannot approve its own certificates or experience. Human corrections and extraction attempts retain audit history.
- **Generate shift draft:** split the verified operating windows into 1–12 hour blocks (default four). Review/edit times and minimum staffing before assignments; remove assignments before changing a shift. A shortened shift cannot be published if it leaves an operating period uncovered.
- **Generate / improve roster:** deterministic bounded search prioritizes scarce qualifications and constrained shifts, then preferences and fair hours. It keeps manual assignments, checks availability/overlaps/hour limits and returns partial results with visible gaps when necessary. Automatic generation supports up to 500 shifts and 500 volunteers; it does not guarantee a global optimum. Larger drafts can be assigned manually. Shift lists load in batches of 25.
- **Publish reviewed roster:** a second human confirmation shares each volunteer’s own schedule only after independent database checks pass. Qualification counts are inside total staffing, not extra seats. Draft replacements preserve the previous publication until the new version is approved. Volunteers never receive the full crew roster or other people’s certificates.

Migrations 012–014 contain the certificate, onboarding, shift, assignment and publication schema/RPCs. Migration 015 adds event requirement data to volunteer onboarding, and migration 016 adds check-ins, live attendance, persisted incidents and live operations snapshot RPCs. All migrations can be rerun in order. Certificate finalization is executable only by the backend service role, supplied by Supabase’s server environment; authenticated volunteers cannot forge verification. AI provider changes remain confined to the adapter/server settings. Rostering has no AI-provider dependency.

## Phases 19–21: live operations

Volunteers can open a published assignment from their event page, check in and check out without GPS, and hold a radio-style button to record a voice incident immediately. Audio is stored privately before processing; coordinators can play it from **Live operations**, and the server attempts a Gemini transcript for classification while preserving the recording if transcription fails. Typed reporting remains available as a fallback. Coordinators can open **Live operations** to see current staffing, late/missing attendance, active coverage and unresolved reports. The live dashboard applies the deterministic 30-minute late/missing rule when refreshed.

## Current implementation — 8 October 2026

The ordered audit plan is implemented across the app, database and server worker. See [implementation status and remaining acceptance gaps](IMPLEMENTATION_AUDIT.md) and the [Mo/Sarah demo walkthrough](demo/DEMO_WALKTHROUGH.md).

- Incident receipt is durable and idempotent. Raw text, private recordings and transcripts stay separate. Asynchronous interpretation, correlation and risk stages preserve progress and expose retries/failures.
- Gemini runs only on the backend. Structured outputs and referenced locations, procedures, qualifications and reports are validated before persistence. Reports remain available during AI failures.
- Mo reviews response instructions, destinations, requirements and explicitly selected volunteers. Database checks protect availability, qualifications, overlaps, hours and source/target coverage. Approval is atomic and idempotent; volunteers acknowledge and track their instructions.
- Readiness, briefing acknowledgements, no-show recommendations, operational history and reviewed closeout support the complete flow. Consequential actions require a human.
- Separate prepared live and unrostered scheduling demos avoid confusing fixture assignments with automatic scheduling. The live screen can create a fresh synthetic scenario and preserve the old one's history.

Important implementation files: `src/domain/live-intelligence.ts`, `src/components/response-review.tsx`, `src/app/events/[id]/live.tsx`, `supabase/functions/incident-ai/index.ts`, and migrations 020–028. Migrations through 028 and the incident worker are deployed to Ground Control. `scripts/deploy-incidents.cjs` scopes deployment to that project and keeps credentials out of logs. Worker wakeups use short-lived, single-use tickets and a scheduled recovery job.

Validation passed: `npx expo lint`, `npx tsc --noEmit`, Deno worker typechecking, 53 domain/worker tests, PostgreSQL scenarios including migration reruns and role isolation, and iOS/Android/web exports. Database scripts use the PGlite dev dependency. `npm test` runs every local check; the `check-hosted-*` scripts are excluded because they need the deployed backend and its credentials. Mobile web checks covered Mo and Sarah.

Hosted acceptance passed for real Gemini text/voice interpretation, correlation and risk evidence, plus deterministic no-show recommendations and Sarah's approved reassignment through arrival. **Remaining limitations:** Gemini response drafting exhausted retries with HTTP 503/timeouts after procedure retrieval succeeded. A fresh setup extraction stayed running, so downstream fresh certificate and automatic roster acceptance were not reached. Native microphone/device interaction remains unverified. Prepared plans/certificates are synthetic fixtures. P2 integrations, including live weather feeds, remain deferred.
