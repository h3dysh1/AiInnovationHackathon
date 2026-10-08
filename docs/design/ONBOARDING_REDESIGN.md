# Welcome, visual system and volunteer onboarding

Implemented locally on 8 October 2026 following the user's rejection of the first blue/Inter visual pass. No commits, pushes, deployments or backend migrations.

## Design direction

Warm off-white canvas, charcoal actions and text, a restrained terracotta wordmark, bundled DM Sans, larger regular-weight headings, underlined fields, four-unit control corners and flat hairline-separated sections. Shared theme/components propagate this treatment to coordinator and operational screens, without rebuilding their workflows. Map markers retain their functional shape.

The photo-led welcome is an interactive screen with Get started and Log in. Its generated festival photograph is illustrative, not a documentary photograph of Riverside. Image generation was used for this asset; the app remains code-based React Native UI. The native launch background matches the canvas; the former Expo placeholder splash illustration is removed.

References informed patterns rather than copied layouts: [Airbnb account entry](https://www.airbnb.com/login) for a focused identity-first entry, and [Deputy onboarding](https://help.deputy.com/hc/en-au/articles/17634706208783-Complete-your-onboarding) for employer-requested documents rather than an indiscriminate qualification upload task.

## Implemented journeys

### Account entry

Welcome → Get started → Email → Password → confirmation email state when required → Log in → volunteer profile setup. Login itself also separates Email and Password. Email validation is immediate, password requirements visible, Back preserves entered values, and auth errors stay in the form. Passwords are not saved as drafts.

### Volunteer registration

Name → Phone → Emergency contact → Experience → Review → My events.

New volunteer accounts created through this signup carry a profile-onboarding marker. Router guards prevent entering normal app screens until completion. Completed profile steps persist to the existing profile tables. Final completion is marked only after both authoritative profile records save. Failed saves preserve inputs and allow retry. Finish later signs out; completed steps survive, while the unfinished current step is not promised to be saved. Existing accounts are not retroactively blocked during live operations. Auth metadata is a navigation convenience, not an authorization or safety boundary; existing database permissions remain authoritative. The profile editor remains for corrections, and coordinator workspace activation remains available.

### Event preparation

Join event → Event welcome → Availability → Hours/preferences → each unique qualification actually requested by that event's posts → current event briefing → readiness summary → Event overview.

- Availability windows are edited individually. Event timezone is shown. Advanced limits and optional post preferences are disclosed when needed; existing avoided posts, experience tags and preferred time constraints survive saves.
- Qualification aliases deduplicate using existing deterministic normalization while retaining all relevant locations/posts. Verified certificates valid across the entire event are reused. Expired, archived, rejected, failed or pending evidence cannot establish eligibility.
- A requested qualification can be uploaded in context. Originals persist through the existing upload service before AI is invoked asynchronously. File processing does not block continuing. Missing/pending evidence remains explicit; continuing never overrides staffing eligibility.
- Procedures are read individually before acknowledging the current revision. A stale revision cannot be treated as acknowledged. Completion requires saved availability and current briefing acknowledgement and explains outstanding qualifications.
- Device drafts are scoped to account/event and validated on restoration. Setup revision changes restart review while retaining entered inputs. Finish clears the draft. Availability remains editable through the existing detailed editor.
- My events and event overview expose event preparation. The global certificate library remains available for management/reuse, but is no longer the default bottom-of-home onboarding task.

## Important files

- `src/theme/index.ts`, `src/components/ui.tsx`, `src/components/plan-ui.tsx`, `src/components/app-text.tsx`: shared visual system.
- `src/components/welcome.tsx`, `src/app/index.tsx`, `assets/images/welcome-crew.jpg`: entry experience.
- `src/components/onboarding-ui.tsx`: accessible progress, focused choices and animated step changes.
- `src/app/sign-in.tsx`, `src/app/sign-up.tsx`: sequential authentication.
- `src/app/profile-onboarding.tsx`, `src/services/registration.ts`, `src/hooks/auth.tsx`, `src/app/_layout.tsx`: registration and route gating.
- `src/app/events/[id]/onboarding.tsx`, `src/domain/event-onboarding.ts`, `src/components/qualification-upload.tsx`: event preparation.
- `src/app/join.tsx`, `src/app/volunteer.tsx`, `src/app/events/[id].tsx`, `src/app/certificates.tsx`: integration with existing journeys.

## Verification and evidence

Browser inspection used the running Expo web app and existing demo accounts for read-only real data. Signup, profile saves/completion, event availability saves and briefing acknowledgement were mocked in the browser. No actual accounts were created, emails sent, qualifications uploaded or production event/profile data changed by these checks.

`onboarding-evidence/verification.json` records browser scenarios and locally intercepted writes. Screenshots cover welcome, email/password entry, confirmation, profile steps, event steps, coordinator home and small/mobile/tablet layouts. Browser assertions check email-only/password-only rendering, Back preservation, rejected email, registration save-failure retention, guarded access before profile completion, completion after profile writes, event draft restoration, real certificate reuse, briefing flow and horizontal overflow. Reduced-motion mode is exercised alongside normal motion. Browser screenshots are web evidence, not a native-device certification.

Validation commands:

- `npx expo lint`
- `npx tsc --noEmit`
- `node scripts/check-event-onboarding.cjs`: 5 qualification/draft/registration-failure tests.
- `node scripts/check-incident-drafts.cjs`: 2 existing report-draft integrity tests.
- `npx expo export --platform all --output-dir /tmp/ground-control-onboarding-export`: iOS, Android and web compilation.
- `git diff --check`

A pre-turn SHA-256 comparison verified 47 protected backend, social, qualification and existing profile/staffing/planning service files unchanged. Existing unrelated edits and earlier audit/UX work remain local.

## Limits and next validation

Native interactive execution of these new flows has not been verified on a device. The export checks bundling, not native interaction. Expo Go does not fully reproduce release splash behavior; inspect an actual release/development build before claiming the launch appearance complete ([Expo SDK 57 splash docs](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/)). The interactive welcome is directly verified on web.

End-to-end email delivery, real profile persistence, document picking/upload and AI processing are not exercised by the safe browser tests. These use existing backend APIs and no schema changes. Existing users retain their current profiles without a forced migration; new registrations receive the required onboarding. The app remains a daylight theme; this work does not add dark mode or new operational features. The shared system is updated across the app, but deep coordinator workflows retain their current screen architecture rather than receiving an unreviewed wholesale redesign.
