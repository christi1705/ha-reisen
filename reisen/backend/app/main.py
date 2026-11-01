"""Einstiegspunkt: API + ausgeliefertes Frontend (für HA Ingress)."""

import mimetypes
from contextlib import asynccontextmanager

import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import api, geo, ref, tiles
from .config import STATIC_DIR
from .db import init_db

# .mjs (pdf.js-Worker) muss als JavaScript ausgeliefert werden
mimetypes.add_type("text/javascript", ".mjs")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    tiles.prune_cache()
    yield


app = FastAPI(title="Reisen", version="0.3.3", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
# --- Zugriffsschutz -----------------------------------------------------------
# Die App hat keinen offenen Port. Erreichbar ist sie nur über HA Ingress, das den
# HA-Login prüft. Damit andere Container im internen Docker-Netz von HA sie nicht
# direkt (ohne Login) aufrufen können, werden nur Anfragen vom Ingress-Gateway
# (172.30.32.2) angenommen. REISEN_ALLOW_ALL=1 schaltet das für die Entwicklung ab.
INGRESS_IPS = {"172.30.32.2", "127.0.0.1", "::1"}
ALLOW_ALL = os.environ.get("REISEN_ALLOW_ALL") == "1"


@app.middleware("http")
async def ingress_only(request: Request, call_next):
    peer = request.client.host if request.client else ""
    if not ALLOW_ALL and peer not in INGRESS_IPS:
        return PlainTextResponse("Zugriff nur über Home Assistant", status_code=403)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


app.include_router(api.router)
app.include_router(ref.router)
app.include_router(geo.router)
app.include_router(tiles.router)


@app.get("/api/health")
def health():
    return {"ok": True}


if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith("api/"):
        raise HTTPException(404)
    f = STATIC_DIR / path
    if path and f.is_file() and STATIC_DIR in f.resolve().parents:
        return FileResponse(f)
    index = STATIC_DIR / "index.html"
    if not index.exists():
        return {"message": "Frontend nicht gebaut"}
    # index.html nie cachen, damit Updates sofort ankommen
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
