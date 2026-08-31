import io
import csv

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import Alumni
from ..schemas import AlumniCreate, AlumniUpdate, AlumniResponse, PaginatedAlumniResponse
from ..services.eligibility import check_alumni_eligibility
from ..services.entity_matching import calculate_identity_score
from ..services.alumni_ingestion import ingest_alumni


router = APIRouter(
    prefix="/alumni",
    tags=["Alumni"]
)


# ---------------------------------------------------------------------------
# LIST — GET /alumni/
# ---------------------------------------------------------------------------

@router.get("/", response_model=PaginatedAlumniResponse)
def list_alumni(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=500, description="Max records to return"),
    q: str = Query(None, description="Search by name, college, company, or location"),
    db: Session = Depends(get_db)
):
    """
    List alumni with optional full-text search and pagination.
    """
    query = db.query(Alumni)

    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                Alumni.full_name.ilike(search),
                Alumni.college.ilike(search),
                Alumni.current_company.ilike(search),
                Alumni.location.ilike(search),
                Alumni.field_of_study.ilike(search),
                Alumni.current_title.ilike(search),
            )
        )

    total = query.count()
    results = query.offset(skip).limit(limit).all()

    return PaginatedAlumniResponse(
        total=total,
        skip=skip,
        limit=limit,
        results=results
    )


# ---------------------------------------------------------------------------
# EXPORT — GET /alumni/export
# Must be defined BEFORE /{alumni_id} to avoid route conflict
# ---------------------------------------------------------------------------

@router.get("/export")
def export_alumni(
    q: str = Query(None, description="Optional search filter"),
    db: Session = Depends(get_db)
):
    """
    Download all alumni (or filtered results) as a CSV file.
    """
    query = db.query(Alumni)

    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                Alumni.full_name.ilike(search),
                Alumni.college.ilike(search),
                Alumni.current_company.ilike(search),
                Alumni.location.ilike(search),
            )
        )

    alumni_list = query.all()

    # Build CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "id", "full_name", "college", "degree", "field_of_study",
        "start_year", "end_year", "current_company", "current_title",
        "current_industry", "location", "profile_url",
        "verification_status", "confidence_score", "source", "scraped_at"
    ])

    for a in alumni_list:
        writer.writerow([
            a.id, a.full_name, a.college, a.degree, a.field_of_study,
            a.start_year, a.end_year, a.current_company, a.current_title,
            a.current_industry, a.location, a.profile_url,
            a.verification_status, a.confidence_score, a.source, a.scraped_at
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=alumni_export.csv"}
    )


# ---------------------------------------------------------------------------
# IMPORT CSV — POST /alumni/import-csv
# ---------------------------------------------------------------------------

@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a CSV file and run each row through the full ingestion pipeline.
    Returns a summary of created, duplicate, needs_review, and excluded records.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted.")

    content = await file.read()
    decoded = content.decode("utf-8-sig")  # handles BOM from Excel

    reader = csv.DictReader(io.StringIO(decoded))

    results = {
        "created": [],
        "duplicate": [],
        "needs_review": [],
        "excluded": [],
        "errors": []
    }

    for i, row in enumerate(reader, start=1):
        # Convert empty strings to None and integer fields
        cleaned = {}
        for k, v in row.items():
            if v == "" or v is None:
                cleaned[k] = None
            else:
                cleaned[k] = v

        # Coerce numeric fields
        for int_field in ["start_year", "end_year"]:
            if cleaned.get(int_field):
                try:
                    cleaned[int_field] = int(cleaned[int_field])
                except ValueError:
                    cleaned[int_field] = None

        # Coerce boolean fields
        for bool_field in ["currently_studying", "is_alumni"]:
            if cleaned.get(bool_field):
                cleaned[bool_field] = str(cleaned[bool_field]).lower() in ("true", "1", "yes")
            else:
                cleaned[bool_field] = False

        if not cleaned.get("full_name"):
            results["errors"].append({"row": i, "error": "Missing full_name"})
            continue

        try:
            result = ingest_alumni(cleaned, db)
            status = result.get("status", "unknown")
            results.setdefault(status, []).append({
                "row": i,
                "full_name": cleaned.get("full_name"),
                **result
            })
        except Exception as e:
            results["errors"].append({"row": i, "full_name": cleaned.get("full_name"), "error": str(e)})

    return {
        "filename": file.filename,
        "summary": {
            "created": len(results.get("created", [])),
            "duplicate": len(results.get("duplicate", [])),
            "needs_review": len(results.get("needs_review", [])),
            "excluded": len(results.get("excluded", [])),
            "errors": len(results.get("errors", []))
        },
        "details": results
    }


# ---------------------------------------------------------------------------
# INGEST — POST /alumni/ingest
# Full LinkedIn ingestion pipeline
# ---------------------------------------------------------------------------

@router.post("/ingest")
def ingest_alumni_record(
    alumni_data: AlumniCreate,
    db: Session = Depends(get_db)
):
    """
    Run the complete alumni ingestion pipeline:
    Eligibility → Duplicate Detection → Save.

    Designed to be called by the browser extension.
    """
    return ingest_alumni(alumni_data.model_dump(exclude_none=True), db)


# ---------------------------------------------------------------------------
# CHECK DUPLICATE — POST /alumni/check-duplicate
# ---------------------------------------------------------------------------

@router.post("/check-duplicate")
def check_duplicate(
    alumni_data: AlumniCreate,
    db: Session = Depends(get_db)
):
    """
    Check whether a new alumni record matches an existing person.
    Does NOT save anything.
    """
    existing_alumni = db.query(Alumni).all()
    data = alumni_data.model_dump(exclude_none=True)

    matches = []

    for existing in existing_alumni:
        existing_data = {
            "full_name": existing.full_name,
            "profile_url": existing.profile_url,
            "college": existing.college,
            "degree": existing.degree,
            "field_of_study": existing.field_of_study,
            "start_year": existing.start_year,
            "end_year": existing.end_year,
            "current_company": existing.current_company,
            "current_title": existing.current_title,
            "current_industry": existing.current_industry,
            "location": existing.location
        }

        result = calculate_identity_score(data, existing_data)

        if result["identity_score"] >= 50:
            matches.append({
                "alumni_id": existing.id,
                "full_name": existing.full_name,
                "identity_score": result["identity_score"],
                "classification": result["classification"],
                "matched_fields": result["matched_fields"],
                "different_fields": result["different_fields"]
            })

    matches.sort(key=lambda x: x["identity_score"], reverse=True)

    return {
        "duplicate_found": any(
            m["classification"] == "Likely Same Person" for m in matches
        ),
        "matches_found": len(matches),
        "matches": matches
    }


# ---------------------------------------------------------------------------
# CREATE — POST /alumni/
# ---------------------------------------------------------------------------

@router.post("/", response_model=dict)
def create_alumni(
    alumni_data: AlumniCreate,
    db: Session = Depends(get_db)
):
    """
    Manually create an alumni record.
    Runs eligibility check before saving.
    """
    data = alumni_data.model_dump(exclude_none=True)
    eligibility = check_alumni_eligibility(data)

    if not eligibility["eligible"]:
        return {
            "saved": False,
            "eligibility": eligibility,
            "message": "Record was not added to the alumni database."
        }

    alumni = Alumni(**data)
    db.add(alumni)
    db.commit()
    db.refresh(alumni)

    return {
        "saved": True,
        "eligibility": eligibility,
        "alumni_id": alumni.id
    }


# ---------------------------------------------------------------------------
# GET BY ID — GET /alumni/{alumni_id}
# ---------------------------------------------------------------------------

@router.get("/{alumni_id}", response_model=AlumniResponse)
def get_alumni_by_id(
    alumni_id: int,
    db: Session = Depends(get_db)
):
    alumni = db.query(Alumni).filter(Alumni.id == alumni_id).first()

    if not alumni:
        raise HTTPException(status_code=404, detail="Alumni not found")

    return alumni


# ---------------------------------------------------------------------------
# UPDATE — PUT /alumni/{alumni_id}
# ---------------------------------------------------------------------------

@router.put("/{alumni_id}", response_model=AlumniResponse)
def update_alumni(
    alumni_id: int,
    updates: AlumniUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an existing alumni record. Only provided fields are updated.
    """
    alumni = db.query(Alumni).filter(Alumni.id == alumni_id).first()

    if not alumni:
        raise HTTPException(status_code=404, detail="Alumni not found")

    update_data = updates.model_dump(exclude_none=True)

    for field, value in update_data.items():
        setattr(alumni, field, value)

    db.commit()
    db.refresh(alumni)

    return alumni


# ---------------------------------------------------------------------------
# DELETE — DELETE /alumni/{alumni_id}
# ---------------------------------------------------------------------------

@router.delete("/{alumni_id}")
def delete_alumni(
    alumni_id: int,
    db: Session = Depends(get_db)
):
    alumni = db.query(Alumni).filter(Alumni.id == alumni_id).first()

    if not alumni:
        raise HTTPException(status_code=404, detail="Alumni not found")

    db.delete(alumni)
    db.commit()

    return {"deleted": True, "alumni_id": alumni_id}