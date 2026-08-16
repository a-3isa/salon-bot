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
