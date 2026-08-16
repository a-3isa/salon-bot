import os

os.environ.setdefault("BOT_TOKEN", "test")
os.environ.setdefault("SHEET_ID", "test")
os.environ.setdefault("GOOGLE_CREDENTIALS_JSON", "test.json")
os.environ.setdefault("ADMIN_IDS", "")

from handlers import check_booking


def test_reservation_detail_text_uses_salon_fields():
    text = check_booking._reservation_detail_text(
        "en",
        {
            "booking_ref": "BK-000001",
            "service_name": "Haircut",
            "barber_name": "Omar",
            "time_preference": "Day: 10 AM - 6 PM",
            "customer_name": "Ahmed",
            "phone": "+201000000000",
        },
        host_phone="+201111111111",
    )

    assert "Service: Haircut" in text
    assert "Barber: Omar" in text
    assert "Preferred time: Day: 10 AM - 6 PM" in text
    assert "Room" not in text
    assert "Check-in" not in text
