"""Referenzdaten: Flughäfen und Airlines (offline, aus backend/data)."""

import json
import unicodedata
from functools import lru_cache

from fastapi import APIRouter, Query

from .config import REF_DIR

router = APIRouter(prefix="/api/ref")


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


# Deutsche Namen großer Städte, damit z. B. "München" auch "Munich" findet
DE_ALIASES = {
    "munich": "münchen muenchen", "cologne": "köln koeln", "nuremberg": "nürnberg nuernberg",
    "vienna": "wien", "rome": "rom", "milan": "mailand", "venice": "venedig", "naples": "neapel",
    "florence": "florenz", "lisbon": "lissabon", "copenhagen": "kopenhagen", "prague": "prag",
    "warsaw": "warschau", "brussels": "brüssel bruessel", "geneva": "genf", "zurich": "zürich zuerich",
    "athens": "athen", "moscow": "moskau", "beijing": "peking", "cairo": "kairo", "seville": "sevilla",
    "krakow": "krakau", "palma de mallorca": "mallorca", "palma": "mallorca", "the hague": "den haag",
    "gothenburg": "göteborg", "bucharest": "bukarest", "belgrade": "belgrad", "tbilisi": "tiflis",
    "mexico city": "mexiko-stadt", "cape town": "kapstadt", "new delhi": "neu-delhi",
}


@lru_cache
def airports() -> list[dict]:
    rows = json.loads((REF_DIR / "airports.json").read_text())
    for r in rows:
        alias = DE_ALIASES.get(_norm(r["city"]), "")
        r["_s"] = _norm(f"{r['iata']} {r['icao']} {r['name']} {r['city']} {alias}")
        r["_a"] = _norm(alias)
    return rows


@lru_cache
def airlines() -> list[dict]:
    rows = json.loads((REF_DIR / "airlines.json").read_text())
    for r in rows:
        r["_s"] = _norm(f"{r['iata']} {r['icao']} {r['name']}")
    return rows


def _search(rows: list[dict], q: str, code_len: int, limit: int) -> list[dict]:
    q = _norm(q.strip())
    if not q:
        return []
    code = q.upper()
    exact, starts, contains = [], [], []
    for r in rows:
        if r["iata"] == code or (len(code) == code_len + 1 and r.get("icao") == code):
            exact.append(r)
        elif (
            _norm(r.get("city", "")).startswith(q)
            or _norm(r["name"]).startswith(q)
            or any(a.startswith(q) for a in r.get("_a", "").split())
        ):
            starts.append(r)
        elif q in r["_s"]:
            contains.append(r)
    by_rank = lambda xs: sorted(xs, key=lambda r: -r.get("rank", 0))  # noqa: E731
    out = (exact + by_rank(starts) + by_rank(contains))[:limit]
    return [{k: v for k, v in r.items() if k not in ("_s", "_a", "rank")} for r in out]


@router.get("/airports")
def search_airports(q: str = Query(..., min_length=1), limit: int = Query(10, le=50)):
    return _search(airports(), q, 3, limit)


@router.get("/airports/{iata}")
def get_airport(iata: str):
    code = iata.upper()
    r = next((r for r in airports() if r["iata"] == code), None)
    return {k: v for k, v in r.items() if k != "_s"} if r else None


@router.get("/airlines")
def search_airlines(q: str = Query(..., min_length=1), limit: int = Query(10, le=50)):
    return _search(airlines(), q, 2, limit)
