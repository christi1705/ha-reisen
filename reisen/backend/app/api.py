"""REST-API: Reisen, Buchungen, Anhänge, Aufgaben."""

import mimetypes
import re
import shutil
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from .config import DEFAULT_TIMEZONE, FILES_DIR, MAX_UPLOAD_MB
from .db import get_session
from .models import Attachment, Booking, Place, Task, Trip
from .schemas import (
    AttachmentOut,
    BookingIn,
    BookingOut,
    BookingPatch,
    NextBooking,
    PlaceIn,
    PlaceMove,
    PlaceOut,
    PlacePatch,
    TaskIn,
    TaskOut,
    TaskPatch,
    TripDetailOut,
    TripIn,
    TripOut,
    TripPatch,
)

router = APIRouter(prefix="/api")

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
# Nur diese Typen werden im Browser angezeigt. Alles andere (HTML, SVG, …) wird als
# Download ausgeliefert, damit hochgeladene Dateien keinen Code im HA-Kontext ausführen.
INLINE_TYPES = IMAGE_TYPES | {"application/pdf"}


# ---------------------------------------------------------------- Hilfen
def current_user(request: Request) -> Optional[str]:
    """HA Ingress liefert den angemeldeten Benutzer in Headern."""
    return request.headers.get("X-Remote-User-Display-Name") or request.headers.get("X-Remote-User-Name")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def to_utc(local: Optional[str], tz: Optional[str]) -> Optional[datetime]:
    if not local:
        return None
    try:
        dt = datetime.strptime(local[:16], "%Y-%m-%dT%H:%M")
    except ValueError:
        return None
    try:
        zone = ZoneInfo(tz or DEFAULT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("UTC")
    return dt.replace(tzinfo=zone).astimezone(timezone.utc)


def trip_status(t: Trip, today: Optional[date] = None) -> str:
    today = today or date.today()
    if today < t.start_date:
        return "upcoming"
    if today > t.end_date:
        return "past"
    return "running"


def att_out(a: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=a.id,
        trip_id=a.trip_id,
        booking_id=a.booking_id,
        filename=a.filename,
        mime=a.mime,
        size=a.size,
        url=f"api/attachments/{a.id}/file",
        uploaded_by=a.uploaded_by,
        uploaded_at=a.uploaded_at,
    )


def booking_out(b: Booking, atts: list[Attachment]) -> BookingOut:
    return BookingOut(
        **b.model_dump(exclude={"details", "from_location", "to_location"}),
        details=b.details or {},
        from_location=b.from_location,
        to_location=b.to_location,
        start_utc=to_utc(b.start_at, b.start_tz),
        end_utc=to_utc(b.end_at, b.end_tz or b.start_tz),
        attachments=[att_out(a) for a in atts if a.booking_id == b.id],
    )


def _sort_key(b: BookingOut):
    return (b.start_utc is None, b.start_utc or datetime.max.replace(tzinfo=timezone.utc), b.title)


def place_sort_key(p: Place):
    return (p.day is None, p.day or date.max, p.sort_order, p.created_at)


def task_sort_key(t: Task):
    return (t.done, t.due_date is None, t.due_date or date.max, t.sort_order, t.created_at)


def trip_out(s: Session, t: Trip, detail: bool = False):
    bookings = s.exec(select(Booking).where(Booking.trip_id == t.id)).all()
    tasks = s.exec(select(Task).where(Task.trip_id == t.id)).all()
    places = s.exec(select(Place).where(Place.trip_id == t.id)).all()
    today = date.today()
    atts = s.exec(select(Attachment).where(Attachment.trip_id == t.id)).all()
    b_out = sorted((booking_out(b, atts) for b in bookings), key=_sort_key)

    total = sum(
        (b.cost or 0)
        for b in bookings
        if b.status != "cancelled" and (b.cost_currency or t.currency) == t.currency
    )
    now = _now()
    nxt = next((b for b in b_out if b.status != "cancelled" and b.start_utc and b.start_utc >= now), None)

    base = dict(
        id=t.id,
        title=t.title,
        description=t.description,
        start_date=t.start_date,
        end_date=t.end_date,
        destinations=t.destinations or [],
        currency=t.currency,
        budget=t.budget,
        archived=t.archived,
        cover_url=f"api/trips/{t.id}/cover?v={int(t.updated_at.timestamp())}" if t.cover_file else None,
        status=trip_status(t),
        days=(t.end_date - t.start_date).days + 1,
        booking_count=len(bookings),
        attachment_count=len(atts),
        total_cost=round(total, 2),
        place_count=len(places),
        open_tasks=sum(1 for x in tasks if not x.done),
        overdue_tasks=sum(1 for x in tasks if not x.done and x.due_date and x.due_date < today),
        next_booking=NextBooking(
            id=nxt.id, type=nxt.type, title=nxt.title, start_at=nxt.start_at, start_tz=nxt.start_tz
        )
        if nxt
        else None,
        created_by=t.created_by,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )
    if not detail:
        return TripOut(**base)
    return TripDetailOut(
        **base,
        bookings=b_out,
        attachments=[att_out(a) for a in atts],
        tasks=[TaskOut(**x.model_dump()) for x in sorted(tasks, key=task_sort_key)],
        places=[PlaceOut(**p.model_dump()) for p in sorted(places, key=place_sort_key)],
    )


def get_trip_or_404(s: Session, trip_id: str) -> Trip:
    t = s.get(Trip, trip_id)
    if not t:
        raise HTTPException(404, "Reise nicht gefunden")
    return t


def _safe_name(name: str) -> str:
    name = Path(name or "datei").name
    name = re.sub(r"[\x00-\x1f/\\]", "_", name).strip() or "datei"
    return name[:200]


async def _store_upload(upload: UploadFile, dest: Path) -> int:
    limit = MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with dest.open("wb") as f:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Datei ist größer als {MAX_UPLOAD_MB} MB")
                f.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    return size


def _guess_mime(upload: UploadFile, filename: str) -> str:
    mime = upload.content_type or ""
    if not mime or mime == "application/octet-stream":
        mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return mime


# ---------------------------------------------------------------- Allgemein
@router.get("/info")
def info(request: Request):
    from .config import CARTO_API_KEY, DEFAULT_CURRENCY

    if CARTO_API_KEY:
        tiles = {
            "url": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=" + CARTO_API_KEY,
            "attribution": '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            "subdomains": "abcd",
            "max_zoom": 20,
            "provider": "carto",
        }
    else:
        # Ohne CARTO-Schlüssel: Standard-Karte von OpenStreetMap (kein Schlüssel nötig)
        tiles = {
            # Über das eigene Backend (Cache + User-Agent), da OSM Anfragen ohne Referer blockiert
            "url": "api/tiles/{z}/{x}/{y}.png",
            "attribution": '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
            "subdomains": "",
            "max_zoom": 19,
            "provider": "osm",
        }
    return {
        "tiles": tiles,
        "user": current_user(request),
        "default_currency": DEFAULT_CURRENCY,
        "default_timezone": DEFAULT_TIMEZONE,
        "version": "0.3.3",
    }


# ---------------------------------------------------------------- Reisen
@router.get("/trips", response_model=list[TripOut])
def list_trips(s: Session = Depends(get_session)):
    trips = s.exec(select(Trip)).all()
    return [trip_out(s, t) for t in sorted(trips, key=lambda t: t.start_date)]


@router.post("/trips", response_model=TripDetailOut, status_code=201)
def create_trip(data: TripIn, request: Request, s: Session = Depends(get_session)):
    t = Trip(
        **data.model_dump(exclude={"destinations"}),
        destinations=[d.model_dump() for d in data.destinations],
        created_by=current_user(request),
    )
    s.add(t)
    s.commit()
    s.refresh(t)
    return trip_out(s, t, detail=True)


@router.get("/trips/{trip_id}", response_model=TripDetailOut)
def get_trip(trip_id: str, s: Session = Depends(get_session)):
    return trip_out(s, get_trip_or_404(s, trip_id), detail=True)


@router.patch("/trips/{trip_id}", response_model=TripDetailOut)
def update_trip(trip_id: str, data: TripPatch, s: Session = Depends(get_session)):
    t = get_trip_or_404(s, trip_id)
    changes = data.model_dump(exclude_unset=True)
    if "destinations" in changes:
        changes["destinations"] = [d.model_dump() for d in data.destinations or []]
    for k, v in changes.items():
        setattr(t, k, v)
    if t.end_date < t.start_date:
        raise HTTPException(422, "Das Enddatum liegt vor dem Startdatum")
    t.updated_at = _now()
    s.add(t)
    s.commit()
    s.refresh(t)
    return trip_out(s, t, detail=True)


@router.delete("/trips/{trip_id}", status_code=204)
def delete_trip(trip_id: str, s: Session = Depends(get_session)):
    t = get_trip_or_404(s, trip_id)
    for a in s.exec(select(Attachment).where(Attachment.trip_id == t.id)).all():
        s.delete(a)
    for x in s.exec(select(Task).where(Task.trip_id == t.id)).all():
        s.delete(x)
    for x in s.exec(select(Place).where(Place.trip_id == t.id)).all():
        s.delete(x)
    for b in s.exec(select(Booking).where(Booking.trip_id == t.id)).all():
        s.delete(b)
    s.delete(t)
    s.commit()
    shutil.rmtree(FILES_DIR / trip_id, ignore_errors=True)


@router.post("/trips/{trip_id}/cover", response_model=TripDetailOut)
async def upload_cover(trip_id: str, file: UploadFile = File(...), s: Session = Depends(get_session)):
    t = get_trip_or_404(s, trip_id)
    mime = _guess_mime(file, file.filename or "")
    if mime not in IMAGE_TYPES:
        raise HTTPException(415, "Bitte ein Bild (JPG, PNG, WebP, GIF) hochladen")
    ext = mimetypes.guess_extension(mime) or ".img"
    name = f"cover-{uuid.uuid4().hex[:8]}{ext}"
    await _store_upload(file, FILES_DIR / t.id / name)
    if t.cover_file:
        (FILES_DIR / t.id / t.cover_file).unlink(missing_ok=True)
    t.cover_file = name
    t.updated_at = _now()
    s.add(t)
    s.commit()
    s.refresh(t)
    return trip_out(s, t, detail=True)


@router.delete("/trips/{trip_id}/cover", response_model=TripDetailOut)
def delete_cover(trip_id: str, s: Session = Depends(get_session)):
    t = get_trip_or_404(s, trip_id)
    if t.cover_file:
        (FILES_DIR / t.id / t.cover_file).unlink(missing_ok=True)
        t.cover_file = None
        t.updated_at = _now()
        s.add(t)
        s.commit()
        s.refresh(t)
    return trip_out(s, t, detail=True)


@router.get("/trips/{trip_id}/cover")
def get_cover(trip_id: str, s: Session = Depends(get_session)):
    t = get_trip_or_404(s, trip_id)
    if not t.cover_file:
        raise HTTPException(404, "Kein Titelbild")
    path = FILES_DIR / t.id / t.cover_file
    if not path.exists():
        raise HTTPException(404, "Kein Titelbild")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=31536000, immutable"})


# ---------------------------------------------------------------- Buchungen
def _booking_values(data, trip: Trip) -> dict:
    vals = data.model_dump(exclude_unset=True)
    for k in ("from_location", "to_location"):
        if k in vals and vals[k] is not None:
            vals[k] = getattr(data, k).model_dump()
    if vals.get("cost") is not None and not vals.get("cost_currency"):
        vals["cost_currency"] = trip.currency
    return vals


@router.post("/trips/{trip_id}/bookings", response_model=BookingOut, status_code=201)
def create_booking(trip_id: str, data: BookingIn, s: Session = Depends(get_session)):
    t = get_trip_or_404(s, trip_id)
    b = Booking(trip_id=t.id, **_booking_values(data, t))
    s.add(b)
    t.updated_at = _now()
    s.add(t)
    s.commit()
    s.refresh(b)
    return booking_out(b, [])


def get_booking_or_404(s: Session, booking_id: str) -> Booking:
    b = s.get(Booking, booking_id)
    if not b:
        raise HTTPException(404, "Buchung nicht gefunden")
    return b


@router.get("/bookings/{booking_id}", response_model=BookingOut)
def get_booking(booking_id: str, s: Session = Depends(get_session)):
    b = get_booking_or_404(s, booking_id)
    atts = s.exec(select(Attachment).where(Attachment.booking_id == b.id)).all()
    return booking_out(b, atts)


@router.patch("/bookings/{booking_id}", response_model=BookingOut)
def update_booking(booking_id: str, data: BookingPatch, s: Session = Depends(get_session)):
    b = get_booking_or_404(s, booking_id)
    t = get_trip_or_404(s, b.trip_id)
    for k, v in _booking_values(data, t).items():
        setattr(b, k, v)
    b.updated_at = _now()
    s.add(b)
    s.commit()
    s.refresh(b)
    atts = s.exec(select(Attachment).where(Attachment.booking_id == b.id)).all()
    return booking_out(b, atts)


@router.delete("/bookings/{booking_id}", status_code=204)
def delete_booking(booking_id: str, delete_attachments: bool = False, s: Session = Depends(get_session)):
    b = get_booking_or_404(s, booking_id)
    for a in s.exec(select(Attachment).where(Attachment.booking_id == b.id)).all():
        if delete_attachments:
            (FILES_DIR / a.trip_id / a.storage_name).unlink(missing_ok=True)
            s.delete(a)
        else:
            # Anhänge bleiben an der Reise erhalten
            a.booking_id = None
            s.add(a)
    s.delete(b)
    s.commit()


# ---------------------------------------------------------------- Anhänge
@router.post("/attachments", response_model=list[AttachmentOut], status_code=201)
async def upload_attachments(
    request: Request,
    trip_id: str = Form(...),
    booking_id: Optional[str] = Form(None),
    files: list[UploadFile] = File(...),
    s: Session = Depends(get_session),
):
    t = get_trip_or_404(s, trip_id)
    if booking_id:
        b = get_booking_or_404(s, booking_id)
        if b.trip_id != t.id:
            raise HTTPException(400, "Buchung gehört nicht zu dieser Reise")
    result = []
    for up in files:
        filename = _safe_name(up.filename or "datei")
        ext = Path(filename).suffix.lower()[:10]
        storage = f"{uuid.uuid4().hex}{ext}"
        size = await _store_upload(up, FILES_DIR / t.id / storage)
        a = Attachment(
            trip_id=t.id,
            booking_id=booking_id or None,
            filename=filename,
            mime=_guess_mime(up, filename),
            size=size,
            storage_name=storage,
            uploaded_by=current_user(request),
        )
        s.add(a)
        result.append(a)
    s.commit()
    for a in result:
        s.refresh(a)
    return [att_out(a) for a in result]


@router.patch("/attachments/{att_id}", response_model=AttachmentOut)
def update_attachment(att_id: str, data: dict, s: Session = Depends(get_session)):
    a = s.get(Attachment, att_id)
    if not a:
        raise HTTPException(404, "Anhang nicht gefunden")
    if "filename" in data and data["filename"]:
        a.filename = _safe_name(str(data["filename"]))
    if "booking_id" in data:
        bid = data["booking_id"] or None
        if bid:
            b = get_booking_or_404(s, bid)
            if b.trip_id != a.trip_id:
                raise HTTPException(400, "Buchung gehört nicht zu dieser Reise")
        a.booking_id = bid
    s.add(a)
    s.commit()
    s.refresh(a)
    return att_out(a)


@router.get("/attachments/{att_id}/file")
def get_attachment_file(att_id: str, download: bool = False, s: Session = Depends(get_session)):
    a = s.get(Attachment, att_id)
    if not a:
        raise HTTPException(404, "Anhang nicht gefunden")
    path = FILES_DIR / a.trip_id / a.storage_name
    if not path.exists():
        raise HTTPException(404, "Datei fehlt")
    safe = a.mime in INLINE_TYPES
    headers = {"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"}
    if not safe:
        headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return FileResponse(
        path,
        media_type=a.mime if safe else "application/octet-stream",
        filename=a.filename,
        content_disposition_type="inline" if (safe and not download) else "attachment",
        headers=headers,
    )


@router.delete("/attachments/{att_id}", status_code=204)
def delete_attachment(att_id: str, s: Session = Depends(get_session)):
    a = s.get(Attachment, att_id)
    if not a:
        raise HTTPException(404, "Anhang nicht gefunden")
    (FILES_DIR / a.trip_id / a.storage_name).unlink(missing_ok=True)
    s.delete(a)
    s.commit()


# ---------------------------------------------------------------- Aufgaben
def get_task_or_404(s: Session, task_id: str) -> Task:
    x = s.get(Task, task_id)
    if not x:
        raise HTTPException(404, "Aufgabe nicht gefunden")
    return x


@router.get("/trips/{trip_id}/tasks", response_model=list[TaskOut])
def list_tasks(trip_id: str, s: Session = Depends(get_session)):
    get_trip_or_404(s, trip_id)
    return sorted(s.exec(select(Task).where(Task.trip_id == trip_id)).all(), key=task_sort_key)


@router.post("/trips/{trip_id}/tasks", response_model=TaskOut, status_code=201)
def create_task(trip_id: str, data: TaskIn, request: Request, s: Session = Depends(get_session)):
    t = get_trip_or_404(s, trip_id)
    last = s.exec(select(Task).where(Task.trip_id == t.id)).all()
    x = Task(
        trip_id=t.id,
        **data.model_dump(),
        sort_order=max((y.sort_order for y in last), default=0) + 1,
        created_by=current_user(request),
    )
    s.add(x)
    s.commit()
    s.refresh(x)
    return x


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: str, data: TaskPatch, s: Session = Depends(get_session)):
    x = get_task_or_404(s, task_id)
    changes = data.model_dump(exclude_unset=True)
    if "done" in changes and changes["done"] != x.done:
        x.done_at = _now() if changes["done"] else None
    for k, v in changes.items():
        setattr(x, k, v)
    s.add(x)
    s.commit()
    s.refresh(x)
    return x


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: str, s: Session = Depends(get_session)):
    s.delete(get_task_or_404(s, task_id))
    s.commit()


@router.post("/trips/{trip_id}/tasks/reorder", response_model=list[TaskOut])
def reorder_tasks(trip_id: str, ids: list[str], s: Session = Depends(get_session)):
    get_trip_or_404(s, trip_id)
    tasks = {x.id: x for x in s.exec(select(Task).where(Task.trip_id == trip_id)).all()}
    for i, tid in enumerate(ids):
        if tid in tasks:
            tasks[tid].sort_order = i
            s.add(tasks[tid])
    s.commit()
    return sorted(tasks.values(), key=task_sort_key)


@router.post("/trips/{trip_id}/tasks/clear-done", status_code=204)
def clear_done_tasks(trip_id: str, s: Session = Depends(get_session)):
    get_trip_or_404(s, trip_id)
    for x in s.exec(select(Task).where(Task.trip_id == trip_id, Task.done == True)).all():  # noqa: E712
        s.delete(x)
    s.commit()


# ---------------------------------------------------------------- Orte
def get_place_or_404(s: Session, place_id: str) -> Place:
    p = s.get(Place, place_id)
    if not p:
        raise HTTPException(404, "Ort nicht gefunden")
    return p


def _next_order(s: Session, trip_id: str, day: Optional[date]) -> int:
    rows = s.exec(select(Place).where(Place.trip_id == trip_id, Place.day == day)).all()
    return max((p.sort_order for p in rows), default=-1) + 1


@router.get("/trips/{trip_id}/places", response_model=list[PlaceOut])
def list_places(trip_id: str, s: Session = Depends(get_session)):
    get_trip_or_404(s, trip_id)
    return sorted(s.exec(select(Place).where(Place.trip_id == trip_id)).all(), key=place_sort_key)


@router.post("/trips/{trip_id}/places", response_model=PlaceOut, status_code=201)
def create_place(trip_id: str, data: PlaceIn, s: Session = Depends(get_session)):
    t = get_trip_or_404(s, trip_id)
    p = Place(trip_id=t.id, **data.model_dump(), sort_order=_next_order(s, t.id, data.day))
    s.add(p)
    s.commit()
    s.refresh(p)
    return p


@router.patch("/places/{place_id}", response_model=PlaceOut)
def update_place(place_id: str, data: PlacePatch, s: Session = Depends(get_session)):
    p = get_place_or_404(s, place_id)
    changes = data.model_dump(exclude_unset=True)
    if "day" in changes and changes["day"] != p.day:
        p.sort_order = _next_order(s, p.trip_id, changes["day"])
    for k, v in changes.items():
        setattr(p, k, v)
    s.add(p)
    s.commit()
    s.refresh(p)
    return p


@router.delete("/places/{place_id}", status_code=204)
def delete_place(place_id: str, s: Session = Depends(get_session)):
    s.delete(get_place_or_404(s, place_id))
    s.commit()


@router.post("/trips/{trip_id}/places/arrange", response_model=list[PlaceOut])
def arrange_places(trip_id: str, moves: list[PlaceMove], s: Session = Depends(get_session)):
    """Setzt Tag und Reihenfolge mehrerer Orte auf einmal (Drag & Drop)."""
    get_trip_or_404(s, trip_id)
    places = {p.id: p for p in s.exec(select(Place).where(Place.trip_id == trip_id)).all()}
    for m in moves:
        p = places.get(m.id)
        if p:
            p.day = m.day
            p.sort_order = m.sort_order
            s.add(p)
    s.commit()
    return sorted(places.values(), key=place_sort_key)
