"""Kartenkacheln von OpenStreetMap über das Backend (mit Zwischenspeicher).

Warum: Home Assistant schickt aus der App-Seite keinen Referer mit, und die
OSM-Tile-Server blockieren solche Anfragen (Tile Usage Policy). Das Backend
holt die Kacheln deshalb selbst – mit eindeutigem User-Agent und Cache –,
so wie es die Richtlinie verlangt: https://operations.osmfoundation.org/policies/tiles/
"""

import threading
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from .config import DATA_DIR

router = APIRouter(prefix="/api/tiles")

CACHE_DIR = DATA_DIR / "tilecache"
MAX_AGE = 30 * 24 * 3600  # Kacheln 30 Tage behalten
USER_AGENT = "ha-reisen/0.3 (Home Assistant App; +https://github.com/christi1705/ha-reisen)"
UPSTREAM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"

_slots = threading.Semaphore(2)  # OSM: höchstens 2 parallele Verbindungen
_HEADERS = {"Cache-Control": "public, max-age=604800"}


def _fetch(z: int, x: int, y: int) -> bytes:
    req = urllib.request.Request(UPSTREAM.format(z=z, x=x, y=y), headers={"User-Agent": USER_AGENT})
    with _slots, urllib.request.urlopen(req, timeout=10) as r:
        return r.read()


@router.get("/{z}/{x}/{y}.png")
def tile(z: int, x: int, y: int):
    if not (0 <= z <= 19) or not (0 <= x < 2**z) or not (0 <= y < 2**z):
        raise HTTPException(404)
    path = CACHE_DIR / str(z) / str(x) / f"{y}.png"
    fresh = path.exists() and time.time() - path.stat().st_mtime < MAX_AGE
    if fresh:
        return FileResponse(path, media_type="image/png", headers=_HEADERS)
    try:
        data = _fetch(z, x, y)
    except Exception:  # noqa: BLE001 – offline o. Ä.: alte Kachel ist besser als keine
        if path.exists():
            return FileResponse(path, media_type="image/png", headers=_HEADERS)
        raise HTTPException(502, "Kartenkachel nicht erreichbar")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)
    return Response(content=data, media_type="image/png", headers=_HEADERS)


def prune_cache() -> None:
    """Beim Start: sehr alte Kacheln entfernen, damit der Cache nicht endlos wächst."""
    if not CACHE_DIR.exists():
        return
    limit = time.time() - 2 * MAX_AGE
    for f in CACHE_DIR.rglob("*.png"):
        try:
            if f.stat().st_mtime < limit:
                f.unlink()
        except OSError:
            pass


def cache_dir() -> Path:
    return CACHE_DIR
