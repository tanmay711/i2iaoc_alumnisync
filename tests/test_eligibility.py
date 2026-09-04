from backend.services.eligibility import check_alumni_eligibility


def test_current_student_is_excluded():
    person = {
        "full_name": "Rahul Patil",
        "currently_studying": True,
        "end_year": 2027
    }

    result = check_alumni_eligibility(person)

    assert result["eligible"] is False
    assert result["status"] == "Current Student"


def test_graduated_student_is_eligible():
    person = {
        "full_name": "Aarav Sharma",
        "currently_studying": False,
        "end_year": 2025
    }

    result = check_alumni_eligibility(person)

    assert result["eligible"] is True
    assert result["status"] == "Eligible Alumni"


def test_missing_graduation_year_needs_review():
    person = {
        "full_name": "Priya Shah",
        "currently_studying": False
    }

    result = check_alumni_eligibility(person)

    assert result["eligible"] is False
    assert result["status"] == "Needs Review"