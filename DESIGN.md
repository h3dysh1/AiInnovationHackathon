---
name: Ground Control crew interface
description: Shared mobile visual system implemented following the authorised visual redesign
colors:
  ink: '#20201E'
  accent: '#20201E'
  canvas: '#FAF9F6'
  surface: '#FFFFFF'
  secondary-surface: '#EEECE5'
  muted-text: '#686760'
  border: '#E4E1D9'
typography:
  family: DM Sans
  title:
    fontSize: '34px'
    lineHeight: '41px'
    fontWeight: 500
  body:
    fontSize: '15px'
    lineHeight: '23px'
  label:
    fontSize: '14px'
    fontWeight: 600
rounded:
  control: '4px'
  card: '0px'
spacing:
  page-mobile: '24px'
  page-tablet: '32px'
  page-gap: '24px'
---

# Ground Control visual system

The user requested a physical visual redesign on 8 October 2026: clean mobile screens, contemporary typography, calmer colours, spacing, centering and restrained animation. This replaces the historical teal/blue, system-bold, bordered-box baseline retained in the audit archive and earlier evidence.

Use `src/theme/index.ts` as the single token entry point. This is a deliberately bright interface for on-site daylight operations; a complete dark palette is not implemented. Do not infer dark-mode support from the app's automatic appearance setting.

## Typography and layout

Bundled static DM Sans Regular, Medium and SemiBold fonts load through the existing Expo Font runtime, retaining Expo Go compatibility. `AppText` chooses the real font file rather than synthesizing weight; it falls back to platform text if font loading fails. Labels remain visible, body text scales, and the display title retains its existing scaling ceiling. Stack titles use DM Sans Medium. Welcome and onboarding use larger regular-weight headings.

Pages share a centered 800-unit content width; sign-in uses a centered 420-unit form. Align normal task content to the leading edge; center the container, not paragraphs or operational facts. Keep content scrollable with safe-area and keyboard insets. The small-screen page gutter is 24, increasing to 32 at tablet widths.

## Surfaces and hierarchy

Charcoal text on warm off-white. Primary actions use charcoal; terracotta is a restrained brand accent. Secondary buttons are transparent with a thin outline. PlanCards are flat sections separated by hairlines, without filled boxes or shadows; preserve custom selection/review styling passed to them. The coordinator's event list uses separators rather than a stack of boxed cards.

Use semantic info/success/warning/error notices. Selection and errors retain textual and accessibility state signals; colour is supplementary. Fields use a single underline, visible focus indication and dark placeholder text. Native date/time controls remain available.

## Navigation and motion

Native Stack back navigation remains intact. The coordinator's Home / Crew / Alerts / More bar uses native SF Symbols on iOS and Material Symbols on Android/web, concise labels and a selected indicator. Volunteer permissions and navigation remain distinct.

Shared buttons use a 120ms press transition (scale 0.98 and opacity); reduced motion removes scale. Disclosure chevrons rotate over 180ms, with no rotation transition under reduced motion. Disclosures retain mounted editors once opened. Use native Stack transitions; reduced motion selects a fade. Do not animate every card or invent decorative entrances for live operational information.

## Product boundaries

Preserve staffing constraints, approval boundaries, original incident evidence, drafts, role permissions, event lifecycle and the existing social-processing foundation. Visual refinement does not authorise deletion of operational detail. Keep urgent information and report controls immediately accessible.

The subsequent user-directed redesign supersedes the prior blue/Inter styling. Current evidence and limits: `docs/design/ONBOARDING_REDESIGN.md` and `docs/design/onboarding-evidence/`. The earlier visual report is historical.

## Welcome and sequential onboarding

Use an interactive, photo-led welcome screen with Get started and Log in. Email and password appear on separate steps; Back preserves input. New volunteer accounts complete name, phone, emergency contact and experience before entering the app. Save completed profile steps, allow sign-out and resume, and retain profile editing for later corrections.

Event onboarding belongs to the event: availability, hours, the actual unique post qualifications, current briefing, completion. Reuse verified certificates valid for the entire event. Uploaded or pending evidence is never eligibility. Keep originals in the reusable private library. Qualification screens explain the posts that need them and permit other eligible roles.

Animate meaningful step changes over 240ms; reduced motion uses a short fade. Do not stagger operational alerts or delay urgent information. Event preparation drafts are scoped to user/event and re-reviewed after an event setup revision changes.

## Navigation and dense-screen hierarchy

One app-level navigation bar stays visible on main destinations, including home. Coordinators use Home / Crew / Alerts / More; volunteers use Home / Events / My shifts / Profile. The event selector sits above the bar and names the event being used. Crew, Alerts, More and My shifts open their selected event's existing screens. Home shows all events, and event overview remains available from an event row. More groups existing preparation tools. Preserve direct routes and permissions. Focused signup, onboarding, setup assistant/review, joining, availability and incident reporting hide the bar. Do not duplicate navigation within individual screens.

Sections now have a distinct larger title, optional description/count, a top rule and deliberate spacing. Rows remain flat; separation comes from the section boundary rather than returning to rounded cards. Home separates live, preparing and past events; account utilities are a disclosure. Volunteer assignments remain first.

Alerts show compact event status, severity-sorted incident summaries, location, timestamp and processing state. Review actions and source evidence are scoped to each incident. Emerging risks, responses, coverage gaps and event operations have separate section ownership. Disclosures retain their mounted editors and entered text. Urgency and processing-failure state must remain visible without opening details.

Evidence: `docs/design/hierarchy-evidence/`. Web browser tests use simulated incidents and intercept writes; screenshots do not establish native-device behavior.

Current navigation implementation and limits: `docs/design/PERSISTENT_NAVIGATION.md`. The earlier event-only navigation reports describe previous states.
