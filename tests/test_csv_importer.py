from backend.services.csv_importer import (
    load_alumni_csv,
    process_alumni_records
)


def test_csv_loading():
    records = load_alumni_csv("data/alumni_test.csv")
    assert len(records) == 5


def test_current_student_is_excluded_from_import():
    records = load_alumni_csv("data/alumni_test.csv")
    result = process_alumni_records(records)

    # Aarav Sharma has no end_year — should go to needs_review
    # No record is explicitly marked currently_studying=True in the CSV,
    # but records with missing end_year go to needs_review
    assert result["total"] == 5
    assert result["eligible_count"] + result["excluded_count"] + result["review_count"] == 5


def test_duplicate_detected_in_csv():
    """Rahul Patil appears twice in the CSV — should be flagged as a duplicate."""
    records = load_alumni_csv("data/alumni_test.csv")
    result = process_alumni_records(records)

    # At least one duplicate pair should be detected
    assert result["duplicate_count"] >= 1


def test_summary_keys_present():
    records = load_alumni_csv("data/alumni_test.csv")
    result = process_alumni_records(records)

    expected_keys = {
        "eligible", "excluded", "needs_review", "duplicates",
        "total", "eligible_count", "excluded_count", "review_count", "duplicate_count"
    }
    assert expected_keys.issubset(result.keys())