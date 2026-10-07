"""Replay pre-computed readings into Ground Control, as if the camera were live.

This is the demo-safe path: no model runs on stage, only small HTTPS calls.
Each reading is stamped with the current time, so the database treats it as live.

Usage:
  python cv/send.py                                   # replay cv/output/readings.json, one every 2 s
  python cv/send.py --from 20 --to 80                 # only video seconds 20-80 (e.g. the build-up)
  python cv/send.py --interval 1 --step 2             # faster: every 2nd reading, one per second
  python cv/send.py --dry-run                         # print what would be sent
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from crowdcam.client import GroundControl, GroundControlError

CV_DIR = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("readings", nargs="?", default=str(CV_DIR / "output" / "readings.json"))
    parser.add_argument("--camera", help="override the camera config saved in the readings file")
    parser.add_argument("--interval", type=float, default=2.0, help="seconds between sends (keep under 40)")
    parser.add_argument("--step", type=int, default=1, help="send every Nth reading")
    parser.add_argument("--from", dest="start", type=float, default=0, help="video second to start at")
    parser.add_argument("--to", dest="end", type=float, default=0, help="video second to stop at (0 = end)")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data = json.loads(Path(args.readings).read_text())
    camera = json.loads(Path(args.camera).read_text()) if args.camera else data["camera"]
    readings = [r for r in data["readings"] if r["t"] >= args.start and (not args.end or r["t"] <= args.end)]
    readings = readings[:: max(1, args.step)]
    if not readings:
        sys.exit("No readings in that range.")
    if args.interval >= 40:
        print("Warning: alerts need 3 readings within 2 minutes; use an interval under 40 s.")

    client = None
    if not args.dry_run:
        try:
            client = GroundControl()
            print(f"Event {client.resolve_event()}  camera {camera['camera_id']} -> {camera['location_name']}")
        except GroundControlError as e:
            sys.exit(str(e))

    print(f"Replaying {len(readings)} readings, one every {args.interval}s. Ctrl+C to stop.")
    try:
        while True:
            for r in readings:
                line = f"video {r['t']:6.1f}s  {r['density']:.2f}/m²  ~{r['people']:.0f} people  {r['trend']:7s}  counterflow {r['counterflow']:.2f}"
                if client:
                    try:
                        result = client.record(camera, r)
                        alert = result.get("alert")
                        if alert:
                            line += f"   ALERT {alert['severity'].upper()}: {alert['title']}"
                    except GroundControlError as e:
                        line += f"   NOT SENT: {e}"
                print(line, flush=True)
                time.sleep(args.interval)
            if not args.loop:
                break
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
