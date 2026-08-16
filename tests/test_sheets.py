import os
os.environ.setdefault("BOT_TOKEN", "test")
os.environ.setdefault("SHEET_ID", "test")
os.environ.setdefault("GOOGLE_CREDENTIALS_JSON", "test.json")
os.environ.setdefault("ADMIN_IDS", "")

import pytest
from unittest.mock import MagicMock, patch
import sheets


def _make_ws(records=None, row_values_1=None):
    ws = MagicMock()
    if records is not None:
        ws.get_all_records.return_value = records
    if row_values_1 is not None:
        ws.row_values.return_value = row_values_1
    return ws


@pytest.fixture(autouse=True)
def clear_sheets_cache():
    sheets._cache.clear()
    sheets._cache_ts.clear()


@patch("sheets._worksheet")
def test_get_config_returns_key_value_dict(mock_ws):
    mock_ws.return_value = _make_ws(records=[
        {"key": "host_phone", "value": "+20100"},
        {"key": "booking_counter", "value": "5"},
    ])
    result = sheets.get_config()
    assert result["host_phone"] == "+20100"
    assert result["booking_counter"] == "5"
    mock_ws.assert_called_once_with("Config")


@patch("sheets._worksheet")
def test_get_available_services_filters_available_rows(mock_ws):
    mock_ws.return_value = _make_ws(records=[
        {"service_id": "SV001", "name": "Haircut", "is_available": "TRUE"},
        {"service_id": "SV002", "name": "Hair Coloring", "is_available": "FALSE"},
    ])

    result = sheets.get_available_services()

    assert result == [{"service_id": "SV001", "name": "Haircut", "is_available": "TRUE"}]
    mock_ws.assert_called_once_with("Services")


@patch("sheets._worksheet")
def test_get_service_returns_matching_service(mock_ws):
    mock_ws.return_value = _make_ws(records=[
        {"service_id": "SV001", "name": "Haircut", "is_available": "TRUE"},
    ])

    result = sheets.get_service("SV001")

    assert result["name"] == "Haircut"


@patch("sheets._worksheet")
def test_get_service_returns_none_when_missing(mock_ws):
    mock_ws.return_value = _make_ws(records=[])

    assert sheets.get_service("SV999") is None


@patch("sheets._worksheet")
def test_get_available_barbers_filters_available_rows(mock_ws):
    mock_ws.return_value = _make_ws(records=[
        {"barber_id": "BR001", "name": "Omar", "is_available": "TRUE"},
        {"barber_id": "BR002", "name": "Mohamed", "is_available": "FALSE"},
    ])

    result = sheets.get_available_barbers()

    assert result == [{"barber_id": "BR001", "name": "Omar", "is_available": "TRUE"}]
    mock_ws.assert_called_once_with("Barbers")


@patch("sheets._worksheet")
def test_get_barber_returns_matching_barber(mock_ws):
    mock_ws.return_value = _make_ws(records=[
        {"barber_id": "BR001", "name": "Omar", "is_available": "TRUE"},
    ])

    result = sheets.get_barber("BR001")

    assert result["name"] == "Omar"


@patch("sheets._worksheet")
def test_get_barber_returns_none_when_missing(mock_ws):
    mock_ws.return_value = _make_ws(records=[])

    assert sheets.get_barber("BR999") is None


@patch("sheets._worksheet")
def test_increment_booking_counter(mock_ws):
    ws = MagicMock()
    ws.find.return_value = MagicMock(row=4)
    ws.row_values.return_value = ["key", "value"]
    ws.cell.return_value = MagicMock(value="5")
    mock_ws.return_value = ws
    result = sheets.increment_booking_counter()
    assert result == 6
    ws.update_cell.assert_called_once_with(4, 2, 6)


@patch("sheets._worksheet")
def test_append_reservation_uses_reservations_header_order(mock_ws):
    ws = MagicMock()
    ws.row_values.return_value = [
        "booking_ref", "service_name", "barber_name", "time_preference",
        "customer_name", "phone", "created_at",
    ]
    mock_ws.return_value = ws

    sheets.append_reservation({
        "booking_ref": "BK-000001",
        "service_name": "Haircut",
        "barber_name": "Omar",
        "time_preference": "Day: 10 AM - 6 PM",
        "customer_name": "Ahmed",
        "phone": "+201000000000",
        "created_at": "2026-06-09",
    })

    ws.append_row.assert_called_once_with([
        "BK-000001", "Haircut", "Omar", "Day: 10 AM - 6 PM",
        "Ahmed", "+201000000000", "2026-06-09",
    ])


@patch("sheets._worksheet")
def test_get_reservation_by_ref_found(mock_ws):
    mock_ws.return_value = _make_ws(records=[
        {"booking_ref": "BK-000001", "customer_name": "Ahmed"},
        {"booking_ref": "BK-000002", "customer_name": "Omar"},
    ])

    result = sheets.get_reservation_by_ref("BK-000001")

    assert result["customer_name"] == "Ahmed"
    mock_ws.assert_called_once_with("Reservations")


@patch("sheets._worksheet")
def test_get_reservation_by_ref_not_found(mock_ws):
    mock_ws.return_value = _make_ws(records=[])

    assert sheets.get_reservation_by_ref("BK-000099") is None


@patch("sheets._worksheet")
def test_sort_reservations_places_day_before_night_and_oldest_first(mock_ws):
    ws = MagicMock()
    ws.row_values.return_value = [
        "booking_ref", "service_name", "barber_name", "time_preference",
        "customer_name", "phone", "created_at",
    ]
    ws.get_all_records.return_value = [
        {
            "booking_ref": "BK-000003", "service_name": "Haircut",
            "barber_name": "Omar", "time_preference": "Night: 6 PM - 12 AM",
            "customer_name": "Night Old", "phone": "1", "created_at": "2026-06-08",
        },
        {
            "booking_ref": "BK-000004", "service_name": "Black Mask",
            "barber_name": "Mohamed", "time_preference": "Night: 6 PM - 12 AM",
            "customer_name": "Night New", "phone": "4", "created_at": "2026-06-09",
        },
        {
            "booking_ref": "BK-000002", "service_name": "Beard Trim",
            "barber_name": "Mohamed", "time_preference": "Day: 10 AM - 6 PM",
            "customer_name": "Day New", "phone": "2", "created_at": "2026-06-09",
        },
        {
            "booking_ref": "BK-000001", "service_name": "Hair Wash",
            "barber_name": "Omar", "time_preference": "Day: 10 AM - 6 PM",
            "customer_name": "Day Old", "phone": "3", "created_at": "2026-06-07",
        },
    ]
    mock_ws.return_value = ws

    sheets.sort_reservations()

    ws.update.assert_called_once_with("A2:G5", [
        ["BK-000001", "Hair Wash", "Omar", "Day: 10 AM - 6 PM", "Day Old", "3", "2026-06-07"],
        ["BK-000002", "Beard Trim", "Mohamed", "Day: 10 AM - 6 PM", "Day New", "2", "2026-06-09"],
        ["BK-000003", "Haircut", "Omar", "Night: 6 PM - 12 AM", "Night Old", "1", "2026-06-08"],
        ["BK-000004", "Black Mask", "Mohamed", "Night: 6 PM - 12 AM", "Night New", "4", "2026-06-09"],
    ])


@patch("sheets._worksheet")
def test_increment_booking_counter_raises_if_key_missing(mock_ws):
    ws = MagicMock()
    ws.find.return_value = None
    mock_ws.return_value = ws
    with pytest.raises(ValueError, match="booking_counter"):
        sheets.increment_booking_counter()


@patch("sheets._worksheet")
def test_set_service_availability_updates_is_available_column(mock_ws):
    ws = MagicMock()
    ws.find.return_value = MagicMock(row=2)
    ws.row_values.return_value = ["service_id", "name", "is_available"]
    mock_ws.return_value = ws

    sheets.set_service_availability("SV001", False)

    ws.update_cell.assert_called_once_with(2, 3, "FALSE")


@patch("sheets._worksheet")
def test_add_service_generates_next_service_id(mock_ws):
    ws = MagicMock()
    ws.get_all_records.return_value = [{"service_id": "SV003", "name": "Haircut", "is_available": "TRUE"}]
    ws.row_values.return_value = ["service_id", "name", "is_available"]
    mock_ws.return_value = ws

    service_id = sheets.add_service("Skin Cleaning")

    assert service_id == "SV004"
    ws.append_row.assert_called_once_with(["SV004", "Skin Cleaning", "TRUE"])


@patch("sheets._worksheet")
def test_remove_service_deletes_matching_row(mock_ws):
    ws = MagicMock()
    ws.find.return_value = MagicMock(row=5)
    mock_ws.return_value = ws

    sheets.remove_service("SV001")

    ws.delete_rows.assert_called_once_with(5)


@patch("sheets._worksheet")
def test_set_barber_availability_updates_is_available_column(mock_ws):
    ws = MagicMock()
    ws.find.return_value = MagicMock(row=2)
    ws.row_values.return_value = ["barber_id", "name", "is_available"]
    mock_ws.return_value = ws

    sheets.set_barber_availability("BR001", True)

    ws.update_cell.assert_called_once_with(2, 3, "TRUE")


@patch("sheets._worksheet")
def test_add_barber_generates_next_barber_id(mock_ws):
    ws = MagicMock()
    ws.get_all_records.return_value = [{"barber_id": "BR002", "name": "Omar", "is_available": "TRUE"}]
    ws.row_values.return_value = ["barber_id", "name", "is_available"]
    mock_ws.return_value = ws

    barber_id = sheets.add_barber("Mohamed")

    assert barber_id == "BR003"
    ws.append_row.assert_called_once_with(["BR003", "Mohamed", "TRUE"])


@patch("sheets._worksheet")
def test_remove_barber_deletes_matching_row(mock_ws):
    ws = MagicMock()
    ws.find.return_value = MagicMock(row=5)
    mock_ws.return_value = ws

    sheets.remove_barber("BR001")

    ws.delete_rows.assert_called_once_with(5)
