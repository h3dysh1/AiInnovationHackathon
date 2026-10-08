"""Checks the crowd maths without the model or network: python -m pytest cv/tests"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from crowdcam.analysis import Trend, count_in_region, flow_stats, region_mask, resize_density, scale_points  # noqa: E402


def test_resize_keeps_total_count():
    rng = np.random.default_rng(1)
    small = rng.random((60, 80)).astype(np.float32) * 0.01
    big = resize_density(small, 1280, 720)
    assert big.shape == (720, 1280)
    assert abs(big.sum() - small.sum()) < 1e-3 * small.sum()


def test_count_only_inside_region():
    density = np.zeros((100, 100), np.float32)
    density[10:20, 10:20] = 0.1   # 10 people inside
    density[80:90, 80:90] = 0.1   # 10 people outside
    mask = region_mask([[0, 0], [50, 0], [50, 50], [0, 50]], density.shape)
    assert abs(count_in_region(density, mask) - 10) < 0.01


def test_scale_points():
    assert scale_points([[100, 50]], [1000, 500], (500, 250)) == [[50, 25]]


def test_counterflow_one_direction_vs_opposing():
    mask = np.ones((40, 40), np.uint8)
    same = np.zeros((40, 40, 2), np.float32)
    same[..., 0] = 2.0
    assert flow_stats(same, mask).counterflow < 0.05

    opposing = np.zeros((40, 40, 2), np.float32)
    opposing[:20, :, 0] = 2.0
    opposing[20:, :, 0] = -2.0
    assert flow_stats(opposing, mask).counterflow > 0.95

    still = np.zeros((40, 40, 2), np.float32)
    assert flow_stats(still, mask).counterflow == 0.0


def test_trend_smooths_spikes_and_labels_direction():
    t = Trend(smooth_n=5, window_n=5, threshold=0.15)
    for _ in range(6):
        _, label = t.add(2.0)
    assert label == "steady"
    smoothed, label = t.add(9.0)  # one spike is removed by the median
    assert smoothed == 2.0 and label == "steady"
    for d in (2.4, 2.8, 3.2, 3.6, 4.0, 4.4):
        _, label = t.add(d)
    assert label == "rising"
    for d in (3.0, 2.0, 1.5, 1.0, 1.0, 1.0):
        _, label = t.add(d)
    assert label == "falling"
