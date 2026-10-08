"""Mark the area the camera counts, and link it to a Ground Control location.

Usage:
  python cv/pick_region.py cv/footage/crowd.mp4            # click points on a video frame
  python cv/pick_region.py 0                               # webcam
  python cv/pick_region.py crowd.mp4 --points "100,400 900,380 1100,700 50,720"   # no clicking

Click the corners of the area to count (3 or more points). IMPORTANT: crowd-counting
models place each person at their HEAD, not their feet. Outline where people's heads
appear in the picture (on an angled camera that is higher up than the ground they stand on).
  Enter = done   u = undo last point   r = start again   Esc = cancel
Then answer the prompts. Writes cv/camera.json and cv/output/region_preview.png.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

CV_DIR = Path(__file__).resolve().parent


def grab_frame(source: str, at_seconds: float) -> np.ndarray:
    cap = cv2.VideoCapture(int(source) if source.isdigit() else source)
    if not source.isdigit() and at_seconds > 0:
        cap.set(cv2.CAP_PROP_POS_MSEC, at_seconds * 1000)
    ok, frame = False, None
    for _ in range(10 if source.isdigit() else 1):  # webcams need a few frames to adjust exposure
        ok, frame = cap.read()
    cap.release()
    if not ok:
        sys.exit(f"Could not read a frame from {source}")
    return frame


def click_points(frame: np.ndarray) -> list[list[int]]:
    points: list[list[int]] = []
    title = "Outline where HEADS appear - Enter when done, u undo, r reset, Esc cancel"

    def on_mouse(event, x, y, _flags, _param):
        if event == cv2.EVENT_LBUTTONDOWN:
            points.append([x, y])

    cv2.namedWindow(title, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(title, on_mouse)
    while True:
        shown = frame.copy()
        if len(points) >= 2:
            cv2.polylines(shown, [np.array(points, np.int32)], len(points) >= 3, (0, 220, 255), 2, cv2.LINE_AA)
        for p in points:
            cv2.circle(shown, tuple(p), 6, (0, 220, 255), -1)
        cv2.imshow(title, shown)
        key = cv2.waitKey(20) & 0xFF
        if key in (13, 10) and len(points) >= 3:
            break
        if key == ord("u") and points:
            points.pop()
        if key == ord("r"):
            points.clear()
        if key == 27:
            cv2.destroyAllWindows()
            sys.exit("Cancelled.")
    cv2.destroyAllWindows()
    return points


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{prompt}{suffix}: ").strip()
    return value or (default or "")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", help="video file, or a webcam number such as 0")
    parser.add_argument("--at", type=float, default=0, help="video time (seconds) of the frame to mark")
    parser.add_argument("--points", help='skip clicking: "x,y x,y x,y ..." in pixels')
    parser.add_argument("--out", default=str(CV_DIR / "camera.json"))
    args = parser.parse_args()

    frame = grab_frame(args.source, args.at)
    h, w = frame.shape[:2]
    if args.points:
        points = [[int(float(v)) for v in p.split(",")] for p in args.points.split()]
        if len(points) < 3:
            sys.exit("Give at least 3 points.")
    else:
        points = click_points(frame)

    print("\nNow link this area to Ground Control.")
    print("Location name must match a location on the event's site map exactly, e.g. Footbridge.")
    camera_id = ask("Camera name", "footbridge-cam-1")
    location = ask("Ground Control location name", "Footbridge")
    print("Estimate the REAL ground area those people stand on, in m² (e.g. 12 m long x 6 m wide = 72).")
    print("Use things of known size: lane widths (~3.5 m), paving tiles, people (~0.5 m shoulders).")
    while True:
        try:
            area = float(ask("Area in m²"))
            if area > 0:
                break
        except ValueError:
            pass
        print("Enter a positive number.")
    confidence = float(ask("Confidence 0-1 (from your hand-count check)", "0.75"))

    config = {
        "camera_id": camera_id,
        "location_name": location,
        "area_m2": area,
        "confidence": confidence,
        "region": points,
        "image_size": [w, h],
        "source": str(args.source),
    }
    Path(args.out).write_text(json.dumps(config, indent=2))
    preview = frame.copy()
    cv2.polylines(preview, [np.array(points, np.int32)], True, (0, 220, 255), 3, cv2.LINE_AA)
    (CV_DIR / "output").mkdir(exist_ok=True)
    cv2.imwrite(str(CV_DIR / "output" / "region_preview.png"), preview)
    print(f"\nSaved {args.out} and cv/output/region_preview.png")


if __name__ == "__main__":
    main()
