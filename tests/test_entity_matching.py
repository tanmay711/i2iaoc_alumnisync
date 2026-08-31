from backend.services.entity_matching import calculate_identity_score


def test_same_name_different_people():
    person1 = {
        "full_name": "Rahul Patil",
        "college": "VIT Pune",
        "field_of_study": "Artificial Intelligence and Data Science",
        "end_year": 2025,
        "current_company": "Google",
        "location": "Bangalore"
    }

    person2 = {
        "full_name": "Rahul Patil",
        "college": "VIT Pune",
        "field_of_study": "Mechanical Engineering",
        "end_year": 2024,
        "current_company": "Tata Motors",
        "location": "Pune"
    }

    result = calculate_identity_score(person1, person2)

    assert result["classification"] == "Likely Different People"


def test_same_person():
    person1 = {
        "full_name": "Aarav Sharma",
        "college": "VIT Pune",
        "field_of_study": "Computer Engineering",
        "end_year": 2025,
        "current_company": "Microsoft",
        "location": "Bangalore",
        "profile_url": "https://example.com/aarav"
    }

    person2 = {
        "full_name": "Aarav Sharma",
        "college": "VIT Pune",
        "field_of_study": "Computer Engineering",
        "end_year": 2025,
        "current_company": "Microsoft",
        "location": "Bangalore",
        "profile_url": "https://example.com/aarav"
    }

    result = calculate_identity_score(person1, person2)

    assert result["classification"] == "Likely Same Person"
    assert result["identity_score"] >= 80


def test_name_alone_is_not_duplicate():
    person1 = {
        "full_name": "Priya Shah"
    }

    person2 = {
        "full_name": "Priya Shah"
    }

    result = calculate_identity_score(person1, person2)

    assert result["classification"] != "Likely Same Person"