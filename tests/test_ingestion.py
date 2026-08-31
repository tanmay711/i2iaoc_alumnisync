"""
Tests for the alumni ingestion pipeline.
"""
from unittest.mock import MagicMock
from backend.services.alumni_ingestion import ingest_alumni


def make_db(existing_alumni=None):
    """Create a mock database session."""
    db = MagicMock()
    mock_query = MagicMock()
    mock_query.all.return_value = existing_alumni or []
    db.query.return_value = mock_query

    # Mock the add/commit/refresh cycle
    saved_obj = None

    def fake_add(obj):
        nonlocal saved_obj
        saved_obj = obj
        obj.id = 42  # Simulate auto-increment ID

    db.add.side_effect = fake_add
    db.commit.return_value = None
    db.refresh.return_value = None

    return db


# ---------------------------------------------------------------------------
# Eligibility tests (via ingestion pipeline)
# ---------------------------------------------------------------------------

def test_current_student_is_excluded():
    db = make_db()
    result = ingest_alumni({
        "full_name": "Aarav Sharma",
        "currently_studying": True,
        "end_year": 2027
    }, db)
    assert result["status"] == "excluded"


def test_missing_graduation_year_needs_review():
    db = make_db()
    result = ingest_alumni({
        "full_name": "Priya Shah",
        "currently_studying": False,
        # No end_year
    }, db)
    assert result["status"] == "needs_review"


def test_future_graduation_year_needs_review():
    db = make_db()
    result = ingest_alumni({
        "full_name": "Future Student",
        "currently_studying": False,
        "end_year": 2099
    }, db)
    assert result["status"] in ("excluded", "needs_review")


# ---------------------------------------------------------------------------
# Duplicate detection tests
# ---------------------------------------------------------------------------

def test_new_alumni_is_created():
    db = make_db(existing_alumni=[])
    result = ingest_alumni({
        "full_name": "Rahul Patil",
        "college": "VIT Pune",
        "field_of_study": "Computer Engineering",
        "end_year": 2025,
        "current_company": "Google",
        "location": "Bangalore",
        "currently_studying": False,
    }, db)
    assert result["status"] == "created"
    assert "alumni_id" in result


def test_exact_duplicate_is_detected():
    """An existing alumni that matches all fields should be flagged as duplicate."""
    existing = MagicMock()
    existing.id = 1
    existing.full_name = "Rahul Patil"
    existing.college = "VIT Pune"
    existing.field_of_study = "Computer Engineering"
    existing.end_year = 2025
    existing.current_company = "Google"
    existing.location = "Bangalore"
    existing.profile_url = "https://linkedin.com/in/rahul"

    db = make_db(existing_alumni=[existing])

    result = ingest_alumni({
        "full_name": "Rahul Patil",
        "college": "VIT Pune",
        "field_of_study": "Computer Engineering",
        "end_year": 2025,
        "current_company": "Google",
        "location": "Bangalore",
        "profile_url": "https://linkedin.com/in/rahul",
        "currently_studying": False,
    }, db)

    assert result["status"] in ("duplicate", "needs_review")


def test_different_person_same_name_is_created():
    """Same name but different college + year + company → should NOT be a duplicate."""
    existing = MagicMock()
    existing.id = 1
    existing.full_name = "Rahul Patil"
    existing.college = "MIT"
    existing.field_of_study = "Mechanical Engineering"
    existing.end_year = 2020
    existing.current_company = "Tata Motors"
    existing.location = "Mumbai"
    existing.profile_url = "https://linkedin.com/in/rahul-mit"

    db = make_db(existing_alumni=[existing])

    result = ingest_alumni({
        "full_name": "Rahul Patil",
        "college": "VIT Pune",
        "field_of_study": "Computer Engineering",
        "end_year": 2025,
        "current_company": "Google",
        "location": "Bangalore",
        "currently_studying": False,
    }, db)

    assert result["status"] == "created"
