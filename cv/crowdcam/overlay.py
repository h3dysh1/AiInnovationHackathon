"""Drawing: the demo overlay (heat map + region + numbers) and privacy-safe snapshots."""
from __future__ import annotations

import cv2
import numpy as np

STATUS_BGR = {"green": (91, 158, 46), "amber": (32, 160, 224), "red": (69, 69, 214)}


def status(density: float) -> str:
    """Same thresholds as the database (migration 019): caution 3, high 4."""
    return "red" if density >= 4 else "amber" if density >= 3 else "green"


def heat_layer(density_full: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Colour the density map; normalised so a fixed per-pixel level reads as 'hot'."""
    d = cv2.GaussianBlur(density_full, (0, 0), 6)
    peak = max(float(np.percentile(d[mask.astype(bool)], 99)) if mask.any() else 0.0, 1e-6)
    norm = np.clip(d / peak, 0, 1)
    heat = cv2.applyColorMap((norm * 255).astype(np.uint8), cv2.COLORMAP_JET)
    alpha = (np.clip(norm * 1.6, 0, 0.65) * mask)[..., None]
    return heat, alpha


def draw(frame: np.ndarray, heat: np.ndarray | None, alpha: np.ndarray | None, region: list[list[float]],
         label: str, density: float, people: float, trend: str, counterflow: float,
         flow_xy: tuple[float, float] | None = None, privacy: bool = False) -> np.ndarray:
    out = frame.copy()
    if privacy:
        # Heavy blur so nobody can be recognised in a saved or shared image.
        k = max(31, (min(out.shape[:2]) // 12) | 1)
        out = cv2.GaussianBlur(out, (k, k), 0)
    if heat is not None and alpha is not None:
        out = (out * (1 - alpha) + heat * alpha).astype(np.uint8)
    colour = STATUS_BGR[status(density)]
    pts = np.array(region, dtype=np.int32)
    cv2.polylines(out, [pts], True, colour, 3, cv2.LINE_AA)

    if flow_xy is not None and (abs(flow_xy[0]) + abs(flow_xy[1])) > 0.2:
        cx, cy = pts.mean(axis=0).astype(int)
        scale = 25
        tip = (int(cx + flow_xy[0] * scale), int(cy + flow_xy[1] * scale))
        cv2.arrowedLine(out, (cx, cy), tip, (255, 255, 255), 3, cv2.LINE_AA, tipLength=0.3)

    lines = [
        f"{label}",
        f"{density:.2f} people/m2   ~{people:.0f} people",
        f"{trend}   counterflow {counterflow:.2f}",
    ]
    pad, line_h = 12, 30
    box_w = max(cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, 0.75, 2)[0][0] for t in lines) + pad * 2
    cv2.rectangle(out, (10, 10), (10 + box_w, 10 + pad + line_h * len(lines)), (20, 20, 20), -1)
    cv2.rectangle(out, (10, 10), (18, 10 + pad + line_h * len(lines)), colour, -1)
    for i, text in enumerate(lines):
        cv2.putText(out, text, (10 + pad + 6, 10 + line_h * (i + 1)), cv2.FONT_HERSHEY_SIMPLEX,
                    0.75, (255, 255, 255), 2, cv2.LINE_AA)
    return out
