"""Einstiegspunkt: API + ausgeliefertes Frontend (für HA Ingress)."""

import mimetypes
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import api, geo, ref
from .config import STATIC_DIR
from .db import init_db

# .mjs (pdf.js-Worker) muss als JavaScript ausgeliefert werden
mimetypes.add_type("text/javascript", ".mjs")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Reisen", version="0.3.1", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(api.router)
app.include_router(ref.router)
app.include_router(geo.router)


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
