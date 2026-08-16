import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

os.environ.setdefault("BOT_TOKEN", "test")
os.environ.setdefault("SHEET_ID", "test")
os.environ.setdefault("GOOGLE_CREDENTIALS_JSON", "test.json")
os.environ.setdefault("ADMIN_IDS", "")

import pytest
from telegram.ext import ConversationHandler

from handlers import booking


def test_time_preference_keyboard_has_day_then_night():
    keyboard = booking._time_preference_keyboard()

    buttons = keyboard.inline_keyboard

    assert buttons[0][0].text == "Day: 10 AM - 6 PM"
    assert buttons[0][0].callback_data == "pref_day"
    assert buttons[1][0].text == "Night: 6 PM - 12 AM"
    assert buttons[1][0].callback_data == "pref_night"


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


def test_build_booking_handler_constructs_during_transition():
    handler = booking.build_booking_handler()
    assert handler is not None


def test_build_booking_handler_edit_menu_pattern_is_narrow():
    handler = booking.build_booking_handler()
    pattern = handler.states[booking.EDIT_MENU][0].pattern.pattern

    assert pattern == r"^edit_(service|barber|time_preference|name|phone)$"
    assert pattern != r"^edit_"


@pytest.mark.asyncio
async def test_show_services_clears_stale_editing_when_none_available(monkeypatch):
    monkeypatch.setattr(booking.sheets, "get_available_services", Mock(return_value=[]))
    update = SimpleNamespace(effective_message=SimpleNamespace(reply_text=AsyncMock()))
    context = SimpleNamespace(user_data={"editing": True, "lang": "en"})

    result = await booking._show_services(update, context)

    assert result == ConversationHandler.END
    assert "editing" not in context.user_data


@pytest.mark.asyncio
async def test_show_barbers_clears_stale_editing_when_none_available(monkeypatch):
    monkeypatch.setattr(booking.sheets, "get_available_barbers", Mock(return_value=[]))
    update = SimpleNamespace(effective_message=SimpleNamespace(reply_text=AsyncMock()))
    context = SimpleNamespace(user_data={"editing": True, "lang": "en"})

    result = await booking._show_barbers(update, context)

    assert result == ConversationHandler.END
    assert "editing" not in context.user_data


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


def _confirm_update_and_context(reply_text=None, send_message=None):
    message = SimpleNamespace(reply_text=reply_text or AsyncMock())
    query = SimpleNamespace(
        data="confirm_agree",
        answer=AsyncMock(),
        message=message,
    )
    update = SimpleNamespace(callback_query=query)
    context = SimpleNamespace(
        user_data={
            "lang": "en",
            "service_name": "Haircut",
            "barber_name": "Omar",
            "time_preference": "Night: 6 PM - 12 AM",
            "customer_name": "Ahmed",
            "phone": "+201000000000",
            "telegram_id": 12345,
            "service_id": "SV001",
            "barber_id": "BR001",
        },
        bot=SimpleNamespace(send_message=send_message or AsyncMock()),
    )
    return update, context


def _patch_confirm_sheets(monkeypatch):
    append_reservation = Mock()
    monkeypatch.setattr(
        booking.sheets,
        "get_config",
        Mock(return_value={"host_chat_id": "123", "host_phone": "+202000000000"}),
    )
    monkeypatch.setattr(booking.sheets, "increment_booking_counter", Mock(return_value=10))
    monkeypatch.setattr(booking.sheets, "append_reservation", append_reservation)
    return append_reservation


@pytest.mark.asyncio
async def test_handle_confirm_happy_path_saves_notifies_and_confirms(monkeypatch):
    append_reservation = _patch_confirm_sheets(monkeypatch)
    update, context = _confirm_update_and_context()

    result = await booking.handle_confirm(update, context)

    assert result == ConversationHandler.END
    append_reservation.assert_called_once()
    saved_payload = append_reservation.call_args.args[0]
    assert saved_payload["booking_ref"] == "BK-000010"
    assert saved_payload["service_name"] == "Haircut"
    assert saved_payload["barber_name"] == "Omar"
    assert saved_payload["time_preference"] == "Night: 6 PM - 12 AM"
    assert saved_payload["customer_name"] == "Ahmed"
    assert saved_payload["phone"] == "+201000000000"
    assert "telegram_id" not in saved_payload
    assert "service_id" not in saved_payload
    assert "barber_id" not in saved_payload

    expected_host_text = (
        "*New Salon Reservation*\n\n"
        "Ref: BK-000010\n"
        "Service: Haircut\n"
        "Barber: Omar\n"
        "Preferred time: Night: 6 PM - 12 AM\n"
        "Customer: Ahmed\n"
        "Phone: +201000000000"
    )
    context.bot.send_message.assert_awaited_once_with(123, text=expected_host_text)
    update.callback_query.message.reply_text.assert_awaited_once_with(
        booking.t(
            "booking_confirmed",
            "en",
            ref="BK-000010",
            host_phone="+202000000000",
        ),
        parse_mode="Markdown",
    )


@pytest.mark.asyncio
async def test_handle_confirm_customer_reply_failure_ends_without_duplicate_save(monkeypatch):
    append_reservation = _patch_confirm_sheets(monkeypatch)
    failing_reply = AsyncMock(side_effect=Exception("telegram customer send failed"))
    update, context = _confirm_update_and_context(reply_text=failing_reply)

    result = await booking.handle_confirm(update, context)

    assert result == ConversationHandler.END
    append_reservation.assert_called_once()


@pytest.mark.asyncio
async def test_handle_confirm_host_notification_failure_confirms_customer_and_logs(monkeypatch, caplog):
    append_reservation = _patch_confirm_sheets(monkeypatch)
    failing_send = AsyncMock(side_effect=Exception("telegram host send failed"))
    update, context = _confirm_update_and_context(send_message=failing_send)

    with caplog.at_level("WARNING", logger=booking.__name__):
        result = await booking.handle_confirm(update, context)

    assert result == ConversationHandler.END
    append_reservation.assert_called_once()
    update.callback_query.message.reply_text.assert_awaited_once()
    assert "BK-000010" in caplog.text
    assert "host notification" in caplog.text
