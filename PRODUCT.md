# Ground Control

## Platform

adaptive

Expo/React Native application targeting iOS and Android, with a web rendering available for development and inspection. Native implementation and platform conventions are authoritative; web screenshots do not establish native behavior. Current package versions: Expo 57, React Native 0.86.3. Read package.json again before implementation; versions can change.

## Users and operating context

Coordinators/safety leads such as Mo plan and staff events, monitor live activity and approve consequential responses. Volunteers join events, supply availability/qualifications, see assignments, check in, report incidents and acknowledge operational instructions. They may be distracted, moving, one-handed, outdoors or on unreliable connectivity.

Account role and event membership are distinct; a coordinator can also participate as a volunteer. Safety lead is an event-specific role.

## Product purpose

Combine workforce-management clarity, consumer-app simplicity and AI-first configuration. Help operators turn existing documents and knowledge into a reviewable operating plan, then manage staffing and live incidents with human authority over safety decisions.

## Product principles

Algorithms handle constraints. AI handles ambiguity. Humans handle safety decisions.

Preserve operational complexity, but reveal it when relevant. Every screen owns a clear user job and a dominant state-appropriate action. Live operation leads with attention, change, current state, next action and investigation. Preparation/configuration must not dominate live triage.

## Capabilities and terminology

Authoritative structure: Organisation → Event → Location → Post → requirements/operating windows. No separate zone entity exists. AI can interpret conversational precinct/zone names into reviewable Locations; do not add another hierarchy layer by assumption.

The repository contains setup description/documents/map, AI extraction and clarification, candidate review/manual correction/verification, recruitment, reusable profiles/certifications, event availability, deterministic roster generation/publication, check-ins, incident receipt/intelligence, human-approved dispatch and closeout. Social-signal processor/mock posts are preserved but have no routed UI or live ingestion integration. Actual behavior and acceptance limitations are documented separately in roadmap.md and IMPLEMENTATION_AUDIT.md.

## Safety and evidence

AI-proposed data is not confirmed operational truth. References and staffing feasibility are validated. Preserve original reports, audio, documents, relationships and decision history. Confirm incident receipt before AI finishes; failures leave reports available. Explicit human approval controls consequential actions.

## Accessibility and inclusion

Use must be practical on a phone in a noisy event environment. Status cannot rely on color alone. Keep urgency, location, affected people, next actions and decision consequences understandable. Native accessibility, text scaling, safe areas, touch targets and keyboard behavior require actual device/simulator verification.

## Authority and scope

AGENTS.md and roadmap.md remain the product/technical sources of truth. The project-specific .agents/skills/ground-control-product-design/SKILL.md applies this context alongside Impeccable and official Expo skills. This document records the user's supplied product facts for tool context; it does not approve a redesign. The audit remains a historical baseline. The user subsequently authorised UI/UX fixes using that report and the archived critique. Changes remain local; commits, pushes and publishing have not been authorised for this implementation.
