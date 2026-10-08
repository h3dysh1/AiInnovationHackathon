# Crowd camera (computer vision)

The camera estimates how many people are in one area of the site (people per m²), whether
that is rising, and whether people are moving in opposing directions. It sends those
numbers, never images, to Ground Control. Sustained crowding becomes a **risk alert** in
Live operations, and from there the normal flow applies: **Draft response → a coordinator
approves → volunteers are dispatched**. The camera never moves anyone by itself.

```
video / webcam ──► crowd-counting model (DM-Count) ──► people in your outlined area
                   optical flow ───────────────────► direction + opposing flows
                                     │
                    record_crowd_reading (Supabase, as a coordinator)
                                     │
            crowd_readings ──► sustained crowding ──► risk alert ──► Mo approves
                                     │
                     Crowd screen: site map tinted by density
```

## One-time setup

1. **Database.** Run `supabase/migrations/202610070019_crowd_readings.sql` once in the
   Supabase SQL Editor (it is safe to rerun). It needs migrations 016–018 applied first.
   The team's `scripts/deploy-setup.cjs` only applies 009–014, so paste this one in by hand.
2. **A location.** The event's site map needs a location whose name matches your camera,
   for example `Footbridge` (Set up event → Add locations & posts on map). Give it a circle
   so it shows up tinted on the Crowd map.
3. **A camera account.** Make a separate account, give it the coordinator or safety-lead
   role on the demo event (Event team & roles), and use it only for the camera.
4. **Python.** Use Python 3.10 or newer. Create the virtual environment **outside** the app folder.
   Otherwise Expo's file watcher tries to scan thousands of package files.
   ```sh
   python3 -m venv ~/venvs/crowdcam
   source ~/venvs/crowdcam/bin/activate        # Windows: ~/venvs/crowdcam/Scripts/activate
   pip install -r cv/requirements.txt
   ```
   The first run downloads model weights (~85 MB) to `~/.lwcc/weights`. Do this on good Wi-Fi
   before the demo.
5. **Credentials.** Copy `cv/.env.example` to `cv/.env.local` (ignored by Git) and fill it in.
   Use the same project URL and publishable key as the app. **Never use the service-role key.**

## Make the demo data

1. **Footage.** Use a static camera filmed from above at an angle, ideally with people walking
   both ways (crossings, concourses). Free stock footage from Pexels or Pixabay works; credit it.
   Put it in `cv/footage/` (ignored by Git).
2. **Outline the counting area.**
   ```sh
   python cv/pick_region.py cv/footage/crowd.mp4
   ```
   **Outline where people's heads appear, not the ground they stand on.** The model places
   each person at their head. On an angled camera, heads are higher in the picture than feet,
   and a ground-only outline will undercount badly. Then enter the location name (for example
   `Footbridge`) and the real area people stand on, in m². That area turns a count into density,
   so estimate it carefully from things of known size.
3. **Analyse.**
   ```sh
   python cv/analyse.py cv/footage/crowd.mp4 --show
   ```
   This writes `cv/output/readings.json`, `overlay.mp4` (for slides), and two **blurred**
   stills: `snapshot_first.png` and `snapshot_peak.png`. Use `--no-resize` for very dense crowds,
   or `--weights SHB` for sparser ones.
4. **Check accuracy.** Pause on 3 frames, count heads by hand inside the outline, and compare
   them with the printed numbers. Put the resulting confidence in `cv/camera.json`, and quote
   the error in the pitch.

## Run it in the demo

**Replay** (safe, recommended). No model runs on stage, only small HTTPS calls:
```sh
python cv/send.py                      # one reading every 2 s
python cv/send.py --from 20 --to 90    # just the build-up
```
**Live** (riskier, more impressive). Point a webcam at a crowd, such as the audience:
```sh
python cv/pick_region.py 0
python cv/analyse.py 0 --send --show --blur --no-video
```

Then, in the app: **Event → Live operations → Crowd cameras & map**.

## Mock feed (testing and rehearsals)

No camera or footage needed. Readings drift naturally and **never alert** unless you ask for a surge.
Mock cameras are named `mock-cam-…`, so their alerts are easy to clean up.

```sh
python3 cv/mock_feed.py                         # calm, runs until Ctrl+C, never alerts
python3 cv/mock_feed.py --scenario busy         # busy but under the alert line
python3 cv/mock_feed.py --scenario surge        # calm -> build-up -> HIGH alert -> eases (~2.5 min)
python3 cv/mock_feed.py --cleanup               # dismiss alerts raised by mock cameras only
```
Use `--location "Gate A"` (repeatable) for other places, and `--dry-run` to print without sending.
Uses the same login and event as `send.py` (`cv/.env.local`).

## How alerts work

| Sustained density (lowest of the last 3 readings within 2 min) | Alert |
| --- | --- |
| 3+ people/m² and rising | Medium |
| 4+ | High |
| 5+ | Critical |

These are demo defaults (set in migration 019 and `crowdcam/overlay.py`). Check them against
current crowd-safety guidance before quoting them.

- **One alert per place.** New readings update it. It can escalate but never quietly
  downgrades. A person resolves it.
- **Combined evidence.** "Check for emerging risks" (`detect_risk`) now raises a heat alert one
  level when the camera shows the same place is crowded (3+ people/m² in the last 10 minutes).
- **Uncovered places.** Places with no camera show as "No camera". A camera silent for 2 minutes
  shows "No recent reading". Neither pretends to know.

## Privacy

Frames are counted in memory and discarded. Only counts, density, trend and flow are stored
or sent. Saved stills are blurred, and `--blur` blurs the live preview too. No faces, no
identities, no tracking of individuals.

## Checks

```sh
python -m pytest cv/tests                      # crowd maths, no model needed
node scripts/check-crowd-database.cjs          # migration 019 against real Postgres (PGlite)
```
