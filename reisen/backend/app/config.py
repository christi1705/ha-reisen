import json
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("REISEN_DATA_DIR", "/data"))
STATIC_DIR = Path(os.environ.get("REISEN_STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))
REF_DIR = Path(__file__).resolve().parent.parent / "data"

FILES_DIR = DATA_DIR / "files"
DB_PATH = DATA_DIR / "reisen.db"

MAX_UPLOAD_MB = 50


def load_options() -> dict:
    """Liest die Add-on-Optionen (von HA nach /data/options.json geschrieben)."""
    p = DATA_DIR / "options.json"
    if p.exists():
        try:
            return json.loads(p.read_text())
        except (OSError, ValueError):
            pass
    return {}


OPTIONS = load_options()
DEFAULT_CURRENCY = OPTIONS.get("default_currency", "EUR")
CARTO_API_KEY = (OPTIONS.get("carto_api_key") or "").strip()
DEFAULT_TIMEZONE = OPTIONS.get("default_timezone", os.environ.get("TZ", "Europe/Berlin"))
