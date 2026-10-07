# Ground Control Development Roadmap

## 1. Product Vision

Ground Control is a mobile-first crew and safety operations platform for
large events.

It helps an event safety lead or volunteer coordinator turn their
existing event knowledge into a structured operating plan, staff the
event, monitor live operations, identify emerging risks, and coordinate
responses.

The primary users are:

### Coordinator / Safety Lead ("Mo")

Mo:

-   creates and configures events
-   provides existing event documents, maps and plans
-   explains how the event operates in natural language
-   reviews the operating model Ground Control creates
-   manages volunteer staffing
-   monitors live event operations
-   reviews incidents and emerging risks
-   approves consequential staffing and safety actions

### Volunteer

A volunteer:

-   maintains a reusable profile
-   uploads qualifications and certifications
-   joins events
-   provides event-specific availability and preferences
-   receives shifts
-   checks into shifts
-   reports incidents
-   receives reassignment and operational instructions

The core product principle is:

> **Algorithms handle constraints. AI handles ambiguity. Humans handle
> safety decisions.**

Ground Control should adapt to how event operators already think and
work. Users should not need to understand the application's database
structure in order to configure an event.

------------------------------------------------------------------------

# 2. Core Product Lifecycle

The full event lifecycle is:

``` text
ACCOUNT
   |
ORGANISATION
   |
BASIC EVENT CREATION
   |
AI EVENT SETUP
   |
DOCUMENT + MAP INGESTION
   |
NATURAL-LANGUAGE SETUP INTERVIEW
   |
DRAFT EVENT MODEL
   |
CLARIFICATION + REVIEW
   |
VERIFIED EVENT MODEL
   |
VOLUNTEER RECRUITMENT
   |
VOLUNTEER ONBOARDING
   |
CERTIFICATION PROCESSING
   |
AVAILABILITY + PREFERENCES
   |
SHIFT GENERATION
   |
ROSTER GENERATION
   |
ROSTER PUBLISHING
   |
PRE-EVENT READINESS
   |
CHECK-IN
   |
LIVE OPERATIONS
   |
INCIDENT REPORTING
   |
INCIDENT INTELLIGENCE
   |
RESPONSE RECOMMENDATION
   |
HUMAN APPROVAL
   |
DISPATCH
   |
MONITORING
   |
RESOLUTION
   |
EVENT CLOSEOUT
```

------------------------------------------------------------------------

# 3. Technology Direction

## Client

-   React Native
-   Expo
-   Expo Router
-   TypeScript
-   mobile-first
-   Expo Go compatible wherever practical
-   shared application for coordinators and volunteers
-   event-role-aware navigation and permissions

## Backend

The backend must eventually support:

-   authentication
-   structured event data
-   realtime updates
-   file storage
-   server-side functions
-   AI API calls
-   document processing
-   notifications/event subscriptions

AI API keys and privileged credentials must never live directly in the
Expo client.

------------------------------------------------------------------------

# 4. Product Architecture

Ground Control has four major systems.

``` text
                    GROUND CONTROL

        +--------------------------------+
        |        AI EVENT BUILDER        |
        | Documents + Conversation       |
        | -> Structured Event Model      |
        +--------------------------------+
                        |
                        v
        +--------------------------------+
        |       OPERATIONS MODEL         |
        | Locations, Posts, Requirements |
        | Shifts, Volunteers, Resources  |
        +--------------------------------+
                        |
             +----------+----------+
             |                     |
             v                     v
   +------------------+   +----------------------+
   | DETERMINISTIC    |   | AI INTELLIGENCE      |
   | OPERATIONS       |   |                      |
   |                  |   | Incident extraction  |
   | Rostering        |   | Correlation          |
   | Coverage         |   | Risk analysis        |
   | Check-ins        |   | Procedure retrieval  |
   | Reallocation     |   | Response planning    |
   +------------------+   +----------------------+
             |                     |
             +----------+----------+
                        |
                        v
                 HUMAN DECISION
                        |
                        v
                     ACTION
```

AI should not replace deterministic operational logic.

------------------------------------------------------------------------

# 5. The AI Event Builder

The default event setup experience should NOT require Mo to manually
construct:

``` text
Location -> Post -> Requirement -> Shift
```

That hierarchy exists for the application, not for the user.

Instead, Mo should provide Ground Control with information in the way an
event operator naturally would:

-   talk about the event
-   upload existing plans
-   upload the site map
-   upload an old roster
-   upload run sheets
-   upload safety procedures
-   answer follow-up questions

Ground Control converts those inputs into the structured event model.

The setup architecture is:

``` text
MO'S EXISTING KNOWLEDGE
        |
        +-- Natural-language interview
        +-- Site map
        +-- Run sheet
        +-- Safety plan
        +-- Existing roster
        +-- Volunteer plan
        +-- Other documents
                |
                v
        AI EVENT BUILDER
                |
        +-------+--------+
        |                |
    Extraction       Reasoning
        |                |
        +-------+--------+
                |
                v
        DRAFT EVENT MODEL
                |
        +-------+-----------+
        |                   |
   Missing info       Contradictions
        |                   |
        +---------+---------+
                  |
                  v
            AI INTERVIEW
                  |
                  v
             MO REVIEWS
          /       |        \
      Confirm    Edit     Clarify
          \       |        /
                  v
        VERIFIED EVENT MODEL
                  |
                  v
            ROSTER ENGINE
```

------------------------------------------------------------------------

# 6. Coordinator Onboarding

A new coordinator should not immediately encounter complex event
configuration.

Initial flow:

``` text
Create Account
      |
Create / Join Organisation
      |
Create Event
      |
Basic Event Details
      |
AI Event Setup
```

The application should introduce Ground Control as helping build the
operating plan rather than asking Mo to configure a database.

------------------------------------------------------------------------

# 7. Basic Event Creation

Some information is simple and reliable enough that a form is better
than AI.

Collect:

-   event name
-   event description
-   venue
-   address/location
-   start date
-   end date
-   timezone
-   operating hours
-   expected attendance
-   approximate workforce size

Example:

``` text
Event
Riverside 2026

Dates
12-14 December 2026

Venue
Birrarung Marr

Expected attendance
15,000

Approximate volunteers
300
```

After creation, route Mo into:

``` text
Set up Riverside
```

rather than directly into manual location/post creation.

------------------------------------------------------------------------

# 8. AI Event Setup Workspace

The setup home should present three concepts.

## 1. Add what you already have

Allow Mo to upload:

-   site map
-   run sheet
-   event operations plan
-   volunteer plan
-   existing roster/spreadsheet
-   emergency management plan
-   evacuation plan
-   medical plan
-   heat plan
-   severe weather plan
-   volunteer handbook
-   other relevant documents

## 2. Tell Ground Control how the event works

Provide:

-   text input
-   voice input where practical

The user should be able to speak naturally rather than fill out every
operational field manually.

## 3. Review the operating plan

Ground Control generates a structured draft and identifies:

-   missing information
-   contradictions
-   uncertain assumptions
-   incomplete staffing requirements

------------------------------------------------------------------------

# 9. Natural-Language Setup Interview

The setup interview is a core AI feature.

Example user input:

> Riverside is a three-day music festival with around 300 volunteers.
> The site has Lawn, Riverside and Entry. Lawn has the main stage, a
> water station and first aid. I want six crowd volunteers around the
> main stage whenever it operates and at least one should be
> experienced. Water B needs four people and one should have first aid.
> Main entry needs eight people when gates open, then four after the
> initial rush. We also need floaters for breaks and no-shows.

The AI should interpret this as candidate structured entities and
requirements.

It must not silently treat every interpretation as confirmed fact.

------------------------------------------------------------------------

# 10. Setup Interview Question Engine

The AI Event Builder should actively identify information it still
needs.

Examples:

### Ambiguous requirement

> You said Water Station B needs four volunteers and one First
> Aid-qualified volunteer. Is the First Aid volunteer included in the
> four?

### Missing operating window

> You specified six crowd volunteers at Lawn Stage but did not specify
> when coverage begins. The run sheet shows performances from 12:00 to
> 22:30. Should coverage begin 30 minutes before the first performance?

### Staffing transition

> Main Gate requires eight volunteers during the initial arrival period
> and four afterward. Should I treat the initial arrival period as the
> first two hours after gates open?

### Missing contingency

> You mentioned a float team for breaks and no-shows. How many
> volunteers should remain unassigned and available at once?

### Contradiction

> The setup interview says Water Station B requires four volunteers, but
> the uploaded volunteer plan says five. Which should Ground Control
> use?

### Safety-plan requirement

> The Emergency Management Plan requires two First Aid-qualified staff
> in the Lawn precinct while patrons are present. Your current staffing
> plan only guarantees one. Would you like to update the Lawn
> requirement?

The system should ask targeted questions rather than forcing Mo to
manually discover every gap.

------------------------------------------------------------------------

# 11. Event Model Completeness

The AI Event Builder should reason about the information required to
operate and roster the event.

For each operational function, Ground Control should try to establish:

``` text
WHERE?
Location

WHAT?
Post / responsibility

WHEN?
Operating window

HOW MANY?
Minimum / target staffing

WHO CAN DO IT?
Certifications / skills / experience

WHO OWNS IT?
Supervisor / escalation path

HOW IMPORTANT?
Criticality

WHAT IF COVERAGE FAILS?
Contingency / minimum coverage
```

Missing information becomes a setup question or review item.

------------------------------------------------------------------------

# 12. Structured Event Model

The structured model remains essential even though Mo does not manually
create it by default.

Core hierarchy:

``` text
Organisation
    |
    Event
      |
      +-- Location
      |     |
      |     +-- Post
      |            |
      |            +-- Requirements
      |            +-- Operating Windows
      |
      +-- Event Documents
      +-- Event Memberships
      +-- Shifts
      +-- Incidents
```

Locations belong directly to an event. Posts represent staffed tasks or
responsibilities at a location. Several posts can share a location, and
each post has independent coverage, qualifications and operating windows.
There is no zone layer.

This model drives:

-   rostering
-   coverage calculations
-   check-ins
-   no-show handling
-   reallocation
-   incident context
-   risk analysis
-   response planning

------------------------------------------------------------------------

# 13. Provenance and Verification

AI-generated setup information should retain where it came from.

Conceptually:

``` ts
type FieldProvenance = {
  sourceType:
    | "conversation"
    | "document"
    | "map"
    | "existing_roster"
    | "manual"
    | "inference";

  sourceId?: string;
  sourceReference?: string;
  confidence?: number;

  verificationStatus:
    | "ai_draft"
    | "needs_review"
    | "confirmed";
};
```

Important operational fields should be able to distinguish:

-   explicitly stated by Mo
-   extracted from a document
-   inferred by AI
-   manually edited
-   confirmed by Mo

Example UI:

``` text
Water Station B

Minimum staff
4                    CONFIRMED
Source: Setup interview

First Aid
1 required           CONFIRMED
Source: Safety Plan p.14

Operating hours
10:00-22:00          NEEDS REVIEW
Source: Inferred from event hours

[Confirm] [Edit]
```

Do not pretend AI inference is equivalent to confirmed operational
information.

------------------------------------------------------------------------

# 14. Setup Review Dashboard

After the initial AI setup pass, Mo should see a summary such as:

``` text
RIVERSIDE SETUP

94% complete

18 locations
27 posts
142 generated shift requirements

3 items need attention
```

Potential attention items:

``` text
First Aid A
No minimum staffing specified

South Entrance
Operating hours unclear

River Marshal
No supervisor defined
```

The goal is to turn a potentially large setup process into an
exception-review workflow.

------------------------------------------------------------------------

# 15. Manual Structured Editor

Manual editing remains important.

Mo must be able to navigate the generated structure:

``` text
Event
 -> Location
    -> Post
       -> Requirements
```

and change any value.

Example post editor:

``` text
Water Station B

Location
Water Station B

Minimum staffing
4

Required certifications
First Aid x1

Operating hours
10:00-22:00

Criticality
Important

Supervisor
Lawn Lead

Instructions
...
```

The structured editor is the precision/override interface.

It is not the default setup experience.

------------------------------------------------------------------------

# 16. Site Map Handling

Mo should be able to upload the event map during setup.

For the MVP:

-   store the map
-   display it in the event
-   tap the uploaded image to create and name locations and posts
-   represent each item as a pin or an adjustable circle
-   select saved markings to edit, move or resize them
-   use a location's position for its posts unless a post has its own pin
-   optionally configure a separate check-in circle for each staffing post
-   allow AI to suggest entities where practical
-   require human confirmation before relying on inferred map structure

The default setup flow is upload map → describe event → mark locations/posts
→ review/save. A location is a physical place; a post is a staffed task
at that place. One location can have several posts, each with its own
staffing and qualification requirements and optional check-in area.
Create a location first, then select it when creating a post. The manual
editor follows Event → Location → Post → Requirements.

Check-in circles saved during setup describe areas on the image. Actual
volunteer check-in belongs to the attendance phase. Image coordinates
alone cannot verify physical presence or provide GPS geofencing.

Geographic reference points, map calibration and physical distance
estimates are deferred until distance-aware reallocation requires them.
That later work must account for scale, routes, barriers and restricted
areas rather than assuming image coordinates represent metres.

Replacing the site image clears its pins, circles, check-in areas and any
previously saved scale while retaining locations, posts and their
staffing requirements. Items must be placed again on the new image.

Do not make sophisticated computer vision or map interpretation a
prerequisite for the core workflow.

------------------------------------------------------------------------

# 17. Event Documents and Knowledge Base

Store event documents as structured records.

``` ts
EventDocument {
  id
  eventId
  type
  title
  fileUrl
  processingStatus
}
```

Documents serve two purposes.

## Setup

AI can extract:

-   locations
-   staffing requirements
-   operating hours
-   qualification requirements
-   procedures
-   responsibilities

## Live Operations

Relevant procedures can later be retrieved during incidents.

Example:

``` text
Incident: Lost Child
        |
Retrieve:
Riverside Lost Child Procedure
        |
Ground response recommendation in event policy
```

------------------------------------------------------------------------

# 18. User and Membership Model

A user's global identity should not permanently define their role.

A person may coordinate one event and volunteer at another.

Conceptually:

``` ts
User {
  id
  email
  displayName
  phone?
}
```

``` ts
EventMembership {
  id
  eventId
  userId
  eventRole
  status
  joinedAt
}
```

Possible event roles:

``` text
coordinator
safety_lead
volunteer
```

Permissions should ultimately derive from event membership.

------------------------------------------------------------------------

# 19. Volunteer Profile

Volunteer information that persists between events:

``` ts
VolunteerProfile {
  userId
  phone
  emergencyContactName?
  emergencyContactPhone?
  experienceLevel?
}
```

Only collect information that is operationally justified.

------------------------------------------------------------------------

# 20. Event Invitations

Once the event is ready for recruitment, Ground Control generates a join
code and/or invitation link.

Example:

``` text
RIVERSIDE26
```

Volunteer flow:

``` text
Enter Code
    |
Validate Event
    |
Preview Riverside
    |
Join
    |
Create EventMembership
    |
Complete Event Onboarding
```

------------------------------------------------------------------------

# 21. Volunteer Certification Upload

Volunteers maintain reusable certifications.

Conceptually:

``` ts
Certification {
  id
  userId
  type
  certificateNumber?
  issuedAt?
  expiresAt?
  fileUrl
  extractionConfidence?
  verificationStatus
  verificationNotes?
}
```

Possible statuses:

``` text
processing
verified
requires_review
expired
rejected
```

------------------------------------------------------------------------

# 22. AI Certification Extraction

Certification workflow:

``` text
Volunteer uploads certificate
        |
Secure file storage
        |
AI extracts document fields
        |
Runtime validation
        |
Deterministic event-validity checks
        |
Verified or Needs Review
```

AI may extract:

-   certificate type
-   holder name
-   credential number
-   issue date
-   expiry date
-   issuing organisation

AI does NOT make the authoritative operational validity decision.

Deterministic logic should check:

-   whether the credential type satisfies the requirement
-   whether it is valid on the event date
-   whether the holder appears to match the volunteer
-   whether extracted information is sufficiently reliable

Example:

``` text
Certificate expires:
03 Dec 2026

Riverside starts:
12 Dec 2026

Result:
EXPIRES BEFORE EVENT
```

Low-confidence extraction should be routed to human review.

------------------------------------------------------------------------

# 23. Event-Specific Volunteer Onboarding

After joining an event, collect:

-   availability
-   preferred roles
-   undesirable roles
-   preferred shift windows
-   maximum desired hours
-   relevant event-specific acknowledgements

Availability should support multiple windows.

Example:

``` text
Saturday
08:00-22:00

Sunday
08:00-17:00
```

Preferences are soft constraints.

Safety requirements and certification requirements are hard constraints.

------------------------------------------------------------------------

# 24. Shift Requirement Generation

Once the verified event model contains:

-   posts
-   operating windows
-   staffing requirements

Ground Control can generate the shift requirements needed by the roster
engine.

Example:

``` text
Main Gate

10:00-12:00
8 volunteers
1 supervisor

12:00-22:00
4 volunteers
1 supervisor
```

Mo should be able to review generated shift requirements before
rostering.

------------------------------------------------------------------------

# 25. Roster Engine

Do NOT use an LLM as the roster optimiser.

Rostering is a constraint optimisation problem.

## Hard constraints

Examples:

-   volunteer must be available
-   required certification must be valid
-   volunteer cannot work overlapping shifts
-   minimum post coverage must be satisfied
-   critical certification coverage cannot be violated

## Soft constraints

Examples:

-   volunteer preferences
-   fairness
-   equal distribution of hours
-   experience distribution
-   preferred post

Output:

``` ts
Assignment {
  id
  shiftId
  userId
  status
  assignedAt
}
```

Mo can manually modify assignments.

------------------------------------------------------------------------

# 26. Roster Review

The coordinator should see:

-   uncovered shifts
-   certification gaps
-   overallocated volunteers
-   underallocated volunteers
-   critical coverage gaps
-   invalid assignments

Example:

``` text
SATURDAY

98% COVERED

Water Station B
14:00-18:00

First Aid requirement:
0 / 1

ACTION REQUIRED
```

------------------------------------------------------------------------

# 27. Roster Publishing

Mo publishes the roster.

Volunteer receives assigned shifts.

Example:

``` text
MY SHIFTS

SAT 12 DEC

10:00-14:00
Gate A

14:30-18:30
Water Station B
```

------------------------------------------------------------------------

# 28. Pre-Event Readiness

Ground Control should automatically check:

-   critical shifts covered
-   certifications valid for event dates
-   unresolved certification reviews
-   volunteers assigned but not fully onboarded
-   incomplete setup requirements
-   critical safety documents present
-   staffing gaps

Example:

``` text
RIVERSIDE READINESS

Operating Plan       98%
Roster Coverage      98%
Certifications       96%
Volunteer Onboarding 94%

5 actions required
```

This connects AI event setup with operational readiness.

------------------------------------------------------------------------

# 29. Event-Day Check-In

Volunteer can check into a shift.

Conceptually:

``` ts
CheckIn {
  id
  assignmentId
  checkedInAt
  checkedOutAt?
  status
}
```

Possible states:

``` text
scheduled
checked_in
late
missing
completed
```

GPS should not be required for the MVP.

------------------------------------------------------------------------

# 30. No-Show Detection

After a configurable grace period:

``` text
IF assigned volunteer has not checked in
THEN mark assignment missing
```

Immediately recalculate the post's actual coverage.

Example:

``` text
Water Station B

Required:
4 volunteers
1 First Aid

Current:
4 volunteers
0 First Aid

CRITICAL COVERAGE GAP
```

------------------------------------------------------------------------

# 31. Replacement and Reallocation Engine

This should primarily be deterministic.

Candidate ranking may consider:

-   required certification
-   current assignment
-   source-post coverage
-   availability
-   workload
-   status
-   approximate distance if known

Never recommend moving someone if doing so would knowingly violate
another critical post requirement.

Example:

``` text
Recommended replacement

Sarah Chen

First Aid: Valid
Current post: Gate C
Gate C after move: 5 / 4 minimum

[Approve]
[Alternative]
[Dismiss]
```

Consequential reallocation requires Mo's approval.

------------------------------------------------------------------------

# 32. Ground Control Live Dashboard

This is Mo's primary interface while the event is running.

Prioritize glanceability.

Show:

-   current event state
-   staffing coverage
-   missing volunteers
-   active incidents
-   unresolved critical incidents
-   location status
-   emerging-risk alerts
-   pending recommendations

Mo is assumed to be:

-   walking
-   using a phone
-   distracted
-   listening to radio traffic
-   making decisions quickly

Avoid dense analytics and long messages.

------------------------------------------------------------------------

# 33. Volunteer Live Mode

During a shift, the volunteer home screen becomes operational.

Example:

``` text
CURRENT ASSIGNMENT

Water Station B
14:00-18:00

Post: Water distribution

[REPORT INCIDENT]

Instructions
Site Map
Messages
```

Reporting should require minimal interaction.

------------------------------------------------------------------------

# 34. Incident Reporting

Initially support:

1.  voice
2.  text

Preferred live flow:

``` text
Volunteer reports incident
        |
Raw report captured
        |
Persist immediately
        |
Confirm receipt
        |
Speech-to-text / AI processing
        |
Structured incident update
```

Never delay persistence of the original report while waiting for AI.

------------------------------------------------------------------------

# 35. Incident Model

Conceptually:

``` ts
Incident {
  id
  eventId
  reportedBy
  createdAt

  rawTranscript
  description

  category
  severity

  locationId?

  peopleAffected?
  status

  aiConfidence?
}
```

Possible categories:

``` text
medical
heat
crowding
lost_child
security
infrastructure
weather
other
```

Possible states:

``` text
open
responding
monitoring
resolved
```

------------------------------------------------------------------------

# 36. AI Incident Understanding

Example input:

> Ground Control, we've got someone looking faint near Water B. They're
> conscious but pretty dizzy.

AI produces structured candidate data:

``` json
{
  "category": "heat",
  "location": "Water Station B",
  "severity": "moderate",
  "peopleAffected": 1,
  "summary": "Person conscious but experiencing dizziness near Water Station B.",
  "confidence": 0.91
}
```

Validate AI output against a strict runtime schema.

Generated locations and IDs must be checked against real event data.

Low-confidence fields should remain unresolved rather than fabricated.

------------------------------------------------------------------------

# 37. Incident Deduplication and Relationships

New incidents should be compared against recent relevant incidents
using:

-   semantic similarity
-   timestamps
-   locations
-   categories
-   people affected

Do not delete reports because AI thinks they are duplicates.

Preserve originals and create relationships.

Conceptually:

``` ts
IncidentRelation {
  incidentA
  incidentB
  relationType
  confidence
}
```

Possible relations:

``` text
possible_duplicate
related
same_area
possible_escalation
```

------------------------------------------------------------------------

# 38. Live Event State

Maintain structured current operational state.

Examples:

``` ts
LocationState {
  locationId
  activeVolunteerCount
  activeIncidentCount
  crowdLevel
  riskLevel
}
```

Other state may include:

-   weather
-   water-station availability
-   staffing coverage
-   First Aid availability
-   incident counts
-   crowd indicators
-   infrastructure state

Do not send the entire event database to an LLM for each analysis.

Provide only relevant context.

------------------------------------------------------------------------

# 39. Two-Speed Intelligence Architecture

Ground Control uses two operational loops.

## Fast Operational Loop

Primarily deterministic.

Handles:

-   incident persistence
-   check-ins
-   staffing coverage
-   certification validity
-   minimum staffing
-   simple thresholds
-   roster constraints

AI must not block this loop.

## Intelligence Loop

Runs asynchronously or when triggered.

Handles:

-   natural-language interpretation
-   semantic incident correlation
-   emerging-risk analysis
-   procedure retrieval
-   response planning
-   communication drafting

The UI should progressively update as AI analysis completes.

------------------------------------------------------------------------

# 40. Emerging Risk Detection

This is a core AI capability.

Example event state:

``` text
14:07 Heat illness @ Lawn
14:11 Queue growing @ Water B
14:13 Heat illness @ Lawn
14:15 Water B malfunction
14:17 Additional heat report

Temperature: 38C
Crowd level: HIGH
```

Ground Control should be able to surface:

``` text
EMERGING HEAT RISK
Lawn Stage

Confidence: HIGH

Why this was flagged

3 heat-related incidents within 18 minutes
Incidents concentrated around Lawn
Water Station B unavailable
Temperature 38C
Crowd level high
```

Explainability is part of the product, not optional decoration.

------------------------------------------------------------------------

# 41. Event Knowledge Retrieval

Live AI should use the event-specific documents collected during setup.

Example:

``` text
Incident
Lost Child
    |
Retrieve
Riverside Lost Child Procedure
    |
Generate grounded recommendation
```

Where possible, show the relevant source to Mo.

Do not rely solely on generic model knowledge for safety procedures.

------------------------------------------------------------------------

# 42. Response Planning

AI determines what operational resources may be appropriate.

Example structured output:

``` json
{
  "responseType": "heat_cluster",
  "requiredResources": {
    "firstAid": 2,
    "generalVolunteers": 3,
    "maintenance": 1
  },
  "suggestedActions": [
    "Inspect Water Station B",
    "Increase first aid presence at Lawn",
    "Provide crowd support around Water Station B",
    "Direct attendees toward Water Station C"
  ]
}
```

AI identifies needs.

The deterministic resource engine identifies actual people/resources
that can satisfy them.

------------------------------------------------------------------------

# 43. Response Recommendation

Combine:

``` text
AI reasoning
      +
deterministic feasibility
      =
operational recommendation
```

Example:

``` text
EMERGING HEAT RISK
Lawn Stage

4 related reports in 18 min.

PROPOSED RESPONSE

+2 First Aid
+3 Crowd Support
+1 Maintenance

Sarah Chen
Gate C -> Lawn
First Aid valid

James Lee
Entry A -> Lawn
First Aid valid

All source posts remain above minimum staffing.

[APPROVE]
[MODIFY]
[DISMISS]
```

------------------------------------------------------------------------

# 44. Human Approval Boundary

Ground Control may automatically:

-   transcribe
-   structure
-   classify
-   retrieve
-   correlate
-   calculate
-   identify potential patterns
-   draft
-   recommend

Ground Control must not autonomously:

-   declare an emergency
-   order an evacuation
-   contact emergency services
-   override event safety procedures
-   perform consequential safety reallocations without required approval
-   make high-consequence safety decisions

These remain human decisions.

------------------------------------------------------------------------

# 45. Dispatch

After Mo approves a response, create operational requests.

Example volunteer notification:

``` text
REASSIGNMENT REQUEST

Water Station B
Lawn

Multiple heat-related incidents reported.

Report to:
First Aid Point B

[ACCEPT]
```

Possible states:

``` text
pending
accepted
declined
en_route
arrived
completed
```

Ground Control should update in real time.

------------------------------------------------------------------------

# 46. Incident Timeline and Auditability

Preserve an append-oriented operational history.

Example:

``` text
14:07 Incident reported
14:07 AI classification completed
14:08 Related incident detected
14:09 Mo reviewed recommendation
14:09 Response approved
14:10 Sarah dispatched
14:14 Sarah arrived
14:25 Incident stabilised
14:31 Incident resolved
```

Preserve:

-   raw reports
-   AI interpretations
-   source evidence
-   human decisions
-   reassignment actions
-   status changes
-   resolution

------------------------------------------------------------------------

# 47. Incident Resolution

Mo can resolve an incident.

Capture:

-   resolution time
-   outcome
-   optional notes
-   resources used

AI may draft a summary, but Mo can review/edit it.

------------------------------------------------------------------------

# 48. Event Closeout

After the event, Ground Control can summarize:

-   staffing coverage
-   no-shows
-   replacements
-   incidents
-   incidents by location/category
-   response times
-   certification issues
-   operational timeline

AI may generate a concise post-event operational summary based on
structured records.

This is lower priority than the live event loop.

------------------------------------------------------------------------

# 49. AI Architecture

Treat AI as several narrow services rather than one giant autonomous
agent.

``` text
AI SERVICES

Event Document Extraction
Event Setup Interview
Event Model Drafting
Setup Gap Detection
Setup Contradiction Detection

Certification Extraction

Incident Extraction
Incident Similarity
Risk Analysis
Procedure Retrieval
Response Planning
Communication Generation
```

Each AI capability should:

-   have defined inputs
-   use structured outputs where practical
-   be runtime validated
-   expose uncertainty
-   fail gracefully
-   preserve source information
-   avoid blocking critical application functionality

------------------------------------------------------------------------

# 50. AI Failure Handling

Assume AI can fail.

## Setup AI failure

Uploaded documents and Mo's input must remain available.

Mo should still be able to manually configure the event.

## Low-confidence setup inference

Mark as:

``` text
NEEDS REVIEW
```

Do not silently confirm it.

## Incident AI failure

Preserve the raw incident and allow manual classification/response.

## Certification AI failure

Preserve the certificate and route it to human review.

## Hallucinated entity

Never accept generated IDs, locations, posts or resources without
checking them against authoritative application state.

------------------------------------------------------------------------

# 51. Coordinator Navigation

Conceptually:

``` text
Ground Control
+-- Live Overview
+-- Alerts
+-- Active Incidents

Crew
+-- Roster
+-- Volunteers
+-- Coverage
+-- Check-ins

Incidents
+-- Active
+-- Resolved
+-- Timeline

Event
+-- Setup
|   +-- Setup Assistant
|   +-- Review
|   +-- Site
|   +-- Posts
|   +-- Requirements
|
+-- Documents
+-- Readiness
+-- Settings
```

During setup, `Setup Assistant` should be the primary path.

The structured Site/Posts/Requirements screens remain available for
manual editing.

------------------------------------------------------------------------

# 52. Volunteer Navigation

Conceptually:

``` text
Home
+-- Current / Next Shift
+-- Report Incident
+-- Alerts

Events
+-- Current Events
+-- Join Event
+-- Past Events

Schedule

Profile
+-- Personal Details
+-- Certifications
+-- Preferences
```

During an active shift, operational information should dominate the home
screen.

------------------------------------------------------------------------

# 53. Development Phases

## Phase 0: Project Foundation

Build:

-   Expo project
-   TypeScript
-   Expo Router
-   backend connection
-   environment configuration
-   authentication
-   shared design components
-   error/loading states

Exit condition:

> User can register, log in and remain authenticated.

------------------------------------------------------------------------

## Phase 1: Users, Organisations and Event Roles

Build:

-   User
-   Organisation
-   EventMembership
-   coordinator/volunteer role-aware UI
-   permissions foundation

Exit condition:

> The application can distinguish what a user is allowed to do for a
> specific event.

------------------------------------------------------------------------

## Phase 2: Basic Event Creation

Build:

-   Event
-   basic event creation flow
-   event editing
-   event lifecycle status

Do NOT require manual location/post setup here.

Exit condition:

> Mo can create Riverside and enter the AI Event Setup workspace.

------------------------------------------------------------------------

## Phase 3: AI Event Setup Workspace

Build:

-   setup home
-   setup progress
-   text-based event description input
-   setup session state
-   review entry point
-   map upload directly in setup
-   tap-to-create locations and posts on the uploaded site image
-   editable pins and circles
-   optional separate post check-in circles (configuration only)

Initial version may use text before voice is added.

Exit condition:

> Mo can describe Riverside naturally and Ground Control retains that
> setup context. Mo can upload a site plan, tap to create and edit
> locations/posts as pins or circles, and save optional post
> check-in areas for the later attendance flow.

------------------------------------------------------------------------

## Phase 4: Event Document and Map Ingestion

Build:

-   file upload
-   EventDocument
-   document type
-   processing status
-   map upload
-   source metadata

Support the files needed by the canonical demo.

Reuse the site-map upload already available in Phase 3. Add document
ingestion and source/processing metadata here.

Exit condition:

> Mo can give Ground Control a site map and operational/safety
> documents.

------------------------------------------------------------------------

## Phase 5: AI Event Extraction

Build AI service capable of extracting candidate:

-   locations
-   posts
-   staffing numbers
-   operating windows
-   certification requirements
-   supervisors
-   procedures

Use structured validated outputs.

Do not immediately mark extracted information as confirmed.

Exit condition:

> Ground Control can turn setup input into a draft operational
> structure.

------------------------------------------------------------------------

## Phase 6: Provenance and Verification

Build:

-   field-level or entity-level provenance
-   source type
-   source reference
-   confidence
-   verification status
-   manual confirmation

Exit condition:

> Mo can tell what Ground Control learned from him, what came from a
> document, and what was inferred.

------------------------------------------------------------------------

## Phase 7: Setup Gap and Contradiction Engine

Build logic to identify:

-   missing staffing
-   missing hours
-   missing certification requirements
-   missing supervisor/escalation
-   ambiguous counts
-   contradictions between sources
-   safety requirements not represented in staffing plan

Use deterministic checks where possible and AI reasoning where semantic
comparison is required.

Exit condition:

> Ground Control can identify what it still needs from Mo.

------------------------------------------------------------------------

## Phase 8: Conversational Clarification

Build the AI setup interview loop:

``` text
Draft model
   |
Find highest-value unresolved issue
   |
Ask Mo one clear question
   |
Interpret answer
   |
Update draft
   |
Repeat
```

Avoid overwhelming Mo with every issue simultaneously.

Exit condition:

> Mo can resolve ambiguous event setup through conversation rather than
> manually hunting through forms.

------------------------------------------------------------------------

## Phase 9: Setup Review Dashboard

Build:

-   completeness summary
-   locations/posts summary
-   needs-attention list
-   confidence/review states
-   confirm/edit actions

Exit condition:

> Mo can review the entire generated Riverside operating plan and see
> exactly what requires attention.

------------------------------------------------------------------------

## Phase 10: Manual Structured Editor

Build:

-   locations
-   posts
-   staffing requirements
-   operating windows
-   certifications
-   supervisors
-   criticality
-   instructions

This is the advanced precision editor.

Exit condition:

> Mo can manually correct any part of the AI-generated event model.

------------------------------------------------------------------------

## Phase 11: Verified Event Model

Add validation required before rostering.

Ground Control should distinguish:

``` text
draft
needs_review
verified
```

Do not require every low-risk descriptive field to be manually confirmed
if unnecessary, but operationally consequential requirements must be
trustworthy.

Exit condition:

> Riverside contains a sufficiently verified structured operating model
> for shift generation.

------------------------------------------------------------------------

## Phase 12: Event Publishing and Joining

Build:

-   event join code
-   join event screen
-   event preview
-   EventMembership creation

Exit condition:

> Volunteer can enter `RIVERSIDE26` and join Riverside.

------------------------------------------------------------------------

## Phase 13: Volunteer Profile and Certifications

Build:

-   reusable VolunteerProfile
-   certification upload
-   secure file storage
-   certification status

Exit condition:

> Volunteer can maintain qualifications independently of one event.

------------------------------------------------------------------------

## Phase 14: AI Certification Processing

Build:

-   certificate extraction
-   runtime validation
-   deterministic event-date validity
-   low-confidence review flow

Exit condition:

> A volunteer's First Aid certificate can be processed and Ground
> Control knows whether it is valid for Riverside.

------------------------------------------------------------------------

## Phase 15: Availability and Preferences

Build:

-   event-specific availability
-   role preferences
-   shift preferences
-   desired/max hours

Exit condition:

> Ground Control has the volunteer-side information required for
> rostering.

------------------------------------------------------------------------

## Phase 16: Shift Generation

Generate shift requirements from the verified operating model.

Allow Mo to review/edit generated shifts.

Exit condition:

> Riverside's posts and operating requirements have become concrete
> staffing shifts.

------------------------------------------------------------------------

## Phase 17: Roster Engine

Build:

-   hard constraints
-   soft constraints
-   Assignment
-   roster generation
-   coverage calculations
-   manual changes

Exit condition:

> Mo can generate a valid Riverside roster.

------------------------------------------------------------------------

## Phase 18: Roster Review and Publishing

Build:

-   coverage dashboard
-   gap detection
-   roster publishing
-   volunteer schedule
-   readiness checks

Exit condition:

> Volunteers can see their Riverside shifts and Mo can see unresolved
> staffing problems.

------------------------------------------------------------------------

## Phase 19: Check-In and Live Staffing

Build:

-   CheckIn
-   live attendance
-   missing/late detection
-   post coverage recalculation
-   replacement candidate engine

Exit condition:

> A missing volunteer automatically produces an accurate coverage
> warning and feasible replacement options.

------------------------------------------------------------------------

## Phase 20: Ground Control Live Dashboard

Build the primary live coordinator interface.

Integrate:

-   staffing
-   check-ins
-   incidents
-   locations
-   event state
-   alerts
-   recommendations

Exit condition:

> Mo can understand Riverside's operational state from one mobile
> screen.

------------------------------------------------------------------------

## Phase 21: Incident Reporting

Build:

-   volunteer incident interface
-   text reporting
-   voice reporting
-   immediate persistence
-   processing state

Exit condition:

> Volunteer can report an incident in seconds without waiting for AI
> analysis.

------------------------------------------------------------------------

## Phase 22: AI Incident Understanding

Build:

-   structured extraction
-   category
-   location matching
-   severity
-   summary
-   confidence
-   failure states

Exit condition:

> Natural-language reports reliably become structured incidents.

------------------------------------------------------------------------

## Phase 23: Incident Correlation

Build:

-   recent relevant incident retrieval
-   semantic comparison
-   IncidentRelation
-   duplicate detection
-   related incident grouping

Exit condition:

> Ground Control can recognise reports that describe the same or related
> events.

------------------------------------------------------------------------

## Phase 24: Emerging Risk Engine

Build:

-   EventState
-   LocationState
-   deterministic triggers
-   AI risk analysis
-   evidence generation
-   explainable alerts

Exit condition:

> Multiple weak signals can produce an explainable emerging-risk alert.

------------------------------------------------------------------------

## Phase 25: Procedure Retrieval

Index event documents collected during setup.

Build event-scoped retrieval.

Exit condition:

> Live recommendations can reference Riverside-specific procedures.

------------------------------------------------------------------------

## Phase 26: Response Engine

Build:

-   AI resource requirement generation
-   deterministic candidate selection
-   coverage protection
-   recommendation UI

Exit condition:

> Ground Control can transform an emerging risk into a feasible
> operational response.

------------------------------------------------------------------------

## Phase 27: Human Approval and Dispatch

Build:

-   approve
-   modify
-   dismiss
-   response records
-   reassignment requests
-   volunteer acknowledgement
-   response status

Exit condition:

> Mo can approve a response and the relevant volunteers receive
> instructions.

------------------------------------------------------------------------

## Phase 28: Monitoring and Resolution

Build:

-   en-route/arrived/completed states
-   incident timeline
-   response monitoring
-   resolution
-   audit history

Exit condition:

> An incident can move from report to response to resolution without
> leaving Ground Control.

------------------------------------------------------------------------

## Phase 29: Event Closeout

Build:

-   clock-out
-   completed event state
-   summary metrics
-   AI-generated event summary

Exit condition:

> Riverside has a complete operational record after the event.

------------------------------------------------------------------------

# 54. Priority Levels

## P0: Core Product and Demo

-   authentication
-   event roles
-   basic event creation
-   AI setup workspace
-   natural-language setup
-   draft event model
-   provenance/review
-   setup clarification
-   manual structured editing
-   volunteer joining
-   volunteer profile
-   certifications
-   availability
-   shift generation
-   roster
-   check-in
-   Ground Control dashboard
-   incident reporting
-   AI incident extraction
-   incident correlation
-   emerging-risk alert
-   response recommendation
-   human approval
-   volunteer reassignment

## P1: Strong Product Features

-   document-driven setup extraction
-   safety-plan requirement extraction
-   setup contradiction detection
-   map-assisted setup
-   certification AI extraction
-   no-show replacement
-   procedure retrieval
-   incident timelines
-   readiness dashboard
-   response monitoring

## P2: Stretch

-   advanced map interpretation
-   real weather integration
-   social-signal ingestion
-   push notifications
-   crowd-density integrations
-   advanced roster optimisation
-   predictive analytics
-   post-event analytics
-   external workforce integrations

Do not begin P2 work while important P0 flows are incomplete.

------------------------------------------------------------------------

# 55. Canonical Demo Scenario

The complete product demo should begin before the roster exists.

## Part 1: Mo Creates Riverside

Mo creates:

``` text
Riverside 2026
12-14 December
15,000 attendees
Approx. 300 volunteers
```

Ground Control asks:

> How would you like to set up Riverside?

Mo provides:

-   site map
-   safety plan
-   run sheet

Then says:

> We have Lawn, Riverside and Entry. Lawn has the main stage, Water B
> and First Aid. Water B needs four volunteers and one should have First
> Aid. Main Stage needs six crowd volunteers and at least one
> experienced person. Main Entry needs eight people when gates open,
> then four after the rush. We also need a float team.

Ground Control creates the initial operating model.

------------------------------------------------------------------------

## Part 2: Ground Control Clarifies

Ground Control asks:

> Does the First Aid-qualified volunteer at Water B count as one of the
> four?

Mo:

> Yes.

Ground Control asks:

> The run sheet shows Lawn Stage operating from 12:00 to 22:30. Should
> crowd coverage begin 30 minutes before the first performance?

Mo:

> Yes.

Ground Control flags:

> Your safety plan requires two First Aid-qualified staff in the Lawn
> precinct while patrons are present. The current setup only guarantees
> one.

Mo adjusts/accepts the requirement.

------------------------------------------------------------------------

## Part 3: Mo Reviews Setup

Ground Control shows:

``` text
RIVERSIDE SETUP

18 locations
27 posts

96% complete

2 items need attention
```

Mo opens one post, manually changes a requirement, and confirms the
plan.

This demonstrates that AI accelerates setup without removing human
control.

------------------------------------------------------------------------

## Part 4: Volunteer Joins

Sarah:

-   enters `RIVERSIDE26`
-   joins Riverside
-   uploads First Aid certificate
-   AI extracts certificate
-   deterministic logic verifies it is valid during the event
-   submits availability

------------------------------------------------------------------------

## Part 5: Roster

Ground Control generates the roster.

Mo reviews coverage and publishes it.

Sarah receives her shifts.

------------------------------------------------------------------------

## Part 6: Event Day

### 14:00

A First Aid volunteer at Water B fails to check in.

Ground Control detects:

``` text
CRITICAL COVERAGE GAP

Water Station B

First Aid:
0 / 1
```

It proposes a feasible replacement.

Mo approves.

------------------------------------------------------------------------

## Part 7: Incident Intelligence

### 14:07

Volunteer reports:

> Someone near Water B looks like they're about to faint. They're
> conscious but really dizzy.

Ground Control structures the report.

### 14:11

Crowding report near Water B.

### 14:13

Second heat-related incident.

### 14:15

Water B reported malfunctioning.

### 14:16

Ground Control surfaces:

``` text
EMERGING HEAT RISK
Lawn Stage

HIGH CONFIDENCE

WHY

3 heat-related incidents
Water Station B unavailable
38C temperature
High crowd conditions
```

------------------------------------------------------------------------

## Part 8: Response

Ground Control proposes:

``` text
+2 First Aid
+3 Crowd Support
+1 Maintenance
```

The deterministic resource engine identifies feasible volunteers without
breaking other posts.

Mo reviews:

``` text
[APPROVE]
[MODIFY]
[DISMISS]
```

Mo approves.

Volunteers receive reassignment requests.

Ground Control tracks:

``` text
Requested
Accepted
En route
Arrived
```

The incident eventually resolves.

This is the primary end-to-end integration scenario.

------------------------------------------------------------------------

# 56. Three Core AI Stories

The product should be explainable through three major AI capabilities.

## 1. Before the Event: AI Operations Planner

Ground Control turns:

-   conversations
-   maps
-   run sheets
-   existing rosters
-   safety documents

into a structured, reviewable operating model.

It identifies missing information and asks Mo targeted questions.

## 2. During the Event: AI Situational Awareness

Ground Control turns fragmented:

-   radio/voice reports
-   incidents
-   staffing state
-   infrastructure state
-   operational conditions

into a coherent live picture.

It identifies relationships Mo may not have time to notice.

## 3. When Conditions Change: AI Response Planner

Ground Control translates the emerging situation into resource needs.

Deterministic systems determine what actions are actually feasible.

Mo makes the consequential decision.

Together:

``` text
PLAN
  |
OBSERVE
  |
UNDERSTAND
  |
RESPOND
```

AI assists across the event lifecycle without replacing human authority.

------------------------------------------------------------------------

# 57. Product Rules

1.  Mo should not have to think like the database.
2.  Natural language and existing documents should be the default path
    into event setup.
3.  The structured event model remains authoritative for deterministic
    operations.
4.  AI-generated setup data is a draft until sufficiently verified.
5.  Preserve provenance for important AI-generated operational
    information.
6.  Ask targeted clarification questions instead of silently guessing.
7.  Do not use AI where deterministic logic is more reliable.
8.  Never block incident capture while waiting for AI.
9.  Never allow generated AI output to bypass database validation.
10. Consequential safety decisions require a human.
11. AI recommendations should explain their evidence.
12. AI uncertainty should be visible.
13. Preserve original reports even when AI relates or merges their
    presentation.
14. The app must remain usable when AI services fail.
15. Design for Mo using a phone while moving through a busy event.
16. Prioritise complete operational loops over disconnected feature
    count.

------------------------------------------------------------------------

# 58. Instructions for Coding Agents

When Codex, Claude or another coding agent works on this repository:

1.  Read `AGENTS.md`.
2.  Read the relevant section of this roadmap.
3.  Identify the current development phase.
4.  Inspect existing implementation before creating architecture.
5.  Reuse existing components, types, services and patterns where
    practical.
6.  Do not implement later roadmap phases unnecessarily.
7.  Keep business logic separate from React components.
8.  Keep privileged AI calls server-side.
9.  Use typed structured outputs for AI workflows.
10. Validate AI output before authoritative state changes.
11. Treat staffing, certification and safety constraints as
    deterministic business rules.
12. Preserve provenance for AI-created event setup data.
13. Never silently convert an AI inference into a confirmed safety
    requirement.
14. Preserve incident auditability.
15. Keep coordinator interfaces glanceable and volunteer interfaces
    simple.
16. Test the phase exit condition before declaring it complete.
17. Prefer an end-to-end working vertical slice over several incomplete
    features.
18. Update this roadmap only when product or architecture decisions
    materially change.

------------------------------------------------------------------------

# 59. Definition of Prototype Success

The prototype succeeds when a judge can watch:

``` text
Mo creates Riverside
        |
Mo uploads existing event information
        |
Mo explains the event naturally
        |
AI builds the operating plan
        |
AI identifies missing information
        |
Mo answers clarification questions
        |
Mo reviews / edits the generated plan
        |
Volunteer joins Riverside
        |
Certification processed
        |
Volunteer rostered
        |
Volunteer checks in
        |
Incident reported
        |
AI understands report
        |
Multiple reports correlate
        |
Emerging risk identified
        |
Ground Control explains why
        |
Operational response proposed
        |
Mo approves
        |
Volunteers receive instructions
        |
Response is tracked
```

without the team needing to explain away major missing steps.

The central product experience is not a collection of AI features.

It is a continuous operating system that turns human event knowledge
into structured plans, turns live signals into situational awareness,
and turns that awareness into human-approved action.


## Implementation checkpoint — 7 October 2026

Repository implementation now covers revised Phases 4–12 and the event-membership permissions they depend on. It includes private document ingestion; a server-only Gemini adapter; validated, persisted candidate extraction; provenance and review states; deterministic gaps plus semantic clarification; a one-question conversation; candidate/current-plan review; the manual operating editor; verification; recruitment codes, previews and joining. Existing Phase 3 map and check-in-area setup remains available. Phases 13–18 are now implemented in the repository as described below; attendance and incidents remain later phases. Voice incident capture is now implemented as a radio-style recording flow with private storage, coordinator playback and optional server-side transcription.

Local checks cover migrations and role isolation, the Riverside setup-to-join database flow, candidate/source validation and failure retention, app/server typechecking, lint, and iOS/Android/web exports. Hosted exit conditions remain pending deployment of migrations 009–011 and the setup-ai function, server-side Gemini configuration, and a real device/live provider walkthrough. The workspace has the Supabase public client configuration but no administrative access token or Gemini key; local verification does not imply hosted deployment.


### Phases 13–18 implementation checkpoint

Added reusable private certificates with immutable originals and review history; asynchronous Gemini extraction with runtime validation and deterministic holder/date/confidence checks; full-event qualification validity; human certificate/experience review; event-specific multi-window availability and preferences; versioned shifts generated from the verified operating model; deterministic bounded rostering with manual assignments, coverage gaps and hour checks; independent database publication gates; and private volunteer schedules. Qualified staff count within the required total. Replacement drafts retain the previous published roster until human approval.

Local PostgreSQL scenarios cover the Riverside certificate → availability → shifts → roster → publication → own-schedule flow, permission isolation, failed/uncertain extraction, evidence retention, expiry during the event, uncovered operating periods, retries and replacement publication history. Domain/worker tests, lint, app/server typechecks and exports are recorded in README. Migrations 012–017 and certificate-ai/roster-generate are prepared alongside the prior setup deployment. Phases 19–21 include assignment-based check-in/out, deterministic late/missing attendance on dashboard refresh, immediate persisted text incident reports and a coordinator live operations snapshot. Phases 22–29 now include persisted structured incident analysis, relation preservation, risk alerts, event procedure references, human-approved response proposals, dispatch acknowledgement, timelines, resolution and closeout. Hosted activation remains blocked by missing Supabase administrative access and Gemini credentials; the deployment preflight made no remote changes. Richer asynchronous AI, voice and real-time integrations remain future enhancements.
