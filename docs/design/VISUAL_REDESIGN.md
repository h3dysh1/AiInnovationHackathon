> Historical first visual pass. The subsequent warm/charcoal DM Sans system and sequential onboarding supersede this styling; see [ONBOARDING_REDESIGN.md](ONBOARDING_REDESIGN.md).

# Ground Control visual redesign

8 October 2026. Local, uncommitted visual implementation following the user's request for physical UI changes. Builds on the earlier UX fixes and the archived critique under `.impeccable/critique/`; it does not replace the authoritative roadmap.

## Implemented

- One shared palette and font source in `src/theme/index.ts`; graphite text, a bright neutral canvas and blue actions replace the historical teal visual language.
- Bundled Inter Regular/Medium/SemiBold and licensed font assets. Runtime loading uses existing Expo Font, without adding dependencies or requiring a development build. `AppText` applies a consistent typeface to existing screen/component Text elements and preserves accessibility/text props.
- Revised shared Page, Title, Field, Button, Section, Notice and Disclosure presentation: centered content/form widths, deliberate spacing, lighter type weights, focus states and semantic colours.
- Borderless white top-level groups; nested PlanCards become separated flat sections, retaining custom review/selection styles and content. Coordinator events become a quieter separator list.
- Icon-based manager event navigation, calmer native headers and dark status-bar text for the light canvas.
- Reanimated press feedback (120ms, scale 0.98); animated disclosure chevrons (180ms). Reduced motion removes press scaling/chevron motion and uses native Stack fades. No shared-value/per-frame JavaScript animation or new animation dependency.
- Incident reporting keeps the optional shift choices behind a clearly labelled disclosure; the selected reporting location remains visible in its title. Recording and typing now appear earlier. Selection, persistence, sending and receipts retain their existing logic.
- Rethemed route-specific forms, event creation, site editors, map markers, review tools and supporting components. Map geometry and selected/attendance meanings remain intact.

## Verification

- `npx expo lint` and `npx tsc --noEmit` passed after implementation.
- `node scripts/check-incident-drafts.cjs`: both draft integrity tests passed.
- Expo production exports completed for iOS, Android and web; bundles stay local under `/tmp/ground-control-visual-export-final`.
- Read-only authenticated Chrome verification as Mo and Sarah exercised coordinator home, event overview, roster, setup, create-event, live operations, volunteer home/event and incident reporting. Nine primary screen checks had no runtime errors or horizontal overflow. Inter SemiBold was confirmed through computed heading styles. Tablet roster and small phone captures are retained.
- The first browser harness used an incomplete synthetic live snapshot and raised a null-event error. Its fixture was corrected; the final primary run has no page errors. `live_event_snapshot` invokes attendance marking, so its event/staffing/coverage values were synthetic. Other authorised read-only records were real demo data. No operational mutation or AI generation was executed.
- Focused follow-up checks cover optional incident context, selected styling and 320-unit width. Results and screenshots are in `visual-evidence/`.
- Token contrast ratios: body/canvas 14.60, secondary/canvas 5.19, white/primary 5.85, selected text/tint 5.23, placeholder/field 4.83. These are token calculations, not a claim that every rendered colour combination has been exhaustively tested.
- Expo Go on the iPhone simulator loaded the current font/palette bundle. Its automatic developer-menu onboarding obscures the lower screen; `native-sign-in.png` records that limitation. Authenticated native journeys, Android device execution, VoiceOver/TalkBack and release-device animation performance were not tested. Web captures are not native proof.
- Source fingerprint comparison against the start of this visual task confirms existing domain, hooks, services and social source files remain unchanged by this pass. No package/lockfile or backend changes; earlier uncommitted UX work was retained. No commits, pushes, PRs or deployments.

## Limits

This pass supplies the shared visual foundation and actual screen updates. It does not implement the audit's complete future architecture or new AI functionality. A full dark theme, virtualized large lists and role-specific native navigation remain separate work. Some route-local dimensions still use the incumbent values; future changes should adopt the shared tokens rather than create a second theme. Native system controls continue to follow platform appearance.
