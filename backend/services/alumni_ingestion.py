from sqlalchemy.orm import Session
import json

from ..models import Alumni
from .entity_matching import calculate_identity_score
from .eligibility import check_alumni_eligibility


def find_duplicate(alumni_data: dict, db: Session):
    """
    Compare a new alumni record against all existing records.
    Returns matches classified as 'Likely Same Person' or 'Needs Review'.
    """
    existing_alumni = db.query(Alumni).all()
    matches = []

    for existing in existing_alumni:
        existing_data = {
            "full_name": existing.full_name,
            "college": existing.college,
            "field_of_study": existing.field_of_study,
            "end_year": existing.end_year,
            "current_company": existing.current_company,
            "location": existing.location,
            "profile_url": existing.profile_url,
        }

        result = calculate_identity_score(alumni_data, existing_data)

        if result["classification"] in ["Likely Same Person", "Needs Review"]:
            matches.append({
                "alumni_id": existing.id,
                "full_name": existing.full_name,
                **result
            })

    return matches


def _save(alumni_data: dict, verification_status: str, db: Session) -> Alumni:
    """
    Save a cleaned alumni record to the database.
    """
    allowed_fields = {
        "full_name", "profile_url", "college", "degree",
        "field_of_study", "start_year", "end_year", "bio",
        "current_company", "current_title", "current_industry",
        "location", "past_companies", "past_titles",
        "skills", "projects", "certifications",
        "currently_studying", "is_alumni",
        "confidence_score", "source"
    }

    clean = {
        k: v for k, v in alumni_data.items()
        if k in allowed_fields and v is not None and v != ""
    }

    for field in ("past_companies", "past_titles"):
        if isinstance(clean.get(field), list):
            clean[field] = " | ".join(
                str(item).strip() for item in clean[field] if str(item).strip()
            ) or None

    for field in ("skills", "projects", "certifications"):
        value = clean.get(field)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                value = parsed if isinstance(parsed, list) else [value]
            except json.JSONDecodeError:
                value = [item.strip() for item in value.split("|") if item.strip()]
            clean[field] = value

    clean["verification_status"] = verification_status

    alumni = Alumni(**clean)
    db.add(alumni)
    db.commit()
    db.refresh(alumni)
    return alumni


def ingest_alumni(alumni_data: dict, db: Session):
    """
    Complete ingestion pipeline:

    Collector
        ↓
    Eligibility Check
        ↓
    Duplicate Detection
        ↓
    Database Save
    """

    # -----------------------------------------
    # 1. ELIGIBILITY CHECK
    # -----------------------------------------

    eligibility = check_alumni_eligibility(alumni_data)

    # Definitively not an alumnus (active student, future grad year)
    if eligibility["status"] == "Current Student":
        return {
            "status": "excluded",
            "reason": eligibility.get("reason"),
        }

    if eligibility["status"] == "Invalid":
        return {
            "status": "excluded",
            "reason": eligibility.get("reason"),
        }

    # -----------------------------------------
    # 2. DUPLICATE CHECK
    # (run for both Eligible Alumni and Needs Review records)
    # -----------------------------------------

    duplicates = find_duplicate(alumni_data, db)

    if duplicates:
        strongest = max(duplicates, key=lambda x: x["identity_score"])

        if strongest["classification"] == "Likely Same Person":
            return {
                "status": "duplicate",
                "match": strongest,
                "reason": f"Likely the same person as existing record #{strongest['alumni_id']} — {strongest['full_name']}.",
            }

    # -----------------------------------------
    # 3. SAVE TO DATABASE
    # -----------------------------------------

    if eligibility["eligible"]:
        # Fully eligible — save as Eligible Alumni
        # But if there are possible duplicates, flag for review
        if duplicates:
            alumni = _save(alumni_data, "Needs Review", db)
            return {
                "status": "needs_review",
                "alumni_id": alumni.id,
                "reason": "Possible duplicate — please verify.",
                "matches": duplicates,
            }

        alumni = _save(alumni_data, "Eligible Alumni", db)
        return {
            "status": "created",
            "alumni_id": alumni.id,
        }

    else:
        # Needs Review (missing grad year etc.) — save but flag for human review
        # This ensures we don't lose real alumni just because LinkedIn
        # didn't show their graduation year.
        alumni = _save(alumni_data, "Needs Review", db)
        return {
            "status": "needs_review",
            "alumni_id": alumni.id,
            "reason": eligibility.get("reason", "Record saved for manual review."),
        }