# UI/UX fixes following the Ground Control audit

8 October 2026. Implemented against `UI_UX_AUDIT.md` and the original `.impeccable/critique/2026-10-07T23-00-00Z__src-app.md`. The archive remains a historical baseline; this document records the implemented scope, without marking unresolved findings closed.

## Changes

- **Navigation:** native Stack headers with descriptive titles and Back; persistent manager event navigation (Overview / Crew / Incidents / Event) reusing current routes and permission gates. Removed redundant hub navigation buttons. Setup exposes recruitment and permissions contextually. Existing deep links remain.
- **Event edits:** polling cannot replace the editor buffer. User/event-scoped local drafts survive navigation/reload until saved/cancelled. Lifecycle actions/copy distinguish live and completed events. Venue and configuration no longer precede participation/operational next actions.
- **Incident reports:** typed drafts, recording reference, selected assignment and retry identifier survive reload. Clear only after receipt or confirmed discard. Native recordings use the document directory; web recordings become data URLs to survive blob-URL loss. Storage failure is explicit. Primary accessible tap start/stop recording; microphone permission requested on intent. Hold-to-talk remains available after permission. Current assignment is selected when supported by loaded assignment state. Original report/AI processing/retry backend remains intact.
- **Live:** incidents/risks/responses precede coverage lists; exceptional coverage stays visible, healthy detail is disclosed. Incident location and last successful update are visible; failures identify potentially stale retained data. Original report/transcript, correction, procedures, readiness, observation entry, timeline and closeout remain accessible. Response review opens deliberately; instruction/destination are shown before contextual editing, candidate/feasibility/approval gates retained. Candidate calls wait until response review opens.
- **Volunteer:** current/next assignment precedes completed readiness. Event assignments initially show the first two, with all assignments accessible and Schedule preserved. Reporting is available before long lists. Assignment time uses the event timezone.
- **Roster:** replacement creation and crew workload are contextual; coverage/gaps and published/draft state retained. Fixed an empty-string render that produced a React Native Web development warning.
- **Forms:** optional event details disclosed after name/venue; event and availability dates/times use the installed Expo UI native picker with manual fallback and web date/time inputs. Availability save precedes optional preferences/briefing. Setup supporting material/manual editors are contextual.
- **Team:** automatic loading, search, explicit loading/empty/error states; role changes disclose their effect and require confirmation. Backend authorisation unchanged.
- **Other safeguards:** certificate archiving confirms eligibility impact; recruitment code can be shared, with rotation consequences explained.
- **Shared components:** measured safe areas, automatic iOS keyboard insets, constrained expanded-width content, 48-unit compact targets, heading/selected/disabled/busy/expanded semantics, explicit feedback tones and live announcements. Display headings retain scaling with a ceiling; body/input scaling is not disabled. Unopened disclosure content is deferred; after opening, editors stay mounted to retain state.

## Validation

- Final Expo lint, TypeScript and git diff whitespace checks passed. iOS/Android/web production exports passed (written to /tmp/ground-control-ui-export; not published).
- Six domain checks passed: incident draft integrity/corrupt-storage validation (2), incident/relationship/risk/response validation (4).
- Local PGlite live-operations integration passed: coverage-protected selection, atomic/idempotent reassignments, role isolation, dispatch transitions, incident resolution and reviewed closeout.
- Guarded browser tests passed: manager navigation; event edit survives polling and reload; incident text/retry identifier survives reload; deliberate discard; automatic team loading; volunteer denied manager workspace/navigation. No page errors or operational mutations. Mobile/tablet captures are in `fix-evidence/`.
- Existing nominal `live_event_snapshot` read has attendance side effects, so browser validation intercepted it with real event metadata and synthetic zero summary counts. Those numbers are not operational data evidence. Other verified reads remain real. No remote report, role change, approval, check-in or publication was exercised.
- Updated iOS bundle loaded in Expo Go. Maximum text capture shows the heading now wraps at word boundaries, but Expo Go's developer menu obscures part of the screen. macOS denied automated keystrokes needed to dismiss it (`osascript ... not allowed to send keystrokes`, 1002). This is a native inspection limitation, not a claimed product error. Original simulator text size restored. Native picker/keyboard, authenticated native and assistive-technology interaction still require device testing.
- Package versions, backend migrations/functions, staffing algorithms and social modules are unchanged. No commits, pushes, PRs or deployments.

## Audit status and remaining work

| Findings | Status |
|---|---|
| F01 edit loss | Fixed and browser-reproduced recovery; local persistence added |
| F02 live hierarchy | Improved; dedicated incident/response detail routes remain future structural work |
| F03 volunteer priority | Improved; current/next assignment and report entry foregrounded |
| F04 navigation | Headers and persistent manager navigation implemented; full role/tab architecture remains incremental |
| F05 AI/review complexity | Response/setup disclosure improved; candidate/current-plan review consolidation remains |
| F06–F07 report draft/recording | Implemented; text recovery tested, actual audio recovery/device permissions not end-to-end tested |
| F08 accessibility | Targets, headings, status and control state improved; screen-reader/device traversal remains |
| F09 insets/large text | Shared safe-area/keyboard strategy and heading scaling improved; keyboard and complete maximum-text journeys unverified |
| F10 team UX | Automatic loading/search and permission confirmation implemented |
| F11 freshness | Successful update timestamp and stale-data explanation implemented |
| F12 large-list performance | Unopened content/candidate reads deferred; comprehensive virtualization and profiling remain |
| F13 roster hierarchy | Workload/replacement disclosure implemented; broader date/post/people views remain |
| F14 review/candidate lists | Team search added; qualification/candidate search and full People workspace remain |
| F15 availability | Save promoted, optional/briefing disclosed; full progressive save/resume flow remains |
| F16 dates/timezone | Event/availability pickers implemented; constrained timezone and other staffing editors remain |
| F17 site/map editing | Existing functionality retained; focused detail and dirty-selection guards remain |
| F18 lifecycle | Live/completed next action and live-first event ordering improved |
| F19 microphone/context | Permission on intent and supported current-shift selection implemented |
| F20 archive/review | Archive impact confirmation implemented; restore/reviewer comparison remain |
| F21 account onboarding/recovery | Existing functionality retained; focused role flow and password recovery remain |
| F22 recruitment | Share and rotation explanation implemented |
| F23 feedback | Shared tones/announcements and error notices improved; raw service-error translation remains |
| F24 location/procedures | Incident location and expandable procedure content implemented |
| F25 theme/adaptivity | Constrained content width added; complete semantic light/dark tokens and tablet list/detail remain |
| F26 predictive Back | No config change without device compatibility verification |
| F27 copy | Stale attendance-phase promise removed; broader provenance copy simplification remains |
| F28 palette | Existing palette retained; complete token consolidation remains |

This pass preserves all existing service actions and safety boundaries. It does not claim all 28 findings or all Roadmap provider/device exit conditions are complete. Prioritise remaining P1 review/scale/device work before visual polish or P2 product expansion.
