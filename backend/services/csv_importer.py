import pandas as pd

from .eligibility import check_alumni_eligibility
from .entity_matching import calculate_identity_score


def load_alumni_csv(file_path: str):
    """
    Load alumni records from a CSV file.
    """

    df = pd.read_csv(file_path)

    records = df.to_dict(orient="records")

    return records


def find_duplicates(records, threshold=80):
    """
    Find possible duplicate alumni within a collection.

    Important:
    Name alone is never treated as sufficient evidence.
    """

    duplicates = []
    checked_pairs = set()

    for i in range(len(records)):
        for j in range(i + 1, len(records)):

            person1 = records[i]
            person2 = records[j]

            result = calculate_identity_score(
                person1,
                person2
            )

            if result["identity_score"] >= threshold:

                duplicates.append({
                    "record_1": i,
                    "record_2": j,
                    "person_1": person1.get("full_name"),
                    "person_2": person2.get("full_name"),
                    "identity_score": result["identity_score"],
                    "classification": result["classification"],
                    "matched_fields": result["matched_fields"],
                    "different_fields": result["different_fields"]
                })

                checked_pairs.add((i, j))

    return duplicates


def process_alumni_records(records):
    """
    Process collected alumni records.

    Pipeline:

    1. Check eligibility
    2. Exclude current students
    3. Send uncertain records to review
    4. Detect possible duplicates
    """

    eligible = []
    excluded = []
    review = []

    for record in records:

        result = check_alumni_eligibility(record)

        if result["eligible"]:
            # "Eligible Alumni" — passed all checks
            eligible.append(record)

        elif result["status"] in ("Current Student", "Invalid"):
            # Definitively not alumni
            excluded.append(record)

        else:
            # "Needs Review" — missing data or uncertain
            review.append(record)

    # Only compare records that passed eligibility.
    duplicates = find_duplicates(eligible)

    return {
        "eligible": eligible,
        "excluded": excluded,
        "needs_review": review,
        "duplicates": duplicates,
        "total": len(records),
        "eligible_count": len(eligible),
        "excluded_count": len(excluded),
        "review_count": len(review),
        "duplicate_count": len(duplicates)
    }