"""SQLAlchemy database setup and session management."""

import logging
from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},  # Required for SQLite
    echo=False,
)


# Enable WAL mode and foreign keys for SQLite
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA foreign_keys=ON;")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_missing_columns(bind) -> None:
    """Tiny forward-only migration: add columns that older DBs don't have.

    ``create_all`` never alters existing tables, so databases created by an
    earlier version of the app would otherwise crash on the new columns.
    """
    insp = inspect(bind)
    with bind.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                col_type = column.type.compile(dialect=bind.dialect)
                default = ""
                if column.default is not None and getattr(column.default, "is_scalar", False):
                    value = column.default.arg
                    if isinstance(value, bool):
                        value = int(value)
                    default = f" DEFAULT {value!r}" if not isinstance(value, str) else f" DEFAULT '{value}'"
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}{default}'))
                logger.info("Migrated: added column %s.%s", table.name, column.name)


def init_db(bind=None) -> None:
    """Create all database tables (and add any newly introduced columns)."""
    from app import models  # noqa: F401 — ensures models are registered

    bind = bind or engine
    Base.metadata.create_all(bind=bind)
    _add_missing_columns(bind)
    logger.info("Database ready.")
