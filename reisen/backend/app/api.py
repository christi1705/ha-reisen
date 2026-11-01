"""REST-API: Reisen, Buchungen, Anhänge."""

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
from .models import Attachment, Booking, Trip
from .schemas import (
    AttachmentOut,
    BookingIn,
    BookingOut,
    BookingPatch,
    NextBooking,
    TripDetailOut,
    TripIn,
    TripOut,
    TripPatch,
)

router = APIRouter(prefix="/api")

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


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


def trip_out(s: Session, t: Trip, detail: bool = False):
    bookings = s.exec(select(Booking).where(Booking.trip_id == t.id)).all()
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
    return TripDetailOut(**base, bookings=b_out, attachments=[att_out(a) for a in atts])


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
    from .config import DEFAULT_CURRENCY

    return {
        "user": current_user(request),
        "default_currency": DEFAULT_CURRENCY,
        "default_timezone": DEFAULT_TIMEZONE,
        "version": "0.1.0",
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
    return FileResponse(
        path,
        media_type=a.mime,
        filename=a.filename,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/attachments/{att_id}", status_code=204)
def delete_attachment(att_id: str, s: Session = Depends(get_session)):
    a = s.get(Attachment, att_id)
    if not a:
        raise HTTPException(404, "Anhang nicht gefunden")
    (FILES_DIR / a.trip_id / a.storage_name).unlink(missing_ok=True)
    s.delete(a)
    s.commit()
