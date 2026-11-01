"""Datenmodell der Reisen-App: Reisen, Buchungen, Anhänge, Aufgaben."""

import uuid
from datetime import date, datetime, timezone
from typing import Any, Literal, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

BOOKING_TYPES = (
    "flight",
    "train",
    "bus",
    "boat",
    "car",
    "taxi",
    "rental_car",
    "bike",
    "lodging",
    "restaurant",
    "activity",
)
BookingType = Literal[
    "flight", "train", "bus", "boat", "car", "taxi", "rental_car", "bike", "lodging", "restaurant", "activity"
]
BookingStatus = Literal["idea", "todo", "booked", "confirmed", "cancelled"]


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Trip(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    title: str
    description: Optional[str] = None
    start_date: date
    end_date: date
    destinations: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    currency: str = "EUR"
    budget: Optional[float] = None
    cover_file: Optional[str] = None
    archived: bool = False
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class Booking(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    type: str
    title: str
    provider: Optional[str] = None
    confirmation_code: Optional[str] = None
    status: str = "booked"
    # Lokale Zeit als "YYYY-MM-DDTHH:MM" plus IANA-Zeitzone
    start_at: Optional[str] = None
    start_tz: Optional[str] = None
    end_at: Optional[str] = None
    end_tz: Optional[str] = None
    from_location: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    to_location: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    cost: Optional[float] = None
    cost_currency: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class Attachment(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    booking_id: Optional[str] = Field(default=None, foreign_key="booking.id", index=True)
    filename: str
    mime: str
    size: int
    storage_name: str
    uploaded_by: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=_now)


PLACE_CATEGORIES = ("sight", "food", "nature", "shopping", "nightlife", "lodging", "transport", "other")
PlaceCategory = Literal["sight", "food", "nature", "shopping", "nightlife", "lodging", "transport", "other"]


class Place(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    category: str = "other"
    source_ref: Optional[str] = None
    day: Optional[date] = None  # None = ungeplant
    sort_order: int = 0
    time: Optional[str] = None  # "HH:MM"
    duration_min: Optional[int] = None
    url: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


class Task(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    trip_id: str = Field(foreign_key="trip.id", index=True)
    title: str
    done: bool = False
    due_date: Optional[date] = None
    notes: Optional[str] = None
    sort_order: int = 0
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    done_at: Optional[datetime] = None


class SchemaInfo(SQLModel, table=True):
    """Einfache Versionsverwaltung des Schemas für spätere Migrationen."""

    key: str = Field(primary_key=True)
    value: str
