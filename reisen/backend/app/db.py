from collections.abc import Iterator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine, select

from .config import DATA_DIR, DB_PATH, FILES_DIR
from .models import SchemaInfo

SCHEMA_VERSION = "1"

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
        # Hier folgen später Migrationsschritte: if info.value == "1": ...


def get_session() -> Iterator[Session]:
    with Session(engine) as s:
        yield s
