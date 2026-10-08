"""Sends crowd readings to Ground Control's Supabase database.

Signs in as a normal event-manager account (never the service-role key), so the
database's own permission checks apply: record_crowd_reading only accepts managers.
Uses plain HTTPS (Supabase Auth + PostgREST), so no extra SDK is needed.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[1] / ".env.local"


def load_env(path: Path = ENV_FILE) -> None:
    """Minimal .env reader: KEY=value lines; real environment variables win."""
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class GroundControlError(RuntimeError):
    pass


class GroundControl:
    def __init__(self) -> None:
        load_env()
        missing = [k for k in ("GC_SUPABASE_URL", "GC_SUPABASE_KEY", "GC_EMAIL", "GC_PASSWORD") if not os.environ.get(k)]
        if missing:
            raise GroundControlError(f"Missing {', '.join(missing)}. Copy cv/.env.example to cv/.env.local and fill it in.")
        self.url = os.environ["GC_SUPABASE_URL"].rstrip("/")
        self.key = os.environ["GC_SUPABASE_KEY"]
        self._token: str | None = None
        self._expires = 0.0
        self.event_id = os.environ.get("GC_EVENT_ID") or None

    # ---- HTTP -------------------------------------------------------------
    def _request(self, method: str, path: str, body: dict | None = None, auth: bool = True):
        headers = {"apikey": self.key, "Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = f"Bearer {self._access_token()}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{self.url}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                raw = res.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            try:
                detail = json.loads(detail).get("message") or json.loads(detail).get("msg") or detail
            except (ValueError, AttributeError):
                pass
            raise GroundControlError(f"{method} {path} failed ({e.code}): {detail}") from None

    def _access_token(self) -> str:
        if self._token and time.time() < self._expires - 60:
            return self._token
        res = self._request(
            "POST", "/auth/v1/token?grant_type=password",
            {"email": os.environ["GC_EMAIL"], "password": os.environ["GC_PASSWORD"]}, auth=False,
        )
        self._token = res["access_token"]
        self._expires = time.time() + float(res.get("expires_in", 3600))
        return self._token

    # ---- Ground Control ---------------------------------------------------
    def resolve_event(self) -> str:
        if self.event_id:
            return self.event_id
        name = os.environ.get("GC_EVENT_NAME")
        if not name:
            raise GroundControlError("Set GC_EVENT_ID (or GC_EVENT_NAME) in cv/.env.local.")
        rows = self._request("GET", "/rest/v1/events?select=id,name&name=eq." + urllib.parse.quote(name))
        if not rows:
            raise GroundControlError(f"No event named {name!r} is visible to {os.environ['GC_EMAIL']}.")
        if len(rows) > 1:
            raise GroundControlError(f"Several events are named {name!r}; set GC_EVENT_ID instead.")
        self.event_id = rows[0]["id"]
        return self.event_id

    def record(self, camera: dict, reading: dict, captured_at: datetime | None = None) -> dict:
        """Calls record_crowd_reading. Returns {reading, sustained_density, alert}."""
        return self._request("POST", "/rest/v1/rpc/record_crowd_reading", {
            "p_event_id": self.resolve_event(),
            "p_camera_id": camera["camera_id"],
            "p_people": int(round(reading["people"])),
            "p_area_m2": camera["area_m2"],
            "p_trend": reading["trend"],
            "p_counterflow": round(float(reading["counterflow"]), 3),
            "p_confidence": camera.get("confidence"),
            "p_location_name": camera["location_name"],
            "p_captured_at": (captured_at or datetime.now(timezone.utc)).isoformat(),
        })

    def rpc(self, name: str, args: dict):
        """Call any Ground Control database function as the signed-in event manager."""
        return self._request("POST", f"/rest/v1/rpc/{name}", args)
