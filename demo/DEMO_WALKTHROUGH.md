# Ground Control demo

Judges: follow the [quick start](../README.md) and use the Mo/Sarah credentials supplied privately with the submission. Maintainers can prepare that two-account handoff with `npm run judge:handoff`; the full `.ground-control-demo-logins.json` stays private. Switch accounts by signing out and signing back in. Two separate browser sessions can keep both roles open.

## Automatic scheduling

As Mo, open **Riverside Automatic Scheduling - Demo** (join code `RIVERROSTER`), then its roster screen:

1. Generate shift times from the verified operating plan.
2. Generate volunteer assignments automatically.
3. Review coverage/gaps and publish the reviewed roster.

Mo initiates generation and approves publication; the deterministic engine performs assignment. Its bounded search can return a partial roster with explicit gaps. This scenario starts unrostered so that you can demonstrate generation yourself.

## Live operations

As Mo, open **Riverside Live Operations - Demo** (join code `RIVERLIVE`) and **Alerts**. The prepared baseline has active assignments, checked-in volunteers and qualified reserves. Its certificates and setup are synthetic fixtures.

If its shifts have expired or you want another run, choose **Start a fresh live demo**, then confirm **End this demo and prepare a fresh scenario**. This creates a fresh timed scenario; the previous reports and decisions remain in history. Use the newly opened event for both accounts.

1. Review the Water B no-show/coverage recommendation. Inspect eligible volunteers and the reason for any blocked choice.
2. Select Sarah if she is still eligible, review the instruction and approve. The database rechecks coverage before moving her.
3. Sign in as Sarah, open the same event, acknowledge the instruction, mark en route and then arrived.
4. Submit incident reports. For a mixed-signal scenario, report a dizzy person near the lawn, a growing queue/crowding near Water B, and Water B running out of water. Mo can add a manual temperature observation. Original reports appear before AI finishes.
5. As Mo, inspect interpretations, related reports and risk evidence. Request a response draft, review its procedure references, edit requirements/instructions and explicitly select eligible volunteers before approval.
6. Track volunteer progress, resolve the incident/risk/response and review the event closeout before ending the event.

AI results vary. The latest hosted text latency check saved a report in 188 ms and showed an interpretation in about 3 seconds; this is one sample, not a guarantee. Live AI calls now have a 12-second total deadline including retries; voice transcription and interpretation share a 15-second budget. Failed or delayed processing leaves the original available for human review. Earlier response drafting exhausted retries with Gemini 503/timeouts, and the text check does not establish successful full response drafting or current native voice interaction. Use typed reports when demonstrating in a browser without microphone access.
