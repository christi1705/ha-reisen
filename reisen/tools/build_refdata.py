"""Erzeugt die kompakten Referenzdaten (Flughäfen, Airlines) für die App.

Quellen:
  - Flughäfen: Python-Paket `airportsdata` (MIT), enthält IATA-Code, Koordinaten und Zeitzone
  - Rang (Größe) der Flughäfen: OurAirports airports.csv (Public Domain)
      https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
  - Airlines:  OpenFlights airlines.dat (ODbL)
      https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat

Aufruf:
  pip install airportsdata
  python tools/build_refdata.py path/to/airlines.dat path/to/ourairports.csv
Die Ergebnisse landen in backend/data/ und werden mit eingecheckt.
"""

import csv
import json
import sys
from pathlib import Path

import airportsdata

OUT = Path(__file__).resolve().parent.parent / "backend" / "data"


RANK = {"large_airport": 3, "medium_airport": 2, "small_airport": 1}


def load_ranks(path: str | None) -> dict[str, int]:
    """IATA -> Rang (0-4); große Flughäfen mit Linienverkehr zuerst."""
    if not path:
        return {}
    ranks = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            code = (r.get("iata_code") or "").strip()
            if code:
                ranks[code] = RANK.get(r["type"], 0) + (1 if r.get("scheduled_service") == "yes" else 0)
    return ranks


def build_airports(ranks: dict[str, int]) -> None:
    data = airportsdata.load("IATA")
    rows = []
    for iata, a in sorted(data.items()):
        rows.append(
            {
                "iata": iata,
                "icao": a.get("icao") or "",
                "name": a["name"],
                "city": a.get("city") or "",
                "country": a.get("country") or "",
                "lat": round(a["lat"], 5),
                "lon": round(a["lon"], 5),
                "tz": a.get("tz") or "",
                "rank": ranks.get(iata, 0),
            }
        )
    (OUT / "airports.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    print(f"airports: {len(rows)}")


def build_airlines(path: str) -> None:
    rows = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.reader(f):
            if len(r) < 8:
                continue
            _id, name, _alias, iata, icao, _callsign, country, active = r[:8]
            iata = iata.strip()
            if not iata or iata in ("\\N", "-") or len(iata) != 2 or active != "Y":
                continue
            # Bei doppelten Codes den ersten aktiven Eintrag behalten
            rows.setdefault(iata, {"iata": iata, "icao": "" if icao == "\\N" else icao, "name": name, "country": country})
    out = sorted(rows.values(), key=lambda x: x["iata"])
    (OUT / "airlines.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"airlines: {len(out)}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    build_airports(load_ranks(sys.argv[2] if len(sys.argv) > 2 else None))
    if len(sys.argv) > 1:
        build_airlines(sys.argv[1])
