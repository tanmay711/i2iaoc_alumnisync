from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from datetime import datetime

from .database import Base


class Alumni(Base):
    __tablename__ = "alumni"

    id = Column(Integer, primary_key=True, index=True)

    # Identity
    full_name = Column(String(150), nullable=False, index=True)
    profile_url = Column(String(500), nullable=True)

    # Academic information
    college = Column(String(200), nullable=True)
    degree = Column(String(150), nullable=True)
    field_of_study = Column(String(150), nullable=True)
    start_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)

    # Career
    current_company = Column(String(200), nullable=True)
    current_title = Column(String(200), nullable=True)
    current_industry = Column(String(150), nullable=True)
    location = Column(String(150), nullable=True)

    # Career history
    past_companies = Column(Text, nullable=True)
    past_titles = Column(Text, nullable=True)

    # Alumni eligibility
    currently_studying = Column(Boolean, default=False)
    is_alumni = Column(Boolean, default=True)

    # Verification
    verification_status = Column(
        String(50),
        default="Needs Review"
    )

    confidence_score = Column(
        Float,
        default=0.0
    )

    # Source and timestamps
    source = Column(String(100), nullable=True)

    scraped_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )