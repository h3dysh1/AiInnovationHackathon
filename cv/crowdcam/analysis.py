"""Pure maths for the crowd camera: no model, no network. Tested in cv/tests."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from statistics import median

import cv2
import numpy as np


def region_mask(points: list[list[float]], shape: tuple[int, int]) -> np.ndarray:
    """A 0/1 mask of the counting region (a polygon in camera pixels)."""
    mask = np.zeros(shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [np.array(points, dtype=np.int32)], 1)
    return mask


def scale_points(points: list[list[float]], from_size: list[int], to_size: tuple[int, int]) -> list[list[float]]:
    """Rescale a region picked on one resolution to another (sizes are [width, height])."""
    sx, sy = to_size[0] / from_size[0], to_size[1] / from_size[1]
    return [[x * sx, y * sy] for x, y in points]


def resize_density(density: np.ndarray, width: int, height: int) -> np.ndarray:
    """Resize a model density map to the frame size WITHOUT changing the total count.

    Plain resizing spreads the same values over more pixels and inflates the sum,
    so the result is rescaled to keep the original total.
    """
    total = float(density.sum())
    big = cv2.resize(density.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR)
    big_total = float(big.sum())
    if big_total > 1e-9:
        big *= total / big_total
    return big


def count_in_region(density_full: np.ndarray, mask: np.ndarray) -> float:
    return float((density_full * mask).sum())


@dataclass
class Flow:
    dx: float
    dy: float
    counterflow: float  # 0 = everyone moving the same way, 1 = opposing streams
    moving_share: float  # share of the region that is moving


def flow_stats(flow: np.ndarray, mask: np.ndarray, min_speed: float = 0.5) -> Flow:
    """Summarise optical flow inside the region.

    counterflow = 1 - |sum of motion vectors| / sum of |motion vectors|.
    If everyone walks the same way the vectors add up (close to 0); opposing streams cancel out (close to 1).
    """
    vectors = flow[mask.astype(bool)]
    if len(vectors) == 0:
        return Flow(0.0, 0.0, 0.0, 0.0)
    speeds = np.linalg.norm(vectors, axis=1)
    moving = vectors[speeds > min_speed]
    if len(moving) == 0:
        return Flow(0.0, 0.0, 0.0, 0.0)
    total_speed = float(np.linalg.norm(moving, axis=1).sum())
    net = float(np.linalg.norm(moving.sum(axis=0)))
    dx, dy = moving.mean(axis=0)
    return Flow(float(dx), float(dy), float(np.clip(1 - net / total_speed, 0, 1)), len(moving) / len(vectors))


def optical_flow(prev_bgr: np.ndarray, bgr: np.ndarray, work_width: int = 640) -> np.ndarray:
    """Farneback optical flow computed small (fast), returned at full frame size."""
    h, w = bgr.shape[:2]
    scale = min(1.0, work_width / w)
    size = (max(1, int(w * scale)), max(1, int(h * scale)))
    a = cv2.cvtColor(cv2.resize(prev_bgr, size), cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(cv2.resize(bgr, size), cv2.COLOR_BGR2GRAY)
    small = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    full = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    return full / scale  # pixel displacements in full-frame units


@dataclass
class Trend:
    """Smooths noisy counts and labels the trend.

    smooth_n: rolling median window (samples) to remove frame-to-frame jitter.
    window_n: compare against the smoothed value this many samples ago.
    threshold: change in people/m2 that counts as rising or falling.
    """
    smooth_n: int = 5
    window_n: int = 15
    threshold: float = 0.15
    _raw: deque = field(default_factory=deque)
    _smoothed: deque = field(default_factory=deque)

    def add(self, density: float) -> tuple[float, str]:
        self._raw.append(density)
        while len(self._raw) > self.smooth_n:
            self._raw.popleft()
        smoothed = float(median(self._raw))
        self._smoothed.append(smoothed)
        while len(self._smoothed) > self.window_n + 1:
            self._smoothed.popleft()
        before = self._smoothed[0]
        change = smoothed - before
        label = "rising" if change > self.threshold else "falling" if change < -self.threshold else "steady"
        return smoothed, label
