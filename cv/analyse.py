"""Count the crowd in the camera's area: density, trend and flow, about once a second.

Usage:
  python cv/analyse.py cv/footage/crowd.mp4                 # pre-compute readings + overlay video
  python cv/analyse.py cv/footage/crowd.mp4 --show          # also watch it as it runs
  python cv/analyse.py 0 --send --show --blur               # LIVE: webcam -> Ground Control

Outputs (in cv/output/):
  readings.json        one reading per sample, replayable with send.py
  overlay.mp4          heat map + outline + numbers, for the pitch (H.264 if ffmpeg is installed)
  snapshot_first.png   privacy-safe (blurred) still at the start
  snapshot_peak.png    privacy-safe (blurred) still at the busiest moment

Privacy: frames are processed in memory and discarded. Only counts, density and flow
are kept or sent. Saved stills are always blurred. Use --blur for live webcam previews.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

from crowdcam.analysis import Flow, Trend, count_in_region, flow_stats, optical_flow, region_mask, resize_density, scale_points
from crowdcam.overlay import draw, heat_layer

CV_DIR = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", help="video file, or a webcam number such as 0")
    parser.add_argument("--camera", default=str(CV_DIR / "camera.json"), help="from pick_region.py")
    parser.add_argument("--out", default=str(CV_DIR / "output"))
    parser.add_argument("--every", type=float, default=1.0, help="seconds between readings")
    parser.add_argument("--model", default="DM-Count", choices=["DM-Count", "CSRNet", "Bay", "SFANet"])
    parser.add_argument("--weights", default="SHA", help="SHA (dense crowds), SHB (sparser), QNRF")
    parser.add_argument("--no-resize", action="store_true", help="full resolution: better for very dense crowds, slower")
    parser.add_argument("--max-seconds", type=float, default=0, help="stop after this much video (0 = all)")
    parser.add_argument("--send", action="store_true", help="send each reading to Ground Control as it is made")
    parser.add_argument("--show", action="store_true", help="preview window (press q to stop)")
    parser.add_argument("--blur", action="store_true", help="blur people in the preview and overlay video")
    parser.add_argument("--no-video", action="store_true", help="do not write overlay.mp4")
    args = parser.parse_args()

    camera = json.loads(Path(args.camera).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    live = args.source.isdigit()
    cap = cv2.VideoCapture(int(args.source) if live else args.source)
    ok, frame = cap.read()
    if not ok:
        sys.exit(f"Could not read {args.source}")
    h, w = frame.shape[:2]
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    region = camera["region"]
    if camera.get("image_size") and list(camera["image_size"]) != [w, h]:
        region = scale_points(region, camera["image_size"], (w, h))
    mask = region_mask(region, frame.shape)
    area = float(camera["area_m2"])

    client = None
    if args.send:
        from crowdcam.client import GroundControl
        client = GroundControl()
        print(f"Sending to event {client.resolve_event()} as {camera['camera_id']} -> {camera['location_name']}")

    from crowdcam.model import CrowdModel
    model = CrowdModel(args.model, args.weights, resize_img=not args.no_resize)
    print(f"Model {model.name}; area {area} m²; one reading every {args.every}s")

    trend = Trend(smooth_n=5, window_n=max(3, int(round(30 / args.every))), threshold=0.15)
    counterflows: deque[float] = deque(maxlen=3)
    readings: list[dict] = []
    writer = None
    raw_video = out / "overlay_raw.mp4"
    heat = alpha = None
    current: dict | None = None
    flow = Flow(0.0, 0.0, 0.0, 0.0)
    prev = None
    peak: dict | None = None
    start = time.time()
    index = 0
    last_sample = -1e9

    try:
        while ok:
            t = (time.time() - start) if live else index / fps
            if args.max_seconds and t > args.max_seconds:
                break
            if t - last_sample >= args.every:
                last_sample = t
                _, density_map = model.density(frame)
                full = resize_density(density_map, w, h)
                people_raw = count_in_region(full, mask)
                density, label = trend.add(people_raw / area)
                if prev is not None:
                    flow = flow_stats(optical_flow(prev, frame), mask)
                counterflows.append(flow.counterflow)
                current = {
                    "t": round(t, 2),
                    "people": round(density * area, 1),
                    "people_raw": round(people_raw, 1),
                    "density": round(density, 3),
                    "trend": label,
                    "counterflow": round(float(np.mean(counterflows)), 3),
                    "dx": round(flow.dx, 3),
                    "dy": round(flow.dy, 3),
                    "moving_share": round(flow.moving_share, 3),
                }
                readings.append(current)
                heat, alpha = heat_layer(full, mask)
                msg = f"{t:7.1f}s  {current['density']:.2f}/m²  ~{current['people']:.0f} people  {label:7s}  counterflow {current['counterflow']:.2f}"
                if client:
                    result = client.record(camera, current)
                    alert = result.get("alert")
                    msg += f"   ALERT {alert['severity'].upper()}: {alert['title']}" if alert else ""
                print(msg, flush=True)

                still = draw(frame, heat, alpha, region, camera["location_name"], current["density"],
                             current["people"], label, current["counterflow"], (flow.dx, flow.dy), privacy=True)
                if len(readings) == 1:
                    cv2.imwrite(str(out / "snapshot_first.png"), still)
                if peak is None or current["density"] > peak["density"]:
                    peak = current
                    cv2.imwrite(str(out / "snapshot_peak.png"), still)

            if current is not None and (args.show or not args.no_video):
                shown = draw(frame, heat, alpha, region, camera["location_name"], current["density"],
                             current["people"], current["trend"], current["counterflow"], (flow.dx, flow.dy),
                             privacy=args.blur)
                if not args.no_video:
                    if writer is None:
                        writer = cv2.VideoWriter(str(raw_video), cv2.VideoWriter_fourcc(*"mp4v"),
                                                 fps if not live else 10, (w, h))
                    writer.write(shown)
                if args.show:
                    cv2.imshow("Ground Control crowd camera (q to stop)", shown)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
            prev = frame
            ok, frame = cap.read()
            index += 1
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        cap.release()
        model.close()
        if writer is not None:
            writer.release()
        if args.show:
            cv2.destroyAllWindows()

    result = {
        "camera": camera,
        "model": model.name,
        "source": Path(args.source).name if not live else f"webcam {args.source}",
        "every_seconds": args.every,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "readings": readings,
    }
    (out / "readings.json").write_text(json.dumps(result, indent=1))
    print(f"\n{len(readings)} readings -> {out / 'readings.json'}")
    if peak:
        print(f"Busiest moment: {peak['density']:.2f}/m² at {peak['t']}s (snapshot_peak.png)")

    if writer is not None:
        final = out / "overlay.mp4"
        if shutil.which("ffmpeg"):
            # Browsers and slides need H.264; OpenCV's mp4v often will not play.
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw_video), "-vcodec", "libx264",
                            "-pix_fmt", "yuv420p", str(final)], check=False)
            if final.exists():
                raw_video.unlink(missing_ok=True)
                print(f"Overlay video -> {final}")
        else:
            raw_video.rename(final)
            print(f"Overlay video -> {final} (install ffmpeg for a browser-friendly H.264 copy)")


if __name__ == "__main__":
    main()
