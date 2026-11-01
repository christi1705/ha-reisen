from collections.abc import Iterator

from sqlalchemy import event, text
from sqlmodel import Session, SQLModel, create_engine, select

from .config import DATA_DIR, DB_PATH, FILES_DIR
from .models import SchemaInfo

SCHEMA_VERSION = "2"

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    cur.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        info = s.exec(select(SchemaInfo).where(SchemaInfo.key == "version")).first()
        if info is None:
            s.add(SchemaInfo(key="version", value=SCHEMA_VERSION))
            s.commit()
    _migrate()


def _add_column(conn, table: str, column: str, ddl: str) -> None:
    cols = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}
    if column not in cols:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def _migrate() -> None:
    """Spalten nachrüsten, die create_all bei bestehenden Tabellen nicht anlegt."""
    with engine.begin() as conn:
        # v2: Reisende pro Reise und pro Buchung
        _add_column(conn, "trip", "travelers", "JSON NOT NULL DEFAULT '[]'")
        _add_column(conn, "booking", "travelers", "JSON NOT NULL DEFAULT '[]'")
        conn.execute(text("UPDATE schemainfo SET value = :v WHERE key = 'version'"), {"v": SCHEMA_VERSION})


def get_session() -> Iterator[Session]:
    with Session(engine) as s:
        yield s
