# Navigation and section hierarchy

Implemented locally on 8 October 2026. This refinement keeps the approved warm/charcoal visual style.

## Changes

- Shared `Section` now draws a clear section boundary and uses a distinct 23/30 title, optional count and explanatory text. Children use tighter spacing than the separation between groups. Flat rows and hairlines remain; no rounded-card grid was introduced.
- Coordinator home groups live, preparing and past events. Volunteer home distinguishes current events and past events, retaining current/next assignment priority and incident reporting. Both place account utilities in a disclosure.
- Event navigation is Overview / Crew / Alerts / More. Existing deep routes select their owning destination. More is a dedicated, manager-guarded directory: Plan the event; Site and resources; Recruitment and access. It includes return to all events.
- Alerts lead with compact live attendance context and severity-sorted active incidents. Summary, severity, location, time and processing state remain visible. Each incident owns its review/actions disclosure, including original evidence, AI evidence, related reports, audio, processing retry, human correction, response drafting and resolution. Removing an extra interpretation wrapper avoids adding a third disclosure around the existing editor.
- Emerging risks, Responses, Coverage gaps and Event operations have distinct section headings. Risk evidence and review actions are grouped in context. Empty sections explain their state. Healthy coverage, procedures, readiness, observations, history, attendance totals and closeout remain accessible.

## Important files

`src/components/ui.tsx`, `src/components/event-navigation.tsx`, `src/app/coordinator.tsx`, `src/app/volunteer.tsx`, `src/app/events/[id]/live.tsx`, `src/app/events/[id]/more.tsx`, `src/app/_layout.tsx`.

## Validation

Expo lint, TypeScript, `git diff --check`, Impeccable layout detector, and iOS/Android/web export. Browser verification covers simulated critical/queued incidents, opening the original report, More navigation, return to all events, narrow and tablet layouts, coordinator home, and volunteer/onboarding regression flows. Browser writes are intercepted; no incident, response, profile or event mutations are sent externally. No backend, authorization, certification or safety engine changes.

Screenshots and fixture provenance are in `hierarchy-evidence/`. The earlier `alert-preview/` screenshots remain the before state. Native-device interactions have not been verified in this pass; browser screenshots and successful native bundles are separate evidence.

## Deliberate boundaries

The existing router structure is retained; this does not migrate to native tabs or create new roster/people features. The custom workspace bar remains. For very large live queues, pagination/virtualization and dedicated incident detail routes remain follow-up work, rather than silently expanding this navigation refinement. No functionality is removed for visual minimalism, and no consequential safety actions are automated.
