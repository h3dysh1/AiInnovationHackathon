# Persistent main navigation

Implemented locally on 8 October 2026 following user approval of account-level navigation.

## Behavior

- Coordinator: **Home / Crew / Alerts / More**. Home remains the all-events view. Crew, Alerts and More route to the selected event's roster, live alerts and grouped event tools. Event overview remains accessible by opening its home row.
- Volunteer: **Home / Events / My shifts / Profile**. Home keeps current/next assignment priority. Events is a dedicated full joined-event list. My shifts uses the selected volunteer event's existing published schedule. Profile and the reusable certificate library retain navigation.
- The selected event is shown above the navigation bar. Its picker lists only relevant active memberships: coordinator/safety-lead events in management mode, volunteer memberships in participation mode. A coordinator can switch to their volunteer participation without gaining event permissions. Selection remains across navigation during the current session; a fresh app session defaults to the highest-priority accessible event, favoring live over completed events.
- Switching the event from Crew, Alerts, More or My shifts opens that same destination for the new event. Switching from home leaves the all-events view in place with the new selection. Direct event links update context from the event's membership. Client navigation selection never grants authorization; manager gates and backend permissions remain authoritative.
- Main navigation is owned once by the root layout. The earlier event-only bars were removed from manager gates and overview; there is no duplicate footer. Screens and native Stack back navigation stay in their existing routes.
- Welcome/auth, required profile setup, joining/creating an event, event onboarding, availability entry, AI setup/review, incident reporting and the event picker hide the main bar to keep their focused flows intact.
- No-event destinations explain what to do and link to choosing/creating/joining an event. Failed event-list loads show retry instead of silently assuming an event. User-scoped cached lists and choices cannot leak between accounts.

## Files

- `src/hooks/navigation.tsx`: role-aware event list and session-scoped selection.
- `src/components/main-navigation.tsx`: the one persistent bar and event selector.
- `src/components/event-destination.tsx`: selected-event routing and loading/error/empty states.
- `src/app/_layout.tsx`: global shell and protected routes.
- `src/app/choose-event.tsx`, `crew.tsx`, `alerts.tsx`, `more.tsx`, `my-events.tsx`, `my-shifts.tsx`: navigation entry points.
- `src/components/volunteer-home.tsx`: reused home/events view; non-route code stays outside `src/app`.
- Coordinator home, event tools, manager gate and overview integrate the shared shell and preserve participation mode.

## Validation

- `npx expo lint`: passed without warnings.
- `npx tsc --noEmit`: passed.
- `npx expo export --platform all --output-dir /tmp/ground-control-main-navigation-export`: iOS, Android and web bundled; 36 routes.
- `git diff --check`: passed.
- Browser tests: coordinator home has exactly one bar; event alerts and More share it; event picker hides it; selecting Riverside 2026 changes Crew and Alerts to that event; Home returns to all events; no-event and event-list error states retain the bar and show recovery.
- Volunteer browser tests: Home → Events → My shifts → Profile → Home; onboarding has no bar; the existing signup/profile/event-onboarding regression scenarios still pass.
- Width checks: 320, 390 and 1024 viewport captures with no horizontal overflow. Existing reduced-motion testing remains green.

Evidence is in `main-navigation-evidence/`. Real demo data was read; alerts used browser-local fixtures, and all operational/profile/signup writes were intercepted. No production data changed. Native interaction testing has not been performed: browser captures establish rendered web behavior; native export establishes compilation. This retains the current cross-platform bar rather than migrating to native tabs. No backend schema, safety logic, social-processing functionality or certificate eligibility changes. All changes remain uncommitted and unpublished.
