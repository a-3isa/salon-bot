# Salon Reservation Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the hostel reservation Telegram bot into a men's barber salon reservation bot using services, barbers, and Day/Night reservation preferences.

**Architecture:** Keep the existing Python Telegram bot and Google Sheets integration, but replace hostel entities with salon entities. `sheets.py` owns all sheet reads/writes and sorting, `handlers/booking.py` owns the customer reservation conversation, `handlers/admin.py` owns admin commands, and `strings.py` owns English/Arabic copy.

**Tech Stack:** Python, python-telegram-bot, gspread, Google service account credentials, pytest.

---

## File Structure

- Modify `sheets.py`: add Services, Barbers, Reservations helpers; remove room availability behavior from the reservation flow.
- Modify `handlers/booking.py`: replace date/location/room/photo flow with service/barber/time preference flow.
- Modify `handlers/check_booking.py`: read from `Reservations` and display salon reservation fields.
- Modify `handlers/admin.py`: replace room commands with service/barber commands.
- Modify `bot.py`: register new admin commands and remove `/upload_photo`.
- Modify `strings.py`: replace hostel customer-facing text with salon reservation text.
- Modify `init_sheet.py`: create `Services`, `Barbers`, `Reservations`, and `Config`.
- Modify `seed_data.py`: seed standard services and Omar/Mohamed.
- Modify `tests/test_sheets.py`: cover service/barber filtering, reservation append, lookup, and sorting.
- Add `tests/test_booking_flow.py`: cover keyboard and summary helpers from the reservation flow.
- Add `tests/test_admin.py`: cover admin command functions calling service/barber Sheets helpers.

## Task 1: Sheets Service And Barber Reads

**Files:**
- Modify: `tests/test_sheets.py`
- Modify: `sheets.py`

- [ ] **Step 1: Write failing tests for available services and barbers**

Append these tests to `tests/test_sheets.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_sheets.py -v`

Expected: FAIL with missing attributes such as `module 'sheets' has no attribute 'get_available_services'`.

- [ ] **Step 3: Implement minimal service and barber helpers**

In `sheets.py`, add:

```python
def get_available_services() -> list[dict]:
    rows = _cached("services", lambda: _worksheet("Services").get_all_records())
    return [r for r in rows if str(r["is_available"]).upper() == "TRUE"]


def get_service(service_id: str) -> dict | None:
    rows = _cached("services", lambda: _worksheet("Services").get_all_records())
    return next((r for r in rows if r["service_id"] == service_id), None)


def get_available_barbers() -> list[dict]:
    rows = _cached("barbers", lambda: _worksheet("Barbers").get_all_records())
    return [r for r in rows if str(r["is_available"]).upper() == "TRUE"]


def get_barber(barber_id: str) -> dict | None:
    rows = _cached("barbers", lambda: _worksheet("Barbers").get_all_records())
    return next((r for r in rows if r["barber_id"] == barber_id), None)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_sheets.py -v`

Expected: PASS.

## Task 2: Reservations Append, Lookup, And Sorting

**Files:**
- Modify: `tests/test_sheets.py`
- Modify: `sheets.py`

- [ ] **Step 1: Write failing tests for reservation append, lookup, and sort**

Append these tests to `tests/test_sheets.py`:

```python
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

    ws.update.assert_called_once_with("A2:G4", [
        ["BK-000001", "Hair Wash", "Omar", "Day: 10 AM - 6 PM", "Day Old", "3", "2026-06-07"],
        ["BK-000002", "Beard Trim", "Mohamed", "Day: 10 AM - 6 PM", "Day New", "2", "2026-06-09"],
        ["BK-000003", "Haircut", "Omar", "Night: 6 PM - 12 AM", "Night Old", "1", "2026-06-08"],
    ])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_sheets.py -v`

Expected: FAIL with missing reservation helper functions.

- [ ] **Step 3: Implement reservation helpers**

In `sheets.py`, add:

```python
DAY_PREFERENCE = "Day: 10 AM - 6 PM"
NIGHT_PREFERENCE = "Night: 6 PM - 12 AM"


def append_reservation(data: dict) -> None:
    ws = _worksheet("Reservations")
    header = ws.row_values(1)
    ws.append_row([data.get(col, "") for col in header])
    sort_reservations()


def get_reservation_by_ref(ref: str) -> dict | None:
    rows = _worksheet("Reservations").get_all_records()
    return next((r for r in rows if r["booking_ref"] == ref), None)


def _reservation_sort_key(row: dict) -> tuple[int, str, str]:
    preference_rank = 0 if row.get("time_preference") == DAY_PREFERENCE else 1
    return (preference_rank, str(row.get("created_at", "")), str(row.get("booking_ref", "")))


def sort_reservations() -> None:
    ws = _worksheet("Reservations")
    header = ws.row_values(1)
    rows = ws.get_all_records()
    if not rows:
        return
    sorted_rows = sorted(rows, key=_reservation_sort_key)
    values = [[row.get(col, "") for col in header] for row in sorted_rows]
    ws.update(f"A2:{chr(ord('A') + len(header) - 1)}{len(values) + 1}", values)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_sheets.py -v`

Expected: PASS.

## Task 3: Admin Sheet Mutations

**Files:**
- Modify: `tests/test_sheets.py`
- Modify: `sheets.py`

- [ ] **Step 1: Write failing tests for add/remove/availability helpers**

Append these tests to `tests/test_sheets.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_sheets.py -v`

Expected: FAIL with missing admin helper functions.

- [ ] **Step 3: Implement admin helper functions**

In `sheets.py`, add:

```python
def _set_entity_availability(sheet_name: str, cache_key: str, id_value: str, is_available: bool) -> None:
    ws = _worksheet(sheet_name)
    cell = ws.find(id_value, in_column=1)
    if cell is None:
        raise ValueError(f"{id_value} not found")
    header = ws.row_values(1)
    col = header.index("is_available") + 1
    ws.update_cell(cell.row, col, "TRUE" if is_available else "FALSE")
    _invalidate(cache_key)


def _remove_entity(sheet_name: str, cache_key: str, id_value: str) -> None:
    ws = _worksheet(sheet_name)
    cell = ws.find(id_value, in_column=1)
    if cell is None:
        raise ValueError(f"{id_value} not found")
    ws.delete_rows(cell.row)
    _invalidate(cache_key)


def set_service_availability(service_id: str, is_available: bool) -> None:
    _set_entity_availability("Services", "services", service_id, is_available)


def add_service(name: str) -> str:
    ws = _worksheet("Services")
    rows = ws.get_all_records()
    nums = [int(r["service_id"][2:]) for r in rows if str(r.get("service_id", ""))[2:].isdigit()]
    service_id = f"SV{(max(nums) + 1 if nums else 1):03d}"
    header = ws.row_values(1)
    row_data = {"service_id": service_id, "name": name, "is_available": "TRUE"}
    ws.append_row([row_data.get(col, "") for col in header])
    _invalidate("services")
    return service_id


def remove_service(service_id: str) -> None:
    _remove_entity("Services", "services", service_id)


def set_barber_availability(barber_id: str, is_available: bool) -> None:
    _set_entity_availability("Barbers", "barbers", barber_id, is_available)


def add_barber(name: str) -> str:
    ws = _worksheet("Barbers")
    rows = ws.get_all_records()
    nums = [int(r["barber_id"][2:]) for r in rows if str(r.get("barber_id", ""))[2:].isdigit()]
    barber_id = f"BR{(max(nums) + 1 if nums else 1):03d}"
    header = ws.row_values(1)
    row_data = {"barber_id": barber_id, "name": name, "is_available": "TRUE"}
    ws.append_row([row_data.get(col, "") for col in header])
    _invalidate("barbers")
    return barber_id


def remove_barber(barber_id: str) -> None:
    _remove_entity("Barbers", "barbers", barber_id)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_sheets.py -v`

Expected: PASS.

## Task 4: Booking Handler Conversation Shape

**Files:**
- Add: `tests/test_booking_flow.py`
- Modify: `handlers/booking.py`

- [ ] **Step 1: Write failing tests for callback keyboard helper behavior**

Create `tests/test_booking_flow.py`:

```python
import os
os.environ.setdefault("BOT_TOKEN", "test")
os.environ.setdefault("SHEET_ID", "test")
os.environ.setdefault("GOOGLE_CREDENTIALS_JSON", "test.json")
os.environ.setdefault("ADMIN_IDS", "")

from handlers import booking


def test_time_preference_keyboard_has_day_then_night():
    keyboard = booking._time_preference_keyboard()

    buttons = keyboard.inline_keyboard

    assert buttons[0][0].text == "Day: 10 AM - 6 PM"
    assert buttons[0][0].callback_data == "pref_day"
    assert buttons[1][0].text == "Night: 6 PM - 12 AM"
    assert buttons[1][0].callback_data == "pref_night"


def test_service_callback_prefix_is_service_id():
    keyboard = booking._services_keyboard([
        {"service_id": "SV001", "name": "Haircut", "is_available": "TRUE"},
    ])

    assert keyboard.inline_keyboard[0][0].callback_data == "service_SV001"


def test_barber_callback_prefix_is_barber_id():
    keyboard = booking._barbers_keyboard([
        {"barber_id": "BR001", "name": "Omar", "is_available": "TRUE"},
    ])

    assert keyboard.inline_keyboard[0][0].callback_data == "barber_BR001"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_booking_flow.py -v`

Expected: FAIL with missing helper functions.

- [ ] **Step 3: Replace conversation constants and add keyboard helpers**

In `handlers/booking.py`, replace the old state tuple with:

```python
(
    RULES, SERVICE, BARBER, TIME_PREFERENCE,
    NAME, PHONE, CONFIRM, EDIT_MENU, EDIT_FIELD,
) = range(9)
```

Add:

```python
DAY_PREFERENCE = "Day: 10 AM - 6 PM"
NIGHT_PREFERENCE = "Night: 6 PM - 12 AM"


def _services_keyboard(services: list[dict]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(service["name"], callback_data=f"service_{service['service_id']}")]
        for service in services
    ])


def _barbers_keyboard(barbers: list[dict]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(barber["name"], callback_data=f"barber_{barber['barber_id']}")]
        for barber in barbers
    ])


def _time_preference_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(DAY_PREFERENCE, callback_data="pref_day")],
        [InlineKeyboardButton(NIGHT_PREFERENCE, callback_data="pref_night")],
    ])
```

- [ ] **Step 4: Run focused tests**

Run: `pytest tests/test_booking_flow.py -v`

Expected: PASS.

## Task 5: Booking Handler Customer Flow

**Files:**
- Modify: `handlers/booking.py`
- Modify: `strings.py`

- [ ] **Step 1: Write a failing test for confirmation summary text**

Append to `tests/test_booking_flow.py`:

```python
def test_confirm_summary_uses_salon_fields():
    text = booking._reservation_summary_text("en", {
        "service_name": "Haircut",
        "barber_name": "Omar",
        "time_preference": "Day: 10 AM - 6 PM",
        "customer_name": "Ahmed Hassan",
        "phone": "+201000000000",
    })

    assert "Service: Haircut" in text
    assert "Barber: Omar" in text
    assert "Preferred time: Day: 10 AM - 6 PM" in text
    assert "Ahmed Hassan" in text
    assert "+201000000000" in text
    assert "Room" not in text
    assert "Check-in" not in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_booking_flow.py::test_confirm_summary_uses_salon_fields -v`

Expected: FAIL because `_reservation_summary_text` does not exist.

- [ ] **Step 3: Implement `_reservation_summary_text` and customer flow handlers**

In `handlers/booking.py`, remove calendar/location/room/photo/arrival handlers and add:

```python
def _reservation_summary_text(lang: str, data: dict) -> str:
    return t(
        "confirm_summary",
        lang,
        service_name=data["service_name"],
        barber_name=data["barber_name"],
        time_preference=data["time_preference"],
        customer_name=data["customer_name"],
        phone=data["phone"],
    )
```

Implement these async handlers using the same Telegram patterns already in the file:

```python
async def _show_services(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    services = sheets.get_available_services()
    if not services:
        await update.effective_message.reply_text(t("no_services", lang))
        return ConversationHandler.END
    await update.effective_message.reply_text(
        t("choose_service", lang),
        reply_markup=_services_keyboard(services),
    )
    return SERVICE


async def handle_service(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    service_id = query.data.removeprefix("service_")
    service = sheets.get_service(service_id)
    if service is None:
        await query.message.reply_text(t("service_not_found", lang))
        return await _show_services(update, context)
    context.user_data["service_name"] = service["name"]
    return await _show_barbers(update, context)


async def _show_barbers(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    lang = _lang(context)
    barbers = sheets.get_available_barbers()
    if not barbers:
        await update.effective_message.reply_text(t("no_barbers", lang))
        return ConversationHandler.END
    await update.effective_message.reply_text(
        t("choose_barber", lang),
        reply_markup=_barbers_keyboard(barbers),
    )
    return BARBER


async def handle_barber(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    barber_id = query.data.removeprefix("barber_")
    barber = sheets.get_barber(barber_id)
    if barber is None:
        await query.message.reply_text(t("barber_not_found", lang))
        return await _show_barbers(update, context)
    context.user_data["barber_name"] = barber["name"]
    await query.message.reply_text(
        t("choose_time_preference", lang),
        reply_markup=_time_preference_keyboard(),
    )
    return TIME_PREFERENCE


async def handle_time_preference(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    lang = _lang(context)
    context.user_data["time_preference"] = DAY_PREFERENCE if query.data == "pref_day" else NIGHT_PREFERENCE
    await query.message.reply_text(t("name_prompt", lang))
    return NAME
```

Update `handle_name`, `handle_phone`, and `_show_confirm` to use `customer_name`, `time_preference`, and `_reservation_summary_text`.

- [ ] **Step 4: Update `build_booking_handler` states**

In `handlers/booking.py`, make the handler states:

```python
states={
    RULES: [CallbackQueryHandler(handle_rules, pattern="^rules_(agree|disagree)$")],
    SERVICE: [CallbackQueryHandler(handle_service, pattern=r"^service_")],
    BARBER: [CallbackQueryHandler(handle_barber, pattern=r"^barber_")],
    TIME_PREFERENCE: [CallbackQueryHandler(handle_time_preference, pattern=r"^pref_(day|night)$")],
    NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_name)],
    PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_phone)],
    CONFIRM: [CallbackQueryHandler(handle_confirm, pattern=r"^confirm_(agree|change|cancel)$")],
    EDIT_MENU: [CallbackQueryHandler(handle_edit_menu, pattern=r"^edit_")],
    EDIT_FIELD: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_edit_field)],
}
```

Change `handle_rules` so agreeing calls `_show_services(update, context)`.

- [ ] **Step 5: Run focused tests**

Run: `pytest tests/test_booking_flow.py -v`

Expected: PASS.

## Task 6: Save Reservations And Notify Salon

**Files:**
- Modify: `handlers/booking.py`
- Modify: `tests/test_booking_flow.py`

- [ ] **Step 1: Write a failing test for reservation payload construction**

Append to `tests/test_booking_flow.py`:

```python
def test_build_reservation_payload_excludes_internal_ids_and_telegram_id():
    payload = booking._build_reservation_payload(
        ref="BK-000010",
        data={
            "service_name": "Haircut",
            "barber_name": "Omar",
            "time_preference": "Night: 6 PM - 12 AM",
            "customer_name": "Ahmed",
            "phone": "+201000000000",
        },
        created_at="2026-06-09",
    )

    assert payload == {
        "booking_ref": "BK-000010",
        "service_name": "Haircut",
        "barber_name": "Omar",
        "time_preference": "Night: 6 PM - 12 AM",
        "customer_name": "Ahmed",
        "phone": "+201000000000",
        "created_at": "2026-06-09",
    }
    assert "telegram_id" not in payload
    assert "service_id" not in payload
    assert "barber_id" not in payload
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_booking_flow.py::test_build_reservation_payload_excludes_internal_ids_and_telegram_id -v`

Expected: FAIL because `_build_reservation_payload` does not exist.

- [ ] **Step 3: Add payload helper and update confirmation save**

In `handlers/booking.py`, add:

```python
def _build_reservation_payload(ref: str, data: dict, created_at: str) -> dict:
    return {
        "booking_ref": ref,
        "service_name": data["service_name"],
        "barber_name": data["barber_name"],
        "time_preference": data["time_preference"],
        "customer_name": data["customer_name"],
        "phone": data["phone"],
        "created_at": created_at,
    }
```

In `handle_confirm`, replace `sheets.append_booking(...)` and `sheets.set_room_availability(...)` with:

```python
reservation_data = _build_reservation_payload(ref, context.user_data, str(dt_date.today()))
sheets.append_reservation(reservation_data)
```

Update the admin notification message to include:

```python
host_msg = (
    f"*New Salon Reservation*\n\n"
    f"Ref: {ref}\n"
    f"Service: {d['service_name']}\n"
    f"Barber: {d['barber_name']}\n"
    f"Preferred time: {d['time_preference']}\n"
    f"Customer: {d['customer_name']}\n"
    f"Phone: {d['phone']}"
)
```

- [ ] **Step 4: Run focused tests**

Run: `pytest tests/test_booking_flow.py -v`

Expected: PASS.

## Task 7: Edit Menu For Salon Fields

**Files:**
- Modify: `handlers/booking.py`
- Modify: `strings.py`

- [ ] **Step 1: Write a failing test for edit menu callback set**

Append to `tests/test_booking_flow.py`:

```python
def test_edit_menu_keyboard_contains_only_salon_fields():
    keyboard = booking._edit_menu_keyboard("en")
    callback_data = [row[0].callback_data for row in keyboard.inline_keyboard]

    assert callback_data == [
        "edit_service",
        "edit_barber",
        "edit_time_preference",
        "edit_name",
        "edit_phone",
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_booking_flow.py::test_edit_menu_keyboard_contains_only_salon_fields -v`

Expected: FAIL because `_edit_menu_keyboard` does not exist.

- [ ] **Step 3: Implement salon edit menu helper and route handlers**

In `handlers/booking.py`, add:

```python
def _edit_menu_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(t("btn_edit_service", lang), callback_data="edit_service")],
        [InlineKeyboardButton(t("btn_edit_barber", lang), callback_data="edit_barber")],
        [InlineKeyboardButton(t("btn_edit_time_preference", lang), callback_data="edit_time_preference")],
        [InlineKeyboardButton(t("btn_edit_name", lang), callback_data="edit_name")],
        [InlineKeyboardButton(t("btn_edit_phone", lang), callback_data="edit_phone")],
    ])
```

Update `_show_edit_menu` to use `_edit_menu_keyboard(lang)`.

Update `handle_edit_menu`:

```python
if target == "service":
    context.user_data["editing"] = True
    return await _show_services(update, context)

if target == "barber":
    context.user_data["editing"] = True
    return await _show_barbers(update, context)

if target == "time_preference":
    await query.message.reply_text(
        t("choose_time_preference", lang),
        reply_markup=_time_preference_keyboard(),
    )
    context.user_data["editing"] = True
    return TIME_PREFERENCE
```

After service, barber, or time preference handlers set their value, if `context.user_data.pop("editing", False)` is true, return `_show_confirm(update, context)` instead of continuing to the next step.

- [ ] **Step 4: Run focused tests**

Run: `pytest tests/test_booking_flow.py -v`

Expected: PASS.

## Task 8: Check Reservation Flow

**Files:**
- Modify: `handlers/check_booking.py`
- Modify: `strings.py`

- [ ] **Step 1: Write failing tests for check display helper**

Add `tests/test_check_booking.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_check_booking.py -v`

Expected: FAIL because `_reservation_detail_text` does not exist.

- [ ] **Step 3: Implement detail helper and use Reservations lookup**

In `handlers/check_booking.py`, add:

```python
def _reservation_detail_text(lang: str, reservation: dict, host_phone: str) -> str:
    return t(
        "booking_detail",
        lang,
        service_name=reservation.get("service_name", "N/A"),
        barber_name=reservation.get("barber_name", "N/A"),
        time_preference=reservation.get("time_preference", "N/A"),
        customer_name=reservation.get("customer_name", "N/A"),
        phone=reservation.get("phone", "N/A"),
        booking_ref=reservation.get("booking_ref", "N/A"),
        host_phone=host_phone,
    )
```

In `handle_ref`, replace:

```python
booking = sheets.get_booking_by_ref(ref)
```

with:

```python
booking = sheets.get_reservation_by_ref(ref)
```

Use `_reservation_detail_text(lang, booking, host_phone)` in `reply_text`.

- [ ] **Step 4: Run focused tests**

Run: `pytest tests/test_check_booking.py -v`

Expected: PASS.

## Task 9: Strings Update

**Files:**
- Modify: `strings.py`
- Run: `tests/test_booking_flow.py`, `tests/test_check_booking.py`

- [ ] **Step 1: Update English strings**

In `strings.py`, update English keys to include these values:

```python
"main_menu": "Welcome to the men's salon. What would you like to do?",
"btn_new_booking": "New Reservation",
"btn_check_booking": "Check My Reservation",
"rules_header": "*Salon Reservation Policy*\n\n{rules}\n\nPlease read before proceeding.",
"choose_service": "Choose a service:",
"service_not_found": "Service not found. Please choose again.",
"no_services": "No services are currently available. Please contact the salon.",
"choose_barber": "Choose your barber:",
"barber_not_found": "Barber not found. Please choose again.",
"no_barbers": "No barbers are currently available. Please contact the salon.",
"choose_time_preference": "Choose your preferred time:",
"name_prompt": "Enter your full name:",
"phone_prompt": "Enter your phone number:",
"confirm_summary": (
    "*Please review your reservation:*\n\n"
    "Service: {service_name}\n"
    "Barber: {barber_name}\n"
    "Preferred time: {time_preference}\n"
    "Customer: {customer_name}\n"
    "Phone: {phone}"
),
"booking_cancelled": "Reservation cancelled. Send /start to begin again.",
"booking_confirmed": (
    "*Your reservation is confirmed!*\n"
    "Reference: *{ref}*\n"
    "Salon phone: {host_phone}\n\n"
    "Please contact the salon on WhatsApp or phone if you need changes."
),
"edit_prompt": "What would you like to change?",
"btn_edit_service": "Service",
"btn_edit_barber": "Barber",
"btn_edit_time_preference": "Preferred time",
"btn_edit_name": "Name",
"btn_edit_phone": "Phone",
"name_new_prompt": "Enter your new full name:",
"phone_new_prompt": "Enter your new phone number:",
"check_ref_prompt": "Enter your reservation reference (e.g. BK-000042):\n\nType /cancel to exit.",
"check_ref_not_found": "Reservation {ref} not found.\nTry again or /cancel:",
"booking_detail": (
    "*Your Reservation*\n\n"
    "Service: {service_name}\n"
    "Barber: {barber_name}\n"
    "Preferred time: {time_preference}\n"
    "Customer: {customer_name}\n"
    "Phone: {phone}\n"
    "Ref: {booking_ref}\n"
    "Salon phone: {host_phone}"
),
```

- [ ] **Step 2: Update Arabic strings**

Use matching Arabic keys. Keep placeholders exactly the same as English:

```python
"main_menu": "أهلا بك في صالون الرجال. ماذا تريد أن تفعل؟",
"btn_new_booking": "حجز جديد",
"btn_check_booking": "تتبع حجزي",
"rules_header": "*سياسة حجز الصالون*\n\n{rules}\n\nيرجى القراءة قبل المتابعة.",
"choose_service": "اختر الخدمة:",
"service_not_found": "الخدمة غير موجودة. يرجى الاختيار مرة أخرى.",
"no_services": "لا توجد خدمات متاحة حاليا. يرجى التواصل مع الصالون.",
"choose_barber": "اختر الحلاق:",
"barber_not_found": "الحلاق غير موجود. يرجى الاختيار مرة أخرى.",
"no_barbers": "لا يوجد حلاقون متاحون حاليا. يرجى التواصل مع الصالون.",
"choose_time_preference": "اختر الوقت المفضل:",
"name_prompt": "أدخل اسمك الكامل:",
"phone_prompt": "أدخل رقم هاتفك:",
"confirm_summary": (
    "*راجع حجزك:*\n\n"
    "الخدمة: {service_name}\n"
    "الحلاق: {barber_name}\n"
    "الوقت المفضل: {time_preference}\n"
    "العميل: {customer_name}\n"
    "الهاتف: {phone}"
),
"booking_cancelled": "تم إلغاء الحجز. أرسل /start للبدء من جديد.",
"booking_confirmed": (
    "*تم تأكيد حجزك!*\n"
    "رقم الحجز: *{ref}*\n"
    "هاتف الصالون: {host_phone}\n\n"
    "يرجى التواصل مع الصالون عبر واتساب أو الهاتف إذا أردت أي تغيير."
),
"edit_prompt": "ماذا تريد أن تغير؟",
"btn_edit_service": "الخدمة",
"btn_edit_barber": "الحلاق",
"btn_edit_time_preference": "الوقت المفضل",
"btn_edit_name": "الاسم",
"btn_edit_phone": "الهاتف",
"name_new_prompt": "أدخل اسمك الكامل الجديد:",
"phone_new_prompt": "أدخل رقم هاتفك الجديد:",
"check_ref_prompt": "أدخل رقم الحجز (مثال: BK-000042):\n\nاكتب /cancel للخروج.",
"check_ref_not_found": "لا يوجد حجز برقم {ref}.\nحاول مرة أخرى أو /cancel:",
"booking_detail": (
    "*تفاصيل حجزك*\n\n"
    "الخدمة: {service_name}\n"
    "الحلاق: {barber_name}\n"
    "الوقت المفضل: {time_preference}\n"
    "العميل: {customer_name}\n"
    "الهاتف: {phone}\n"
    "رقم الحجز: {booking_ref}\n"
    "هاتف الصالون: {host_phone}"
),
```

- [ ] **Step 3: Run text-dependent tests**

Run: `pytest tests/test_booking_flow.py tests/test_check_booking.py -v`

Expected: PASS.

## Task 10: Admin Commands

**Files:**
- Add: `tests/test_admin.py`
- Modify: `handlers/admin.py`
- Modify: `bot.py`

- [ ] **Step 1: Write failing tests for admin command helper calls**

Create `tests/test_admin.py`:

```python
import os
os.environ.setdefault("BOT_TOKEN", "test")
os.environ.setdefault("SHEET_ID", "test")
os.environ.setdefault("GOOGLE_CREDENTIALS_JSON", "test.json")
os.environ.setdefault("ADMIN_IDS", "123")

import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from handlers import admin


def _update():
    return SimpleNamespace(
        effective_user=SimpleNamespace(id=123),
        message=SimpleNamespace(reply_text=AsyncMock()),
    )


def _context(*args):
    return SimpleNamespace(args=list(args))


@pytest.mark.asyncio
@patch("handlers.admin.sheets.add_service", return_value="SV001")
async def test_add_service_calls_sheets_helper(mock_add_service):
    update = _update()

    await admin.add_service(update, _context("Skin", "Cleaning"))

    mock_add_service.assert_called_once_with("Skin Cleaning")
    update.message.reply_text.assert_awaited_once()


@pytest.mark.asyncio
@patch("handlers.admin.sheets.set_barber_availability")
async def test_set_barber_unavailable_calls_sheets_helper(mock_set_barber_availability):
    update = _update()

    await admin.set_barber_unavailable(update, _context("br001"))

    mock_set_barber_availability.assert_called_once_with("BR001", False)
    update.message.reply_text.assert_awaited_once()
```

- [ ] **Step 2: Run admin tests to verify they fail**

Run: `pytest tests/test_admin.py -v`

Expected: FAIL with missing attributes such as `module 'handlers.admin' has no attribute 'add_service'`.

- [ ] **Step 3: Replace admin command functions**

In `handlers/admin.py`, keep `admin_only` and replace room/photo functions with:

```python
@admin_only
async def add_service(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /add_service <name>")
        return
    name = " ".join(context.args).strip()
    service_id = sheets.add_service(name)
    await update.message.reply_text(f"Service {name} added as `{service_id}`.", parse_mode="Markdown")


@admin_only
async def remove_service(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /remove_service <service_id>")
        return
    service_id = context.args[0].upper()
    try:
        sheets.remove_service(service_id)
        await update.message.reply_text(f"{service_id} removed.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def set_service_available(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /set_service_available <service_id>")
        return
    service_id = context.args[0].upper()
    try:
        sheets.set_service_availability(service_id, True)
        await update.message.reply_text(f"{service_id} is now available.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def set_service_unavailable(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /set_service_unavailable <service_id>")
        return
    service_id = context.args[0].upper()
    try:
        sheets.set_service_availability(service_id, False)
        await update.message.reply_text(f"{service_id} is now unavailable.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def list_services(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    services = sheets.get_available_services()
    if not services:
        await update.message.reply_text("No available services.")
        return
    lines = [f"{s['name']} (`{s['service_id']}`)" for s in services]
    await update.message.reply_text("Available services:\n" + "\n".join(lines), parse_mode="Markdown")
```

Add these matching barber functions:

```python
@admin_only
async def add_barber(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /add_barber <name>")
        return
    name = " ".join(context.args).strip()
    barber_id = sheets.add_barber(name)
    await update.message.reply_text(f"Barber {name} added as `{barber_id}`.", parse_mode="Markdown")


@admin_only
async def remove_barber(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /remove_barber <barber_id>")
        return
    barber_id = context.args[0].upper()
    try:
        sheets.remove_barber(barber_id)
        await update.message.reply_text(f"{barber_id} removed.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def set_barber_available(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /set_barber_available <barber_id>")
        return
    barber_id = context.args[0].upper()
    try:
        sheets.set_barber_availability(barber_id, True)
        await update.message.reply_text(f"{barber_id} is now available.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def set_barber_unavailable(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("Usage: /set_barber_unavailable <barber_id>")
        return
    barber_id = context.args[0].upper()
    try:
        sheets.set_barber_availability(barber_id, False)
        await update.message.reply_text(f"{barber_id} is now unavailable.")
    except ValueError as e:
        await update.message.reply_text(str(e))


@admin_only
async def list_barbers(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    barbers = sheets.get_available_barbers()
    if not barbers:
        await update.message.reply_text("No available barbers.")
        return
    lines = [f"{b['name']} (`{b['barber_id']}`)" for b in barbers]
    await update.message.reply_text("Available barbers:\n" + "\n".join(lines), parse_mode="Markdown")
```

- [ ] **Step 4: Run admin tests to verify they pass**

Run: `pytest tests/test_admin.py -v`

Expected: PASS.

- [ ] **Step 5: Update bot command registration**

In `bot.py`, replace old admin handlers with:

```python
app.add_handler(CommandHandler("add_service", admin.add_service))
app.add_handler(CommandHandler("remove_service", admin.remove_service))
app.add_handler(CommandHandler("set_service_available", admin.set_service_available))
app.add_handler(CommandHandler("set_service_unavailable", admin.set_service_unavailable))
app.add_handler(CommandHandler("list_services", admin.list_services))
app.add_handler(CommandHandler("add_barber", admin.add_barber))
app.add_handler(CommandHandler("remove_barber", admin.remove_barber))
app.add_handler(CommandHandler("set_barber_available", admin.set_barber_available))
app.add_handler(CommandHandler("set_barber_unavailable", admin.set_barber_unavailable))
app.add_handler(CommandHandler("list_barbers", admin.list_barbers))
```

- [ ] **Step 6: Run import test**

Run: `python -m py_compile bot.py handlers/admin.py`

Expected: no output and exit code 0.

## Task 11: Sheet Initialization And Seed Data

**Files:**
- Modify: `init_sheet.py`
- Modify: `seed_data.py`

- [ ] **Step 1: Update `init_sheet.py` sheet creation**

Replace hostel sheet setup with:

```python
print("Setting up Services sheet...")
ws = get_or_create("Services")
if ws.row_values(1) == []:
    ws.append_row(["service_id", "name", "is_available"])
    print("  Headers written")

print("Setting up Barbers sheet...")
ws = get_or_create("Barbers")
if ws.row_values(1) == []:
    ws.append_row(["barber_id", "name", "is_available"])
    print("  Headers written")

print("Setting up Reservations sheet...")
ws = get_or_create("Reservations")
if ws.row_values(1) == []:
    ws.append_row([
        "booking_ref", "service_name", "barber_name", "time_preference",
        "customer_name", "phone", "created_at",
    ])
    print("  Headers written")
```

Set default Config rules to:

```python
ws.append_row(["rules", "Please arrive during your selected Day/Night range. Contact the salon if you need to change your reservation."])
```

- [ ] **Step 2: Update `seed_data.py`**

Replace contents after spreadsheet connection with:

```python
services = [
    ("SV001", "Haircut"),
    ("SV002", "Beard Trim"),
    ("SV003", "Haircut + Beard"),
    ("SV004", "Kids Haircut"),
    ("SV005", "Hair Wash"),
    ("SV006", "Hair Coloring"),
    ("SV007", "Skin Cleaning"),
    ("SV008", "Facial Mask"),
    ("SV009", "Black Mask"),
    ("SV010", "Hair Styling"),
    ("SV011", "Hair Treatment"),
    ("SV012", "Waxing / Face Cleanup"),
]

ws = spreadsheet.worksheet("Services")
if len(ws.get_all_records()) == 0:
    for service_id, name in services:
        ws.append_row([service_id, name, "TRUE"])
    print("Added standard services")

barbers = [("BR001", "Omar"), ("BR002", "Mohamed")]

ws = spreadsheet.worksheet("Barbers")
if len(ws.get_all_records()) == 0:
    for barber_id, name in barbers:
        ws.append_row([barber_id, name, "TRUE"])
    print("Added initial barbers")

print("Sample salon data added.")
```

- [ ] **Step 3: Compile scripts**

Run: `python -m py_compile init_sheet.py seed_data.py`

Expected: no output and exit code 0.

## Task 12: Full Cleanup And Verification

**Files:**
- Review all Python files.

- [ ] **Step 1: Search for hostel leftovers**

Run:

```powershell
rg "room|Room|rooms|Rooms|location|Location|check-in|check-out|arrival|guest|hostel|property|upload_photo|set_room|Bookings|Locations" .
```

Expected: no active customer/admin code contains hostel-specific wording. Test names for removed legacy helpers should be deleted or renamed.

- [ ] **Step 2: Remove obsolete tests**

Delete or rewrite tests that assert old room/location behavior:

- `test_get_locations_returns_list`
- `test_get_available_rooms_filters_correctly`
- `test_get_room_returns_matching_room`
- `test_get_room_returns_none_if_not_found`
- `test_set_room_availability_true`
- `test_set_room_availability_raises_if_not_found`
- `test_append_booking_uses_header_order`
- `test_get_booking_by_ref_found`
- `test_get_booking_by_ref_not_found`

Keep `get_config` and `increment_booking_counter` tests.

- [ ] **Step 3: Run full test suite**

Run: `pytest -v`

Expected: all tests pass.

- [ ] **Step 4: Run Python compile verification**

Run:

```powershell
python -m py_compile bot.py sheets.py strings.py init_sheet.py seed_data.py handlers/booking.py handlers/check_booking.py handlers/admin.py utils/validators.py utils/ref_generator.py
```

Expected: no output and exit code 0.

- [ ] **Step 5: Document credentials for operator**

Confirm the final response names these required credentials:

- `BOT_TOKEN`
- `SHEET_ID`
- `GOOGLE_CREDENTIALS_JSON`
- `ADMIN_IDS`
- `host_chat_id`
- `host_phone`

Also mention that the existing `.env` and `service_account.json` are secrets.

## Self-Review Notes

- Spec coverage: customer flow, Services/Barbers/Reservations schema, Day/Night sorting, admin commands, check reservation, credentials, and removed hostel concepts all have tasks.
- Placeholder scan: no task contains placeholder markers or missing implementation instructions.
- Type consistency: `service_name`, `barber_name`, `time_preference`, `customer_name`, `phone`, and `booking_ref` are used consistently across handlers, strings, sheets, and tests.
