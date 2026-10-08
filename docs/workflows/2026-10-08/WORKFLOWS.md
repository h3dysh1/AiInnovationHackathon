# Ground Control: ordered volunteer and coordinator workflows

Actual Ground Control screens captured at 390 × 844 CSS pixels in Chrome. The walkthrough combines seeded Riverside demo records with browser-local simulated states. Signup, saves, uploads, AI results, roster generation, incident receipt, approvals and closeout were simulated for screenshots; no operational event records were changed. Alex illustrates new-account onboarding; Sarah and Mo illustrate the existing volunteer and coordinator demos. These are ordered representative journeys across preparation and live demo variants, rather than a single production transaction.

Native iOS/Android appearance, device push delivery, camera ingestion, real AI processing, email delivery and offline background retries were not validated by these captures. Voice screenshots use a simulated browser microphone and do not send or transcribe audio. Blank or first-use states are included where they explain entry into a feature; populated examples follow where relevant.

[Open the screenshot gallery](index.html) · [Volunteer PDF](volunteer-workflow.pdf) · [Coordinator PDF](coordinator-workflow.pdf)

## How to read this

Both roles complete the same account onboarding. A coordinator then creates a workspace from Profile. Each event has a separate volunteer onboarding flow. Optional phases happen when the operational situation requires them; they are not mandatory tasks for every shift.

Existing users skip account signup and onboarding. Volunteers can update availability later. Coordinators can correct plans manually instead of using the AI assistant. A verified operating plan gates recruitment and roster generation. An approved response gates reassignment instructions.

### Shared operational handoff

Coordinator publishes recruitment → Volunteer joins and prepares → Coordinator reviews certificates and publishes roster → Volunteer checks in → Volunteer reports incident → Coordinator reviews original and evidence → Coordinator approves eligible crew → Volunteer acknowledges, travels, arrives and completes task → Coordinator confirms completion and closes event.

## Volunteer

### Account onboarding

1. **Welcome to Ground Control** — Choose Get started for a new account. Returning users choose Log in. [Screenshot](screenshots/welcome.png)

2. **Create the account: email** — Enter your email and continue. [Screenshot](screenshots/signup-email.png)

3. **Create the account: password** — Choose a password and create your account. [Screenshot](screenshots/signup-password.png)

4. **Confirm the signup email** — Open the confirmation email, then return to log in. The email itself is outside the app. [Screenshot](screenshots/confirm-email.png)

5. **Log in after email confirmation** — Return after confirming the signup email and enter your email. [Screenshot](screenshots/shared-login-email.png)

6. **Authenticate** — Enter your password to continue. The password is masked. [Screenshot](screenshots/shared-login-password.png)

7. **Account onboarding: name** — Enter the name teammates should use. [Screenshot](screenshots/profile-name.png)

8. **Account onboarding: phone** — Add a contact phone number. [Screenshot](screenshots/profile-phone.png)

9. **Account onboarding: emergency contact** — Add an emergency contact name and phone number. [Screenshot](screenshots/profile-emergency.png)

10. **Account onboarding: experience** — Choose whether this is your first event or you have crewed before. [Screenshot](screenshots/profile-experience.png)

11. **Account onboarding: ready** — Review the saved setup and continue to Find my first event. [Screenshot](screenshots/profile-review.png)

### Join and prepare for the event

12. **Volunteer home** — Start with the current assignment or join your first event. [Screenshot](screenshots/volunteer-home.png)

13. **Enter the event code** — Use the join code supplied by the coordinator. [Screenshot](screenshots/v-join-code.png)

14. **Confirm the event** — Check the event name, location and dates before joining. [Screenshot](screenshots/v-join-preview.png)

15. **Event onboarding: welcome** — Review this event and start Let’s get ready. [Screenshot](screenshots/event-welcome.png)

16. **Event onboarding: availability** — Add the local time windows when you can volunteer. [Screenshot](screenshots/event-availability.png)

17. **Event onboarding: hours and preferences** — Set desired hours. Expand optional limits and preferences as needed. [Screenshot](screenshots/event-hours.png)

18. **Event onboarding: qualifications** — Check the event’s qualification requirements. Upload evidence when needed; an unverified certificate does not make you eligible for a qualified post. [Screenshot](screenshots/event-qualification-0.png)

### Qualification evidence when required — optional / when needed

19. **Choose certificate evidence** — Select the original certificate, name it and save it for extraction and human review. [Screenshot](screenshots/v-certificate-selected.png)

20. **Evidence saved; review required** — The original is saved; extracted fields require human review before qualification use. [Screenshot](screenshots/v-certificate-saved.png)

### Finish event preparation

21. **Event onboarding: briefing** — Read each procedure and acknowledge the current event briefing. [Screenshot](screenshots/event-briefing.png)

22. **Event onboarding: ready** — Availability and preparation are saved. Continue to the event; joining does not guarantee a shift. [Screenshot](screenshots/event-ready.png)

### Review events, availability and shifts

23. **Your events** — Review joined events. Past events are a separate expandable group. [Screenshot](screenshots/volunteer-events.png)

24. **Switch the selected event** — Choose which event your shifts and event tools belong to. [Screenshot](screenshots/v-choose-event.png)

25. **Update availability and preferences** — Change availability before roster generation and review event instructions. [Screenshot](screenshots/v-availability-edit.png)

26. **Published shifts** — Review time, location, instructions, supervisor and escalation contact. [Screenshot](screenshots/v-schedule.png)

27. **Event and current assignment** — See your current assignment, incident reporting and event preparation. [Screenshot](screenshots/v-event.png)

### Arrive and work your shift

28. **Arrive and check in** — Check in to the current assignment so the coordinator sees coverage. [Screenshot](screenshots/v-checkin.png)

29. **Check-in confirmed** — Your assignment now shows checked in. [Screenshot](screenshots/v-checked-in.png)

### Report an incident when needed — optional / when needed

30. **Report an incident** — Give the location, what happened and urgent details; typing and voice are available. [Screenshot](screenshots/v-incident.png)

31. **Record a voice incident** — Speak the location, what happened and anything urgent. Browser microphone input is simulated. [Screenshot](screenshots/v-voice-recording.png)

32. **Review the voice report before sending** — Add written context if helpful. This capture does not send or transcribe the recording. [Screenshot](screenshots/v-voice-ready.png)

33. **Report received; AI follows** — Receipt is shown before AI analysis; the original report is retained. [Screenshot](screenshots/v-incident-received.png)

### Read coordinator updates

34. **Volunteer updates** — Read new shift or coordinator instructions. [Screenshot](screenshots/v-notifications.png)

35. **Optional phone alerts** — Enable alerts in an installed mobile build; web screenshots show the settings only. [Screenshot](screenshots/v-phone-notifications.png)

### Carry out an approved response when requested — optional / when needed

36. **Receive an approved instruction** — Read the coordinator-approved reassignment; accept or decline. [Screenshot](screenshots/v-dispatch.png)

37. **Acknowledge the instruction** — Tell the coordinator you accepted the task. [Screenshot](screenshots/v-dispatch-accepted.png)

38. **Travel to the destination** — Update your progress when you are on the way. [Screenshot](screenshots/v-dispatch-en-route.png)

39. **Confirm arrival** — Arrival tells the coordinator the response is on site. [Screenshot](screenshots/v-dispatch-arrived.png)

40. **Finish the response task** — Mark the task complete and await further instructions. [Screenshot](screenshots/v-dispatch-complete.png)

### Finish the shift

41. **Check out after the shift** — Finish the assignment and keep attendance accurate. [Screenshot](screenshots/v-checkout.png)

### Maintain your account between events — optional / when needed

42. **Profile and emergency details** — Keep contact details, emergency contact and certificates up to date. [Screenshot](screenshots/v-profile.png)

43. **Reusable certificate library** — Upload qualifications once; each event checks its own requirements. [Screenshot](screenshots/v-certificates.png)

## Event coordinator

### Account onboarding

1. **Welcome to Ground Control** — Choose Get started for a new account. Returning users choose Log in. [Screenshot](screenshots/welcome.png)

2. **Create the account: email** — Enter your email and continue. [Screenshot](screenshots/signup-email.png)

3. **Create the account: password** — Choose a password and create your account. [Screenshot](screenshots/signup-password.png)

4. **Confirm the signup email** — Open the confirmation email, then return to log in. The email itself is outside the app. [Screenshot](screenshots/confirm-email.png)

5. **Log in after email confirmation** — Return after confirming the signup email and enter your email. [Screenshot](screenshots/shared-login-email.png)

6. **Authenticate** — Enter your password to continue. The password is masked. [Screenshot](screenshots/shared-login-password.png)

7. **Account onboarding: name** — Enter the name teammates should use. [Screenshot](screenshots/profile-name.png)

8. **Account onboarding: phone** — Add a contact phone number. [Screenshot](screenshots/profile-phone.png)

9. **Account onboarding: emergency contact** — Add an emergency contact name and phone number. [Screenshot](screenshots/profile-emergency.png)

10. **Account onboarding: experience** — Choose whether this is your first event or you have crewed before. [Screenshot](screenshots/profile-experience.png)

11. **Account onboarding: ready** — Review the saved setup and continue to Find my first event. [Screenshot](screenshots/profile-review.png)

### Create your workspace

12. **Create a coordinator workspace** — After shared account onboarding, create your organisation from Profile. [Screenshot](screenshots/c-workspace.png)

13. **Coordinator home** — Review live and preparing events; choose Riverside. [Screenshot](screenshots/c-home.png)

### Create an event

14. **Choose the organisation** — Choose the organisation responsible for this event. [Screenshot](screenshots/c-create-organisation.png)

15. **Name the event and venue** — Fill the event name and venue; expand optional details if needed. [Screenshot](screenshots/c-create-details.png)

16. **Dates and operating hours** — Set local event dates, opening hours and timezone. [Screenshot](screenshots/c-create-dates.png)

17. **Review the draft event** — Check the organisation, venue and dates before creating the draft. [Screenshot](screenshots/c-create-review.png)

### Describe and support the operating plan

18. **Describe the operating plan** — Enter event requirements and save the setup description. [Screenshot](screenshots/c-setup.png)

19. **Write the event brief** — Save clear operating requirements before asking AI to draft the plan. [Screenshot](screenshots/c-setup-filled.png)

20. **Supporting documents** — Choose and upload original plans, procedures or supporting documents. [Screenshot](screenshots/c-documents.png)

21. **Select a supporting document** — Choose the original and set its title and document type before uploading. [Screenshot](screenshots/c-document-selected.png)

### Draft and review the AI proposal

22. **AI planning assistant** — Generate a candidate operating plan and answer any clarification questions. [Screenshot](screenshots/c-assistant.png)

23. **Answer a planning question** — Clarify hours, staffing, qualifications or escalation; answers are saved before AI runs. [Screenshot](screenshots/c-assistant-answer.png)

24. **Candidate plan ready for review** — A completed AI job produces a proposal and still requires human review. [Screenshot](screenshots/c-assistant-result.png)

25. **Inspect the unapplied AI candidate** — Check sources and proposed staffing before applying an unconfirmed draft. [Screenshot](screenshots/c-candidate-plan.png)

26. **Apply the reviewed draft** — Applying a candidate creates an unconfirmed draft; verification remains a separate human step. [Screenshot](screenshots/c-candidate-apply.png)

### Correct the site and procedures — optional / when needed

27. **Locations and staffing posts** — Review areas, posts, coverage and qualification requirements. [Screenshot](screenshots/c-site.png)

28. **Add or correct a location** — Use the manual editor to make the operating plan accurate. [Screenshot](screenshots/c-site-add.png)

29. **Map with positioned posts** — View areas, staffing posts and check-in zones on a site plan. [Screenshot](screenshots/c-map-populated.png)

30. **Edit an area on the map** — Review the location position, radius and details before saving. [Screenshot](screenshots/c-map-edit.png)

31. **Operating hours and procedures** — Confirm operating windows and the procedures volunteers must acknowledge. [Screenshot](screenshots/c-operations.png)

32. **Edit the volunteer procedure** — Keep the briefing concise and state who owns escalation decisions. [Screenshot](screenshots/c-procedure-edit.png)

### Verify and open recruitment

33. **Review the operating plan** — Review proposed records, resolve issues and verify the plan before recruitment. [Screenshot](screenshots/c-review.png)

34. **Verify the operating plan** — Confirm the reviewed operating records and verify the model before recruitment. [Screenshot](screenshots/c-verify.png)

35. **Recruitment and join code** — Publish recruitment after verification; share the join code with volunteers. [Screenshot](screenshots/c-publish.png)

36. **Event team and permissions** — Find a member and review their event role. [Screenshot](screenshots/c-team.png)

37. **Review event access** — Set roles only for people who need coordinator or safety-lead permissions. [Screenshot](screenshots/c-team-permissions.png)

### Review volunteer qualifications

38. **Coordinator updates** — Open qualification warnings or other operational updates. [Screenshot](screenshots/c-notifications.png)

39. **Crew qualifications** — Inspect extracted certificate details before human approval. [Screenshot](screenshots/c-qualifications.png)

40. **Human certificate review** — Compare extracted fields with the original; record the review before approving. [Screenshot](screenshots/c-certificate-review.png)

41. **Certificate approved** — Human approval is recorded; event-date validity remains a separate deterministic check. [Screenshot](screenshots/c-certificate-approved.png)

### Generate, review and publish shifts

42. **Review rest and break rules** — Set scheduling limits before generating assignments. [Screenshot](screenshots/c-rest-rules.png)

43. **Generate shift times** — Start from the verified operating windows and choose a shift length. [Screenshot](screenshots/c-roster-generate.png)

44. **Review the shift draft** — See staffing requirements and any unfilled places before assigning crew. [Screenshot](screenshots/c-roster-draft.png)

45. **Review the assigned candidate** — Deterministic assignment checks availability, qualifications and coverage. [Screenshot](screenshots/c-roster-assigned.png)

46. **Confirm roster publication** — Confirm that reviewed assignments should be shared with volunteers. [Screenshot](screenshots/c-roster-confirm.png)

47. **Roster published** — Crew can now view their own assignments. [Screenshot](screenshots/c-roster-published.png)

### Start live operations

48. **Event overview and next step** — Use the event stage to decide whether to finish setup, review crew or open Alerts. [Screenshot](screenshots/c-event-overview.png)

49. **Check readiness and start operations** — Check acknowledgements and certificates; choose a no-show grace period before starting. [Screenshot](screenshots/c-start-live.png)

### Review incidents and emerging risks

50. **Prioritise incidents and risks** — Review urgency colours, severity labels and the most urgent incident first. [Screenshot](screenshots/c-alerts.png)

51. **Read the original and AI interpretation** — Preserve the original report; confirm or correct the AI interpretation before responding. [Screenshot](screenshots/c-incident-review.png)

52. **Assess emerging risk evidence** — Read supporting reports and confirm conditions on site. [Screenshot](screenshots/c-risk-evidence.png)

### Use supporting operational tools — optional / when needed

53. **Crowd control** — Inspect advisory camera estimates and crowding alerts; verify on the ground. [Screenshot](screenshots/c-crowd.png)

54. **Crowd estimates on the site map** — Read density estimates alongside their site location and freshness. [Screenshot](screenshots/c-crowd-map.png)

55. **Camera reading and trend** — Review count, density, trend and freshness before requesting a response. [Screenshot](screenshots/c-camera.png)

56. **Review modelled weather** — Read current advisory conditions and check local procedures. [Screenshot](screenshots/c-weather.png)

57. **Demo social feed** — Original social posts remain synthetic and unverified. [Screenshot](screenshots/c-social.png)

58. **Record a measured site observation** — Add the location and observed facts so the risk review has a grounded source. [Screenshot](screenshots/c-observation.png)

59. **Review operational history** — Keep incident receipt, human decisions and assignment changes visible. [Screenshot](screenshots/c-timeline.png)

60. **Event tools** — Find setup, site, recruitment and operational tools in grouped sections. [Screenshot](screenshots/c-more.png)

### Review and approve a response when needed — optional / when needed

61. **Review the proposed response** — AI drafts a response; no crew move occurs until a person approves. [Screenshot](screenshots/c-response-draft.png)

62. **Select eligible crew** — Review destination, instructions, qualifications and current coverage. [Screenshot](screenshots/c-response-candidates.png)

63. **Understand unavailable crew** — Blocked candidates show the constraint that prevents a safe move. [Screenshot](screenshots/c-response-blocked.png)

64. **Approve the chosen response** — Read who will move and approve the selected volunteer; source coverage is rechecked. [Screenshot](screenshots/c-response-approve.png)

65. **Track the instruction** — Review the approved response and the volunteer’s acknowledgement status. [Screenshot](screenshots/c-response-tracking.png)

### Complete the response and close the event

66. **Confirm response completion** — Review field updates and record completion notes. [Screenshot](screenshots/c-response-complete.png)

67. **Review the event summary** — Edit the AI draft, confirm follow-up and close the event yourself. [Screenshot](screenshots/c-closeout.png)

68. **Event closed** — Event closeout is confirmed while the operational record remains available. [Screenshot](screenshots/c-closed.png)

## Limits and capture verification

Native iOS/Android appearance, device push delivery, camera ingestion, real AI processing, email delivery and offline background retries were not validated by these captures. Voice screenshots use a simulated browser microphone and do not send or transcribe audio. Blank or first-use states are included where they explain entry into a feature; populated examples follow where relevant.

The capture runner performed real clicks and form entry, with planned Supabase operational writes intercepted and fulfilled in memory. Report receipt, scheduling and response states in these screenshots are examples, not evidence that the hosted backend completed those operations. Initial harness issues with route matching and demo fixture responses were corrected and the affected captures were retaken.
