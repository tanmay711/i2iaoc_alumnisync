from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional, Union
from datetime import datetime


# ---------------------------------------------------------------------------
# Request schemas (input)
# ---------------------------------------------------------------------------

class AlumniCreate(BaseModel):
    """Schema for creating or ingesting a new alumni record."""

    # Identity
    full_name: str = Field(..., min_length=1, max_length=150)
    profile_url: Optional[str] = Field(None, max_length=500)

    # Academic
    college: Optional[str] = Field(None, max_length=200)
    degree: Optional[str] = Field(None, max_length=150)
    field_of_study: Optional[str] = Field(None, max_length=150)
    start_year: Optional[int] = Field(None, ge=1900, le=2100)
    end_year: Optional[int] = Field(None, ge=1900, le=2100)
    bio: Optional[str] = Field(None, max_length=5000)

    # Career
    current_company: Optional[str] = Field(None, max_length=200)
    current_title: Optional[str] = Field(None, max_length=200)
    current_industry: Optional[str] = Field(None, max_length=150)
    location: Optional[str] = Field(None, max_length=150)

    # Career history (stored as pipe-separated strings)
    past_companies: Optional[Union[str, List[str]]] = None
    past_titles: Optional[Union[str, List[str]]] = None
    skills: Optional[List[str]] = None
    projects: Optional[List[str]] = None
    certifications: Optional[List[str]] = None

    # Status flags
    currently_studying: bool = False
    is_alumni: bool = True

    # Source
    source: Optional[str] = Field(None, max_length=100)
    confidence_score: float = Field(0.0, ge=0.0, le=100.0)

    model_config = {"from_attributes": True}


class AlumniUpdate(BaseModel):
    """Schema for updating an existing alumni record (all fields optional)."""

    full_name: Optional[str] = Field(None, min_length=1, max_length=150)
    profile_url: Optional[str] = Field(None, max_length=500)
    college: Optional[str] = Field(None, max_length=200)
    degree: Optional[str] = Field(None, max_length=150)
    field_of_study: Optional[str] = Field(None, max_length=150)
    start_year: Optional[int] = Field(None, ge=1900, le=2100)
    end_year: Optional[int] = Field(None, ge=1900, le=2100)
    bio: Optional[str] = Field(None, max_length=5000)
    current_company: Optional[str] = Field(None, max_length=200)
    current_title: Optional[str] = Field(None, max_length=200)
    current_industry: Optional[str] = Field(None, max_length=150)
    location: Optional[str] = Field(None, max_length=150)
    past_companies: Optional[Union[str, List[str]]] = None
    past_titles: Optional[Union[str, List[str]]] = None
    skills: Optional[List[str]] = None
    projects: Optional[List[str]] = None
    certifications: Optional[List[str]] = None
    currently_studying: Optional[bool] = None
    is_alumni: Optional[bool] = None
    verification_status: Optional[str] = Field(None, max_length=50)
    confidence_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    source: Optional[str] = Field(None, max_length=100)

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Response schemas (output)
# ---------------------------------------------------------------------------

class AlumniResponse(BaseModel):
    """Full alumni record returned by the API."""

    id: int
    full_name: str
    profile_url: Optional[str] = None
    college: Optional[str] = None
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    bio: Optional[str] = None
    current_company: Optional[str] = None
    current_title: Optional[str] = None
    current_industry: Optional[str] = None
    location: Optional[str] = None
    past_companies: Optional[str] = None
    past_titles: Optional[str] = None
    skills: Optional[List[str]] = None
    projects: Optional[List[str]] = None
    certifications: Optional[List[str]] = None
    currently_studying: bool
    is_alumni: bool
    verification_status: Optional[str] = None
    confidence_score: float
    source: Optional[str] = None
    scraped_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class IngestResponse(BaseModel):
    """Response from the /alumni/ingest endpoint."""

    status: str              # "created" | "duplicate" | "needs_review" | "excluded"
    alumni_id: Optional[int] = None
    reason: Optional[str] = None
    match: Optional[dict] = None
    matches: Optional[list] = None


class PaginatedAlumniResponse(BaseModel):
    """Paginated list of alumni."""

    total: int
    skip: int
    limit: int
    results: list[AlumniResponse]
