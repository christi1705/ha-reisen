"""Ortssuche über OpenStreetMap (Photon, Fallback Nominatim).

- Läuft über das Backend, damit Cache und Nutzungsregeln (max. 1 Anfrage/s,
  eindeutiger User-Agent) zentral eingehalten werden.
- Liefert einheitliche Treffer: name, address, lat, lon, category, source_ref, kind.
"""

import json
import threading
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/search")

USER_AGENT = "ha-reisen/0.3 (+https://github.com/christi1705/ha-reisen)"
PHOTON = "https://photon.komoot.io/api/"
NOMINATIM = "https://nominatim.openstreetmap.org/search"

_cache: "OrderedDict[str, list[dict]]" = OrderedDict()
_CACHE_MAX = 500
_lock = threading.Lock()
_last_call = 0.0


def _throttle() -> None:
    global _last_call
    with _lock:
        wait = 1.0 - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def _get(url: str) -> object:
    _throttle()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "de,en"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


def category_for(key: str, value: str) -> str:
    """OSM-Tag -> Kategorie der App."""
    key, value = (key or "").lower(), (value or "").lower()
    if key == "amenity":
        if value in ("bar", "pub", "nightclub", "biergarten"):
            return "nightlife"
        if value in ("restaurant", "cafe", "fast_food", "food_court", "ice_cream"):
            return "food"
        if value in ("theatre", "cinema", "arts_centre", "place_of_worship"):
            return "sight"
        if value in ("bus_station", "ferry_terminal", "car_rental", "parking", "fuel", "taxi"):
            return "transport"
    if key == "tourism":
        if value in ("hotel", "hostel", "guest_house", "motel", "apartment", "camp_site", "chalet", "alpine_hut"):
            return "lodging"
        if value in ("attraction", "museum", "viewpoint", "artwork", "gallery", "zoo", "theme_park", "aquarium"):
            return "sight"
    if key in ("historic", "heritage"):
        return "sight"
    if key == "building" and value in ("cathedral", "church", "castle", "palace", "temple", "mosque"):
        return "sight"
    if key in ("natural", "waterway") or (key == "leisure" and value in ("park", "nature_reserve", "garden", "beach_resort")):
        return "nature"
    if key == "shop":
        return "shopping"
    if key in ("railway", "public_transport", "aeroway") or (key == "highway" and value == "bus_stop"):
        return "transport"
    return "other"


def _join(*parts: Optional[str]) -> str:
    seen, out = set(), []
    for p in parts:
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return ", ".join(out)


def _from_photon(data: dict) -> list[dict]:
    out = []
    for f in data.get("features", []):
        p = f.get("properties", {})
        lon, lat = f["geometry"]["coordinates"][:2]
        street = " ".join(x for x in (p.get("street"), p.get("housenumber")) if x)
        city = p.get("city") or p.get("town") or p.get("village") or p.get("county")
        name = p.get("name") or street or city or ""
        if not name:
            continue
        kind = p.get("type") or ""
        out.append(
            {
                "name": name,
                "address": _join(street if street != name else None, " ".join(x for x in (p.get("postcode"), city) if x) if city != name else None, p.get("country") if p.get("country") != name else None),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "category": category_for(p.get("osm_key", ""), p.get("osm_value", "")),
                "kind": kind,  # house, street, city, district, country …
                "country_code": (p.get("countrycode") or "").upper() or None,
                "source_ref": f"osm:{p.get('osm_type', '')}{p.get('osm_id', '')}",
            }
        )
    return out


def _from_nominatim(data: list) -> list[dict]:
    out = []
    for r in data:
        a = r.get("address", {})
        name = r.get("name") or r.get("display_name", "").split(",")[0]
        city = a.get("city") or a.get("town") or a.get("village")
        street = " ".join(x for x in (a.get("road"), a.get("house_number")) if x)
        out.append(
            {
                "name": name,
                "address": _join(street or None, " ".join(x for x in (a.get("postcode"), city) if x) or None, a.get("country")),
                "lat": round(float(r["lat"]), 6),
                "lon": round(float(r["lon"]), 6),
                "category": category_for(r.get("class", ""), r.get("type", "")),
                "kind": r.get("addresstype") or r.get("type") or "",
                "country_code": (a.get("country_code") or "").upper() or None,
                "source_ref": f"osm:{(r.get('osm_type') or ' ')[0].upper()}{r.get('osm_id', '')}",
            }
        )
    return out


@router.get("/places")
def search_places(
    q: str = Query(..., min_length=2, max_length=200),
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    limit: int = Query(8, ge=1, le=15),
):
    q = q.strip()
    bias = f"{round(lat, 2)},{round(lon, 2)}" if lat is not None and lon is not None else ""
    key = f"{q.lower()}|{bias}|{limit}"
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]

    results: list[dict] = []
    errors = []
    params = {"q": q, "limit": limit, "lang": "de"}
    if bias:
        params.update(lat=lat, lon=lon)
    try:
        results = _from_photon(_get(f"{PHOTON}?{urllib.parse.urlencode(params)}"))  # type: ignore[arg-type]
    except Exception as e:  # noqa: BLE001 – Netzwerkfehler aller Art
        errors.append(f"Photon: {e}")
    if not results:
        try:
            nparams = {"q": q, "format": "jsonv2", "addressdetails": 1, "limit": limit, "accept-language": "de"}
            results = _from_nominatim(_get(f"{NOMINATIM}?{urllib.parse.urlencode(nparams)}"))  # type: ignore[arg-type]
        except Exception as e:  # noqa: BLE001
            errors.append(f"Nominatim: {e}")
    if not results and errors:
        raise HTTPException(502, "Ortssuche nicht erreichbar (" + "; ".join(errors) + ")")

    _cache[key] = results
    if len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return results
