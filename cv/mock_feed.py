"""Mock camera feed for testing and demos: realistic readings, no real camera needed.

Readings drift naturally, like a real crowd. They NEVER raise an alert unless you
choose a scenario that builds a surge. Every mock camera is named "mock-..." so its
alerts are easy to find and dismiss.

Usage (from the project folder):
  python3 cv/mock_feed.py                          # calm: runs until Ctrl+C, never alerts
  python3 cv/mock_feed.py --scenario busy          # busy but safe (caution), never alerts
  python3 cv/mock_feed.py --scenario surge         # calm -> build-up -> HIGH alert -> eases off (~2.5 min)
  python3 cv/mock_feed.py --scenario surge --loop  # repeat the surge story, for rehearsals
  python3 cv/mock_feed.py --dry-run                # print readings only, send nothing
  python3 cv/mock_feed.py --cleanup                # dismiss open alerts raised by mock cameras

Options:
  --location Lawn        Ground Control location name (repeat for several: --location Lawn --location "Gate A")
  --interval 3           seconds between readings (keep under 40 so surges can alert)
  --minutes 0            stop after this many minutes (0 = run until Ctrl+C / end of scenario)
  --seed 7               same seed = same readings every run

Uses the same login and event as send.py (cv/.env.local).
"""
from __future__ import annotations

import argparse
import math
import random
import sys
import time
from collections import deque

from crowdcam.client import GroundControl, GroundControlError

AREA_M2 = 100.0
CAUTION = 3.0  # matches migration 019: alerts need 3 sustained readings >= 3 and rising


class MockCamera:
    """One location's crowd: density wanders around a target, like a real crowd does."""

    def __init__(self, location: str, index: int, rng: random.Random):
        self.location = location
        self.camera_id = f"mock-cam-{index + 1}"
        self.rng = rng
        self.density = rng.uniform(0.9, 1.4)
        self.history: deque[float] = deque(maxlen=6)
        self.counterflow = rng.uniform(0.1, 0.25)

    def step(self, target: float, cap: float, flow_target: float) -> dict:
        # Mean-reverting random walk: drifts toward the target with small natural noise.
        self.density += 0.35 * (target - self.density) + self.rng.gauss(0, 0.06)
        self.density = max(0.2, min(cap, self.density))
        self.counterflow += 0.4 * (flow_target - self.counterflow) + self.rng.gauss(0, 0.04)
        self.counterflow = max(0.0, min(1.0, self.counterflow))
        before = self.history[0] if self.history else self.density
        self.history.append(self.density)
        change = self.density - before
        trend = "rising" if change > 0.15 else "falling" if change < -0.15 else "steady"
        return {
            "people": round(self.density * AREA_M2),
            "density": round(self.density, 2),
            "trend": trend,
            "counterflow": round(self.counterflow, 2),
        }

    @property
    def config(self) -> dict:
        return {"camera_id": self.camera_id, "location_name": self.location, "area_m2": AREA_M2, "confidence": 0.5}


def surge_plan() -> list[tuple[float, float]]:
    """(target density, target counterflow) per step: calm -> build -> peak -> ease. ~48 steps."""
    plan = [(1.4, 0.2)] * 10                                               # calm
    plan += [(1.4 + (4.7 - 1.4) * (i + 1) / 14, 0.25 + 0.04 * i) for i in range(14)]  # build-up
    plan += [(4.7, 0.75)] * 8                                              # peak (HIGH alert)
    plan += [(4.7 - (4.7 - 1.6) * (i + 1) / 16, 0.7 - 0.03 * i) for i in range(16)]   # eases off
    return plan


def cleanup(client: GroundControl) -> None:
    snapshot = client.rpc("crowd_snapshot", {"p_event_id": client.resolve_event()})
    dismissed = 0
    for alert in snapshot.get("alerts", []):
        evidence = alert.get("evidence") or []
        cameras = {e.get("camera_id", "") for e in evidence if isinstance(e, dict)}
        if cameras and all(c.startswith("mock-") or c == "test-cam" for c in cameras):
            client.rpc("set_risk_status", {"p_id": alert["id"], "p_status": "dismissed"})
            dismissed += 1
            print(f"Dismissed: {alert['title']} ({alert['severity']})")
    print(f"{dismissed} mock alert(s) dismissed. Real camera alerts were left alone.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenario", choices=["calm", "busy", "surge"], default="calm")
    parser.add_argument("--location", action="append", help='location name (default "Lawn"); repeat for more')
    parser.add_argument("--interval", type=float, default=3.0)
    parser.add_argument("--minutes", type=float, default=0)
    parser.add_argument("--loop", action="store_true", help="repeat the surge scenario")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--cleanup", action="store_true")
    args = parser.parse_args()

    client = None
    if not args.dry_run:
        try:
            client = GroundControl()
            print(f"Event {client.resolve_event()}")
        except GroundControlError as e:
            sys.exit(str(e))
    if args.cleanup:
        if client is None:
            sys.exit("--cleanup needs a connection; remove --dry-run.")
        cleanup(client)
        return

    rng = random.Random(args.seed)
    locations = args.location or ["Lawn"]
    cameras = [MockCamera(name, i, rng) for i, name in enumerate(locations)]
    plan = surge_plan()
    deadline = time.time() + args.minutes * 60 if args.minutes else math.inf
    print(f"MOCK feed · scenario {args.scenario} · {', '.join(c.camera_id + ' -> ' + c.location for c in cameras)} · every {args.interval}s")
    if args.scenario == "surge":
        print(f"Surge story: calm, build-up, HIGH alert, eases off (~{len(plan) * args.interval / 60:.1f} min) on {cameras[0].location}.")
    print("Ctrl+C to stop.\n")

    step = 0
    try:
        while time.time() < deadline:
            for i, cam in enumerate(cameras):
                if args.scenario == "surge" and i == 0:
                    target, flow = plan[step % len(plan)]
                    cap = 5.5
                elif args.scenario == "busy":
                    target, flow, cap = 2.5, 0.35, 2.85   # caution-looking, but always under 3: never alerts
                else:
                    target, flow, cap = 1.3, 0.2, 2.2     # calm
                reading = cam.step(target, cap, flow)
                line = f"{cam.camera_id} {cam.location:<12} {reading['density']:.2f}/m²  ~{reading['people']:>3} people  {reading['trend']:<7} counterflow {reading['counterflow']:.2f}"
                if client:
                    try:
                        result = client.record(cam.config, reading)
                        alert = result.get("alert")
                        if alert:
                            line += f"   ALERT {alert['severity'].upper()}: {alert['title']}"
                    except GroundControlError as e:
                        line += f"   NOT SENT: {e}"
                print(line, flush=True)
            step += 1
            if args.scenario == "surge" and not args.loop and step >= len(plan):
                print("\nSurge story finished. Run with --cleanup to dismiss the mock alert.")
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
