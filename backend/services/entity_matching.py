from rapidfuzz import fuzz


def normalize(value):
    """Normalize text for comparison."""
    if not value:
        return ""

    value = str(value).strip().lower()

    # Remove common punctuation
    for char in [".", ",", "-", "_"]:
        value = value.replace(char, " ")

    # Remove extra spaces
    return " ".join(value.split())


def text_similarity(value1, value2):
    """
    Calculate similarity between two text values.
    Returns a value between 0 and 100.
    """

    value1 = normalize(value1)
    value2 = normalize(value2)

    if not value1 or not value2:
        return 0

    return fuzz.token_set_ratio(value1, value2)


def compare_field(value1, value2):
    """Return 1 if both values match exactly."""
    if not value1 or not value2:
        return 0

    return 1 if normalize(value1) == normalize(value2) else 0


def calculate_identity_score(person1: dict, person2: dict) -> dict:
    """
    Compare two alumni records.

    Name is an important identity signal,
    but name alone is never enough.
    """

    score = 0
    matched_fields = []
    different_fields = []

    # -----------------------------------------
    # NAME
    # -----------------------------------------

    name_similarity = text_similarity(
        person1.get("full_name"),
        person2.get("full_name")
    )

    if name_similarity >= 90:
        score += 10
        matched_fields.append("full_name")

    elif name_similarity >= 70:
        score += 5
        matched_fields.append("full_name_partial")

    else:
        different_fields.append("full_name")

    # -----------------------------------------
    # COLLEGE
    # -----------------------------------------

    college_similarity = text_similarity(
        person1.get("college"),
        person2.get("college")
    )

    if college_similarity >= 90:
        score += 20
        matched_fields.append("college")

    elif college_similarity >= 70:
        score += 10
        matched_fields.append("college_partial")

    else:
        different_fields.append("college")

    # -----------------------------------------
    # FIELD OF STUDY
    # -----------------------------------------

    field_similarity = text_similarity(
        person1.get("field_of_study"),
        person2.get("field_of_study")
    )

    if field_similarity >= 90:
        score += 15
        matched_fields.append("field_of_study")

    elif field_similarity >= 70:
        score += 7
        matched_fields.append("field_of_study_partial")

    else:
        different_fields.append("field_of_study")

    # -----------------------------------------
    # GRADUATION YEAR
    # -----------------------------------------

    if person1.get("end_year") and person2.get("end_year"):

        if person1["end_year"] == person2["end_year"]:
            score += 20
            matched_fields.append("end_year")

        else:
            different_fields.append("end_year")

    # -----------------------------------------
    # CURRENT COMPANY
    # -----------------------------------------

    company_similarity = text_similarity(
        person1.get("current_company"),
        person2.get("current_company")
    )

    if company_similarity >= 90:
        score += 15
        matched_fields.append("current_company")

    elif company_similarity >= 70:
        score += 7
        matched_fields.append("current_company_partial")

    else:
        different_fields.append("current_company")

    # -----------------------------------------
    # LOCATION
    # -----------------------------------------

    location_similarity = text_similarity(
        person1.get("location"),
        person2.get("location")
    )

    if location_similarity >= 90:
        score += 5
        matched_fields.append("location")

    elif location_similarity >= 70:
        score += 2
        matched_fields.append("location_partial")

    else:
        different_fields.append("location")

    # -----------------------------------------
    # PROFILE URL
    # -----------------------------------------

    if compare_field(
        person1.get("profile_url"),
        person2.get("profile_url")
    ):
        score += 15
        matched_fields.append("profile_url")

    else:
        different_fields.append("profile_url")

    # -----------------------------------------
    # FINAL CLASSIFICATION
    # -----------------------------------------

    # Completely different names should not
    # become the same person.
    if name_similarity < 70:

        classification = "Likely Different People"

    elif score >= 80:

        classification = "Likely Same Person"

    elif score >= 50:

        classification = "Needs Review"

    else:

        classification = "Likely Different People"

    return {
        "identity_score": score,
        "name_similarity": round(name_similarity, 2),
        "classification": classification,
        "matched_fields": matched_fields,
        "different_fields": different_fields
    }