from datetime import datetime


def check_alumni_eligibility(data: dict) -> dict:
    """
    Determine whether a person should be included in the alumni database.
    """

    currently_studying = data.get("currently_studying", False)
    end_year = data.get("end_year")

    current_year = datetime.now().year

    # Rule 1: Currently studying students are NOT alumni
    if currently_studying:
        return {
            "eligible": False,
            "status": "Current Student",
            "reason": "Person is currently studying and should not be included as alumni."
        }

    # Rule 2: No graduation year
    if not end_year:
        return {
            "eligible": False,
            "status": "Needs Review",
            "reason": "Graduation year is missing."
        }

    # Rule 3: Graduation year cannot be in the future
    if end_year > current_year:
        return {
            "eligible": False,
            "status": "Invalid",
            "reason": "Graduation year is in the future."
        }

    # Eligible alumni
    return {
        "eligible": True,
        "status": "Eligible Alumni",
        "reason": "Person has completed their academic period and is not currently studying."
    }