---
name: ground-control-product-design
description: Apply Ground Control product reasoning to UI audits, information architecture, onboarding, event setup, rostering and live safety operations. Use alongside Impeccable and official Expo skills; covers product decisions rather than generic styling or implementation APIs.
---

# Ground Control Product Design

Ground Control combines workforce-management operational clarity, consumer-app simplicity and AI-first configuration in a mobile event operations product. Design for the actual repository and the user's requested scope.

## Establish product truth

Read the repository-root `AGENTS.md` and relevant `roadmap.md` sections before substantial work. Inspect existing routes, services and role permissions. The roadmap controls scope and entity meaning; a design proposal is not authorization to implement it. Distinguish shipped behavior, partially implemented behavior, fixtures and proposed behavior.

The authoritative hierarchy is **Organisation → Event → Location → Post → staffing requirements and operating windows**. One Location can have several staffed Posts. Operators may use “zone” or “precinct” conversationally, but the current model has no separate zone layer. Do not invent one, expose database structure unnecessarily, or reinterpret image positions as GPS presence/distance.

Primary users are organisers, coordinators and safety leads such as Mo, operational staff, and volunteers. Account identity and event-specific permissions are different: a coordinator may also volunteer; safety lead is an event role. Preserve those distinctions without burdening the interface with authorization internals.

## Use the complementary skills

- **Impeccable** provides general UI expertise: shaping, critique, audit, hierarchy, cognitive load, distillation, accessibility, consistency and polish. Apply its Operate reasoning to task screens. Do not duplicate its generic checklists here.
- **Official Expo skills** provide implementation details. Start with `expo-overview`, then relevant `expo-router`, `expo-native-ui`, `expo-ui`, `expo-animation` and `expo-design-system` guidance. The installed Expo version is authoritative; fetch matching versioned docs before API work. Do not upgrade SDKs or leave Expo Go compatibility to achieve a visual idea without the required scope/approval.
- **This skill** determines what those techniques must accomplish for Ground Control.

Use Dayforce, Deputy and similar workforce products as references for familiar concepts—rosters, open shifts, availability, qualifications, attendance, replacements and coverage exceptions. Research current primary sources when evaluating a reference. Borrow operational clarity, not desktop layouts or enterprise complexity. Keep native system fonts and platform affordances where they improve task performance, even if a generic web aesthetic suggests otherwise.

## Disclose complexity when it becomes useful

An event can legitimately involve hundreds of people, posts, shifts, qualifications and incidents. Do not delete useful operational information for visual minimalism. Lower the effort required to find and act on it.

For each screen identify its primary user job and current lifecycle/role state. If unrelated jobs compete, consider a detail screen, contextual action, sheet, overflow menu, focused flow or settings destination. Group by the user's job, not merely by shared database records. Use one dominant action for the current task; keep secondary actions accessible and rare actions contextual. Preserve context on return.

Do not equate progressive disclosure with hiding alerts or adding taps. Critical facts, blockers, urgency, next actions and consequences remain visible. Disclose source detail, healthy lists, historical records and advanced configuration behind understandable entry points.

## Separate preparation from operation

Before the event, help Mo build, verify, recruit and roster. During the event, prioritize:

1. What needs attention?
2. What changed?
3. What is happening now?
4. What should I do?
5. Where can I investigate?

Exceptions should precede routine healthy states. Provide enough healthy-state context to judge whether the event is under control. Show the age of successful data and explain stale, offline and failed states. Configuration belongs outside live triage unless it directly resolves the current situation. Preserve incident context when investigating people, locations, procedures or response history.

Choose stable navigation by user jobs and event state. Do not automatically adopt Home/Roster/People/Incidents/More: test whether each destination earns a place, whether Crew should own Roster and People, and whether volunteer navigation should differ from Mo's. Keep event identity and role clear when switching events.

## Workforce and roster decisions

Make coverage and qualification shortfalls actionable without implying a partial roster is complete. Distinguish **generate shift times**, **assign volunteers**, **review**, and **publish** in operator language. Preserve the previous published roster until its replacement is approved.

Give Mo a compact coverage overview and an exception queue, then focused shifts and people details. Use search, filters and eligibility explanations for large lists. Open shifts, no-shows, replacements and reassignments must remain discoverable. Availability, qualification validity, overlap, staffing constraints and source-post protection are deterministic; do not replace them with an LLM or hide feasibility failures.

For reassignment approval show the people, destination, timing/instruction and source/target coverage consequences. Keep blocked choices explainable without making them compete with feasible choices. A human approves consequential movements; acknowledge, en-route, arrival and completion states must be understandable to both roles.

## Progressive onboarding and AI-first setup

Prefer one meaningful decision per screen with immediate feedback, progress, defaults, clear Back and save/resume where appropriate. Do not make every optional field a separate screen or turn a short form into a tap-heavy wizard. Defer unrelated optional information; preserve unfinished work during interruptions.

Volunteers should join, satisfy relevant prerequisites and receive assignments. Once prepared, their current assignment and instruction outrank repeated onboarding. While active, incident reporting must be rapidly reachable.

For complex event configuration prefer **Describe → Interpret → Review → Edit/clarify → Confirm → Manage**. Reuse the existing setup assistant, sources, map, candidate review and manual editors. People should describe how the event operates rather than configure database entities. Manual setup remains available; every AI-proposed operational value must remain inspectable and editable, including additions, removals and missing information.

Keep the authoritative apply/verification boundary while reducing redundant administrative review. Clearly show what changed, its source, uncertainty, what needs a decision and the result of confirmation. Do not silently bulk-approve inferred safety requirements. Natural-language entry must reduce administration rather than create another dashboard to manage.

## Contextual AI and human authority

Core principle: **Algorithms handle constraints. AI handles ambiguity. Humans handle safety decisions.**

Place staffing insight beside staffing exceptions and incident pattern evidence beside live incidents. A separate general-purpose AI section is usually weaker than intelligence in the working context. AI may extract, relate, summarize, prioritize, draft and recommend; it cannot declare an emergency, evacuate, contact emergency services, override procedures or perform consequential reallocations autonomously.

Distinguish observed reports/facts, AI interpretations, recommendations and human-confirmed actions. Preserve raw reports, source audio/documents, related-report links and approval/rejection history. Do not delete reports as duplicates. Show useful evidence without implying numerical confidence is operational truth. Authoritative references and feasibility require validation.

Critical operations cannot wait for AI: persist the incident, confirm receipt, then process asynchronously. Slow/failed intelligence leaves reports available and preserves retries. The UI must explain received, processing, needs-review, failed and completed states and provide recovery appropriate to the task.

## Apply and review a proposal

Use actual journeys and rendered evidence, supported by route/component references. State which roles, devices and states were exercised; label mocked/synthetic data and source-only findings. In audits avoid triggering operational writes, including side effects hidden inside nominal reads. Do not claim native testing from a mobile browser screenshot.

For recommendations include location, problem, user impact, concrete change, priority, effort and what to keep. Before finalizing a plan check that it preserves functionality—including partially integrated social-signal work—does not bury urgent information, avoids excessive navigation and disclosure, and remains usable one-handed under event pressure. A proposal remains a proposal until the user authorizes implementation.
