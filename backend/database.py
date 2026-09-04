from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./alumnisync.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def ensure_schema():
    """Add enrichment columns to an existing development database."""
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("alumni")}
    additions = {
        "bio": "TEXT",
        "skills": "JSON",
        "projects": "JSON",
        "certifications": "JSON",
    }
    with engine.begin() as connection:
        for name, sql_type in additions.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE alumni ADD COLUMN {name} {sql_type}"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()