# Ground Control

Ground Control helps event coordinators plan staffing, monitor live operations and respond to incidents. Volunteers receive assignments, check in and report incidents from their phones.

**Algorithms handle constraints. AI handles ambiguity. Humans handle safety decisions.**

## Run the judging demo

The app connects to our hosted Supabase backend. **You do not need your own Gemini key, Supabase account, database, or backend deployment.** Use the two demo logins supplied privately with the hackathon submission.

You need a computer with **Node.js 22.13 or newer in the 22.x line**, npm, and internet access. For the phone app, install **Expo Go compatible with Expo SDK 57**. A browser option is available below.

```sh
git clone https://github.com/h3dysh1/AiInnovationHackathon.git
cd AiInnovationHackathon
npm ci
npm run judge:setup
npm start
```

`judge:setup` copies the included public demo configuration from `.env.judge.example` into `.env.local`. It preserves an existing `.env.local`; if you already use a different backend, use a fresh checkout for judging. No private API keys are copied.

### Open it on your phone

1. Keep the computer and phone on the same Wi-Fi network, and leave the terminal running.
2. Scan the terminal's QR code: use the Camera app on iPhone, or Expo Go's QR scanner on Android.
3. Sign in to Ground Control as **Mo** (coordinator) or **Sarah** (volunteer), using the credentials in the submission's judge-access document.

On a physical iPhone, Expo Go and Expo CLI must be signed in to the **same Expo account**. Use your own account on both: run `npx expo login` on the computer and sign in to Expo Go on the phone. This Expo account is separate from the Mo/Sarah app login. See [Expo's device instructions](https://docs.expo.dev/get-started/start-developing/).

If Wi-Fi blocks the connection, stop the server with Ctrl+C and run:

```sh
npm start -- --tunnel
```

Expo may ask to install its tunnel helper. A tunnel still depends on the computer and terminal staying on; the QR code is not a permanent hosted app link. Expo Go must support SDK 57; if the installed version is incompatible, use the browser option instead of changing dependencies.

### Browser option

```sh
npm run web
```

Open the localhost URL printed in the terminal. Use a normal window for Mo and a private window or another browser for Sarah to keep both accounts signed in at once. This uses the same hosted backend and real AI processing. Typed incident reports are the most reliable browser demo; voice needs browser microphone permission.

If the team is running the demo laptop, judges can scan its QR code without cloning or installing computer dependencies. The same network and iPhone Expo-account requirements apply. Alternatively, open the laptop's browser demo together.

## What to try — five-minute walkthrough

These are shared synthetic events. Actions are saved and visible to other people using the demo accounts.

1. **Mo:** open **Riverside Live Operations - Demo**, then **Alerts**. If its timed shifts have expired, use **Start a fresh live demo** and confirm. This preserves the previous scenario's history and opens a fresh event.
2. **Sarah:** open the same live event. View the assignment and check-in options, then report: “Someone near Water B is conscious but dizzy and needs assistance.” This is synthetic demo input, not a real incident.
3. **Mo:** refresh Alerts. The original report is available immediately; AI adds its category, severity, location and summary asynchronously. Review or correct the interpretation.
4. Inspect staffing gaps, related reports and risk evidence. Try a response draft; review its procedure references and instructions before selecting volunteers and approving anything.
5. **Sarah:** acknowledge approved reassignment instructions and track progress. **Mo:** resolve the synthetic test incident when finished.

For automatic rostering, open **Riverside Automatic Scheduling - Demo** as Mo: generate shifts, generate assignments, review coverage and publish the reviewed roster. This is a separate scenario; it may already contain changes from earlier judges. The [full Mo/Sarah walkthrough](demo/DEMO_WALKTHROUGH.md) covers both scenarios.

Signing up creates a volunteer account, not a coordinator, and does not attach it to the prepared demo. Use the supplied Mo/Sarah logins to evaluate both roles without email-confirmation or role setup.

## How the API keys work

| Configuration | Where it lives | Does a judge need to supply it? |
| --- | --- | --- |
| Supabase project URL and publishable key | `.env.judge.example`, copied to `.env.local` and bundled with the client | No — already included for our demo backend |
| Mo / Sarah app passwords | Private judge-access document supplied with the submission | Yes — use these to sign in, not as API keys |
| `GEMINI_API_KEY` | Hosted Supabase Edge Function secret | No — AI requests run on the server |
| Supabase service-role key / administrative access token | Server or maintainer deployment environment only | No — never needed on a judge's device |

The Supabase publishable key identifies the app; user sign-in and database permissions determine what each user can access. It is designed for public client use ([Supabase key documentation](https://supabase.com/docs/guides/getting-started/api-keys)). Gemini and administrative credentials must never be copied into `EXPO_PUBLIC_*` variables or committed to this repo.

The request path is **phone/browser → Supabase authentication and server functions → Gemini → validated results stored in Supabase**. The team maintains the backend, its credentials and provider quota. Judges need internet access; cloning the frontend does not create an independent offline backend.

## Demo limits and troubleshooting

- **AI latency:** a hosted text test saved its report in 188 ms and made the first interpretation available in about 3 seconds. This is one measured sample, not a guarantee. Live AI calls have a 12-second total budget including retries; voice transcription and interpretation share a 15-second budget. Later correlation, risk and response stages run separately. If AI is delayed, the original stays available for human review.
- **Provider availability:** quota errors or provider outages can interrupt AI. Use the saved report and human review controls; retry when appropriate. A successful full response draft and current native voice flow are not guaranteed by the text latency test.
- **Phone push:** the in-app inbox works in Expo Go; remote phone push requires an appropriately configured installed/development build. It is not required for judging the core flow.
- **Maps and camera signals:** synthetic demo assets/readings do not prove physical location or a real crowd count. A live camera feed requires the separate optional [CV pipeline](cv/README.md).
- **Login fails:** use the private submission credentials rather than your Expo account password. An Expo account opens the development app; Mo/Sarah are separate Ground Control accounts.
- **Missing configuration:** run `npm run judge:setup`, then restart Expo. For changes to public environment values, restart with `npm start -- --clear`.
- **No current shifts:** Mo can start a fresh live demo; Sarah must then open that same newly created event.

## For maintainers

Prepare the private submission packet from the existing local demo credentials:

```sh
npm run judge:handoff
npm run judge:check
```

`judge:handoff` refreshes **only** the public Supabase settings in `.env.judge.example` and writes `.ground-control-judge-access.md`, which is ignored by Git. Attach that two-account document privately to the hackathon submission. It contains no Gemini, Supabase admin, or service-role key. Do not send the full backend-secret or demo-login JSON files. `judge:check` verifies both demo logins and scenario access without changing event data. Run these on the maintainer checkout; judges do not need these commands.

Check the app before submission:

```sh
npm run lint
npm run typecheck
npm test
```

Backend setup and detailed implementation notes are in the [development reference](docs/development/README.md). [ROADMAP.md](ROADMAP.md) describes the product scope; [IMPLEMENTATION_AUDIT.md](IMPLEMENTATION_AUDIT.md) and [functional readiness](docs/functionality/FUNCTIONAL_READINESS.md) record acceptance evidence and remaining gaps.
