from pydantic import BaseModel, model_validator
from timezonefinder import TimezoneFinder
from sqlmodel import SQLModel, Field, Column, JSON
from geopy import Nominatim

tf = TimezoneFinder()
geolocator = Nominatim(user_agent="ai_assistant")

class Location(BaseModel):
    name: str | None = None
    lat: float | None = None
    lon: float | None = None
    timezone: str | None = None


    @classmethod
    def resolve(cls, *, name=None, lat=None, lon=None) -> "Location":
        """Hits the network. Call when SAVING a user, never when loading one."""
        if lat is not None and lon is not None and not name:
            loc = geolocator.reverse((lat, lon), language="en")
            addr = (loc.raw.get("address") if loc else {}) or {}
            name = (addr.get("city") or addr.get("town") or addr.get("village")
                    or addr.get("municipality") or addr.get("county"))
        elif name and (lat is None or lon is None):
            loc = geolocator.geocode(name.strip(), exactly_one=True)
            if not loc:
                raise ValueError(f"Could not geocode {name!r}")
            lat, lon = loc.latitude, loc.longitude

        tz = None
        if lat is not None and lon is not None:
            tz = tf.timezone_at(lat=lat, lng=lon) or "UTC"
        return cls(name=name, lat=lat, lon=lon, timezone=tz)


class Users(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(index=True)
    telegram_id: str | None = Field(default=None, index=True, unique=True)
    location: dict | None = Field(default=None, sa_column=Column(JSON))

class UserForm(BaseModel):
    username: str
    telegram_id: str | None = None
    location: str | None = None

class User(SQLModel):
    id: int
    username: str
    location: Location | None = None
    telegram_id: str | None = None

    @classmethod
    def from_row(cls, row: Users) -> "User":
        return cls(
            id=row.id,
            username=row.username,
            telegram_id=row.telegram_id,
            location=Location(**row.location) if row.location else None,
       )
