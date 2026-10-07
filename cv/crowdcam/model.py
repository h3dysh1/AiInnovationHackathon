"""Crowd-counting model (lwcc: DM-Count / CSRNet), loaded once and reused.

lwcc 0.0.6 saves weights to "/.lwcc/weights" at the ROOT of the disk, which fails on
macOS (read-only root) and most Linux machines. We swap in a downloader that uses
~/.lwcc/weights instead. Weights come from lwcc's GitHub release (~85 MB each).
"""
from __future__ import annotations

import os
import tempfile
import urllib.request
from pathlib import Path

import cv2
import numpy as np

WEIGHTS_URL = "https://github.com/tersekmatija/lwcc_weights/releases/download/v0.1/{}"
WEIGHTS_DIR = Path(os.environ.get("LWCC_WEIGHTS_DIR", Path.home() / ".lwcc" / "weights"))


def _weights_check(model_name: str, model_weights: str) -> str:
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    file_name = f"{model_name}_{model_weights}.pth"
    target = WEIGHTS_DIR / file_name
    if not target.is_file():
        print(f"Downloading {file_name} to {target} (one time, ~85 MB)...")
        partial = target.with_suffix(".part")
        urllib.request.urlretrieve(WEIGHTS_URL.format(file_name), partial)
        partial.rename(target)
    return str(target)


def _patch_lwcc() -> None:
    import lwcc.util.functions as functions
    from lwcc.models import Bay, CSRNet, DMCount, SFANet

    functions.weights_check = _weights_check
    for module in (Bay, CSRNet, DMCount, SFANet):
        module.weights_check = _weights_check


class CrowdModel:
    """Wraps lwcc so callers pass an OpenCV frame and get (count, density map)."""

    def __init__(self, model_name: str = "DM-Count", model_weights: str = "SHA", resize_img: bool = True):
        _patch_lwcc()
        from lwcc import LWCC

        self._lwcc = LWCC
        self.name = f"{model_name} ({model_weights})"
        self.model = LWCC.load_model(model_name=model_name, model_weights=model_weights)
        self.resize_img = resize_img
        # lwcc only reads image FILES, so each frame is written to a private temp file,
        # counted, and overwritten by the next frame. Nothing is kept.
        self._tmp = tempfile.TemporaryDirectory(prefix="crowdcam-")
        self._path = os.path.join(self._tmp.name, "frame.jpg")

    def density(self, frame_bgr: np.ndarray) -> tuple[float, np.ndarray]:
        cv2.imwrite(self._path, frame_bgr)
        count, density = self._lwcc.get_count(
            self._path, model=self.model, return_density=True, resize_img=self.resize_img
        )
        return float(count), np.asarray(density, dtype=np.float32)

    def close(self) -> None:
        self._tmp.cleanup()
