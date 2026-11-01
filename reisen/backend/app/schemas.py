"""Ein- und Ausgabeformate der API."""

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .models import BookingStatus, BookingType, PlaceCategory


class Location(BaseModel):
    name: str = ""
    lat: Optional[float] = None
    lon: Optional[float] = None
    ref: Optional[str] = None  # z. B. IATA-Code
    address: Optional[str] = None


class Destination(BaseModel):
    name: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    country_code: Optional[str] = None


def _check_local_dt(v: Optional[str]) -> Optional[str]:
    if v in (None, ""):
        return None
    try:
        datetime.strptime(v[:16], "%Y-%m-%dT%H:%M")
    except ValueError:
        try:
            datetime.strptime(v, "%Y-%m-%d")
            return v + "T00:00"
        except ValueError as e:
            raise ValueError("Format YYYY-MM-DDTHH:MM erwartet") from e
    return v[:16]


def _clean_names(v: Optional[list[str]]) -> Optional[list[str]]:
    if v is None:
        return None
    out: list[str] = []
    for n in v:
        n = (n or "").strip()[:60]
        if n and n.lower() not in {x.lower() for x in out}:
            out.append(n)
    return out


# ---------- Reisen ----------
class TripIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    start_date: date
    end_date: date
    destinations: list[Destination] = []
    travelers: list[str] = []
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    budget: Optional[float] = None

    @field_validator("travelers")
    @classmethod
    def _names(cls, v):
        return _clean_names(v)

    @model_validator(mode="after")
    def _dates(self):
        if self.end_date < self.start_date:
            raise ValueError("Das Enddatum liegt vor dem Startdatum")
        return self


class TripPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    destinations: Optional[list[Destination]] = None
    travelers: Optional[list[str]] = None
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    budget: Optional[float] = None
    archived: Optional[bool] = None

    @field_validator("travelers")
    @classmethod
    def _names(cls, v):
        return _clean_names(v)


class NextBooking(BaseModel):
    id: str
    type: str
    title: str
    start_at: Optional[str]
    start_tz: Optional[str]


class PlaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    category: PlaceCategory = "other"
    source_ref: Optional[str] = None
    day: Optional[date] = None
    time: Optional[str] = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_min: Optional[int] = None
    url: Optional[str] = None
    notes: Optional[str] = None


class PlacePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=300)
    address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    category: Optional[PlaceCategory] = None
    day: Optional[date] = None
    time: Optional[str] = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_min: Optional[int] = None
    url: Optional[str] = None
    notes: Optional[str] = None


class PlaceOut(BaseModel):
    id: str
    trip_id: str
    name: str
    address: Optional[str]
    lat: Optional[float]
    lon: Optional[float]
    category: str
    source_ref: Optional[str]
    day: Optional[date]
    sort_order: int
    time: Optional[str]
    duration_min: Optional[int]
    url: Optional[str]
    notes: Optional[str]


class PlaceMove(BaseModel):
    id: str
    day: Optional[date] = None
    sort_order: int


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    due_date: Optional[date] = None
    notes: Optional[str] = None


class TaskPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    done: Optional[bool] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class TaskOut(BaseModel):
    id: str
    trip_id: str
    title: str
    done: bool
    due_date: Optional[date]
    notes: Optional[str]
    sort_order: int
    created_by: Optional[str]
    created_at: datetime
    done_at: Optional[datetime]


class TripOut(BaseModel):
    id: str
    title: str
    description: Optional[str]
    start_date: date
    end_date: date
    destinations: list[dict[str, Any]]
    travelers: list[str] = []
    currency: str
    budget: Optional[float]
    archived: bool
    cover_url: Optional[str]
    status: str  # upcoming | running | past
    days: int
    booking_count: int
    attachment_count: int
    total_cost: float
    place_count: int = 0
    open_tasks: int = 0
    overdue_tasks: int = 0
    next_booking: Optional[NextBooking] = None
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime


# ---------- Buchungen ----------
class BookingIn(BaseModel):
    type: BookingType
    title: str = Field(min_length=1, max_length=300)
    provider: Optional[str] = None
    confirmation_code: Optional[str] = None
    status: BookingStatus = "booked"
    start_at: Optional[str] = None
    start_tz: Optional[str] = None
    end_at: Optional[str] = None
    end_tz: Optional[str] = None
    from_location: Optional[Location] = None
    to_location: Optional[Location] = None
    cost: Optional[float] = None
    cost_currency: Optional[str] = None
    details: dict[str, Any] = {}
    travelers: list[str] = []
    notes: Optional[str] = None

    @field_validator("start_at", "end_at")
    @classmethod
    def _local_dt(cls, v: Optional[str]) -> Optional[str]:
        return _check_local_dt(v)


class BookingPatch(BaseModel):
    type: Optional[BookingType] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    provider: Optional[str] = None
    confirmation_code: Optional[str] = None
    status: Optional[BookingStatus] = None
    start_at: Optional[str] = None
    start_tz: Optional[str] = None
    end_at: Optional[str] = None
    end_tz: Optional[str] = None
    from_location: Optional[Location] = None
    to_location: Optional[Location] = None
    cost: Optional[float] = None
    cost_currency: Optional[str] = None
    details: Optional[dict[str, Any]] = None
    travelers: Optional[list[str]] = None
    notes: Optional[str] = None

    @field_validator("start_at", "end_at")
    @classmethod
    def _local_dt(cls, v: Optional[str]) -> Optional[str]:
        return _check_local_dt(v)


class AttachmentOut(BaseModel):
    id: str
    trip_id: str
    booking_id: Optional[str]
    filename: str
    mime: str
    size: int
    url: str
    uploaded_by: Optional[str]
    uploaded_at: datetime


class BookingOut(BaseModel):
    id: str
    trip_id: str
    type: str
    title: str
    provider: Optional[str]
    confirmation_code: Optional[str]
    status: str
    start_at: Optional[str]
    start_tz: Optional[str]
    end_at: Optional[str]
    end_tz: Optional[str]
    start_utc: Optional[datetime]
    end_utc: Optional[datetime]
    from_location: Optional[dict[str, Any]]
    to_location: Optional[dict[str, Any]]
    cost: Optional[float]
    cost_currency: Optional[str]
    details: dict[str, Any]
    travelers: list[str] = []
    notes: Optional[str]
    attachments: list[AttachmentOut] = []
    created_at: datetime
    updated_at: datetime


class TripDetailOut(TripOut):
    bookings: list[BookingOut]
    attachments: list[AttachmentOut]
    tasks: list[TaskOut]
    places: list[PlaceOut]
