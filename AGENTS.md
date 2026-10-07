AGENTS.md

Product Context

Ground Control is a mobile-first crew and safety operations platform for large events.

The two primary users are:

* Coordinator / Safety Lead (“Mo”): creates events, manages staffing, monitors live operations, reviews incidents, and approves consequential operational responses.
* Volunteer: joins events, provides availability and qualifications, receives shifts, checks in, reports incidents, and receives operational instructions.

Read ROADMAP.md before substantial product or architectural work. It is the source of truth for product scope, data models, development phases, priorities, AI architecture, and the canonical Riverside demo.

Core principle:

Algorithms handle constraints. AI handles ambiguity. Humans handle safety decisions.

When implementing a roadmap phase, focus on that phase and its required dependencies. Do not silently implement later phases or stretch features.

⸻

Expo / React Native

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

Expo has changed. Do not trust training data.

Expo ships breaking changes every SDK release. APIs may have been renamed, moved, or removed.

Before writing code that touches an Expo, EAS, or React Native API:

1. Read the major version of the expo package in package.json.
2. Fetch the matching versioned docs: https://docs.expo.dev/versions/v<major>.0.0/
3. For anything else, fetch https://docs.expo.dev/llms.txt, follow its links, and read the relevant documentation before implementation.

Do not implement Expo APIs from memory.

Commands

Use bunx instead of npx if bun.lock is present.

npx expo install <package>
npx expo start
npx expo lint
npx tsc --noEmit
npx expo-doctor
npx expo install --fix

Always use expo install for Expo/React Native dependencies rather than directly using npm, yarn, pnpm, or bun add.

Before declaring an implementation task complete, run:

npx expo lint
npx tsc --noEmit

Use the Bun equivalents where applicable.

Navigation

Use Expo Router for all navigation.

Routes live in:

src/app/

Every route file is a screen and _layout.tsx files define navigators.

Keep non-route code outside src/app/, including:

* components
* hooks
* services
* domain logic
* utilities

Import navigation APIs from expo-router.

Docs:

https://docs.expo.dev/router/introduction.md

Native Code

If ios/ and android/ do not exist, treat the project as using Continuous Native Generation.

Never create or manually edit these directories.

Configure native behaviour through:

* app.json / app config
* Expo config plugins

Expo Go only contains bundled native modules. If a new dependency requires unsupported native code, a development build is required.

Do not move the project away from Expo Go compatibility without a strong reason and explicit approval.

Prefer official Expo modules over third-party alternatives where appropriate.

EAS

Use EAS for cloud builds, signing, submission and OTA updates.

For Bun:

bunx eas-cli <command>

Otherwise:

npx eas-cli@latest <command>

Docs:

https://docs.expo.dev/eas/index.md

⸻

Architecture

Before implementing a feature:

1. Read the relevant ROADMAP.md section.
2. Inspect the existing implementation.
3. Reuse existing types, components, hooks and services where practical.
4. Identify whether the logic belongs in UI, application logic, deterministic rules, backend, or AI services.
5. Make the smallest coherent change required.

Do not rewrite working architecture merely because another approach is preferable.

Keep React components focused on rendering, interaction and navigation.

Keep business logic in typed services/domain modules.

Use TypeScript throughout. Avoid any unless genuinely unavoidable.

⸻

Deterministic Logic vs AI

Do not use an LLM for logic that can be reliably expressed deterministically.

Deterministic logic includes:

* certification expiry
* certification validity against event dates
* volunteer availability
* shift overlap detection
* minimum staffing
* required certification coverage
* roster hard constraints
* check-in state
* no-show detection
* permissions
* whether moving a volunteer would break another post’s coverage

AI is appropriate for:

* extracting certification information from documents
* interpreting natural-language incident reports
* matching reports to locations
* semantic incident similarity
* duplicate/related incident detection
* emerging-risk analysis
* procedure retrieval
* response planning
* concise communication generation

The roster and live reallocation engines should remain primarily deterministic.

⸻

AI Implementation

AI API keys and privileged credentials must never exist in the Expo client.

Use:

Expo Client
    |
Backend / Server Function
    |
AI Provider
    |
Runtime Validation
    |
Application

AI features should be narrow services rather than one unrestricted autonomous agent.

Prefer structured AI outputs.

Validate all generated output before it affects authoritative application state.

Never assume an AI-generated:

* ID exists
* location exists
* certification is valid
* resource exists
* date is valid
* recommendation is operationally feasible

Check generated references against authoritative database state.

⸻

AI Latency and Failure

AI must not block critical operations.

For incident reporting:

Receive report
    |
Persist raw report
    |
Confirm receipt
    |
Run AI asynchronously
    |
Update incident with AI analysis

If AI fails, the incident must remain available to Mo.

The application must remain usable when AI services are slow or unavailable.

Expose meaningful processing, failure and review states rather than hiding them.

⸻

Safety Boundary

Ground Control may automatically:

* transcribe
* structure
* classify
* retrieve
* correlate
* calculate
* prioritise
* draft
* recommend

Ground Control must not autonomously:

* declare an emergency
* order an evacuation
* contact emergency services
* override safety procedures
* perform consequential safety reallocations
* make high-consequence safety decisions

Those actions require a person.

AI recommendations should show the evidence or reasoning that triggered them wherever practical.

⸻

Incident Integrity

Always preserve the original incident report.

Do not delete reports because AI believes they are duplicates. Relate them instead.

Preserve important operational history including:

* raw reports
* AI interpretations
* status changes
* human approvals/rejections
* reassignments
* resolution

AI failure must never cause incident data loss.

⸻

UX

Design for mobile use in a noisy, busy event environment.

For Mo:

* prioritize urgent information
* keep screens glanceable
* minimize dense text
* make important actions obvious
* explain why alerts appear

For volunteers:

* emphasize current assignment
* make incident reporting extremely fast
* keep instructions concise
* hide unnecessary operational complexity

Do not rely solely on colour to communicate status.

⸻

Priorities

Follow the P0/P1/P2 priorities in ROADMAP.md.

Do not work on P2 features while important P0 flows are incomplete.

Prioritize the complete flow:

Create Event
    |
Volunteer Joins
    |
Certification Processed
    |
Roster Generated
    |
Volunteer Checks In
    |
Incident Reported
    |
AI Understands + Correlates
    |
Risk Identified
    |
Response Proposed
    |
Mo Approves
    |
Volunteers Reassigned
    |
Response Tracked

over a larger number of disconnected features.

⸻

Completion

Before declaring work complete:

1. Verify the relevant ROADMAP.md exit condition.
2. Run lint.
3. Run TypeScript typechecking.
4. Confirm permissions for affected roles.
5. Confirm loading/error states.
6. Confirm AI outputs are validated if applicable.
7. Confirm important user data survives AI/network failure.
8. Confirm Expo Go compatibility has not been unintentionally broken.

After implementation, report:

* what changed
* important files changed
* tests/checks run
* known limitations

Never claim a check passed if it was not run.

Project execution preference

The user authorizes routine implementation, validation, commands and database/deployment work within Ground Control’s scope. Continue autonomously without asking the user to run commands or reconfirm those actions. This includes the project’s Supabase database and AI backend. Stay within this project; do not modify unrelated projects or services. If required credentials or service access are unavailable, report the exact limitation rather than asking the user to perform setup. This does not override tool-enforced sandbox permissions.
