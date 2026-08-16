import time
import gspread
from google.oauth2.service_account import Credentials
import config

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

_gc: gspread.Client | None = None
_gc_created_at: float = 0
_GC_TTL = 1800  # reuse client for 30 minutes, then refresh


def _client() -> gspread.Client:
    global _gc, _gc_created_at
    if _gc is None or (time.time() - _gc_created_at) > _GC_TTL:
        creds = Credentials.from_service_account_file(config.GOOGLE_CREDENTIALS_JSON, scopes=SCOPES)
        _gc = gspread.authorize(creds)
        _gc_created_at = time.time()
    return _gc


_cache: dict = {}
_cache_ts: dict = {}
_CACHE_TTL = 30  # TTL in seconds
DAY_PREFERENCE = "Day: 10 AM - 6 PM"
NIGHT_PREFERENCE = "Night: 6 PM - 12 AM"


def _cached(key: str, loader):
    now = time.time()
    if key not in _cache or (now - _cache_ts.get(key, 0)) > _CACHE_TTL:
        _cache[key] = loader()
        _cache_ts[key] = now
    return _cache[key]


def _invalidate(key: str):
    _cache.pop(key, None)
    _cache_ts.pop(key, None)


def _worksheet(name: str) -> gspread.Worksheet:
    return _client().open_by_key(config.SHEET_ID).worksheet(name)


def get_config() -> dict:
    ws = _worksheet("Config")
    return {row["key"]: row["value"] for row in ws.get_all_records()}


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


def increment_booking_counter() -> int:
    ws = _worksheet("Config")
    cell = ws.find("booking_counter", in_column=1)
    if cell is None:
        raise ValueError("booking_counter key missing from Config sheet")
    header = ws.row_values(1)
    val_col = header.index("value") + 1
    current = int(ws.cell(cell.row, val_col).value or 0)
    new_val = current + 1
    ws.update_cell(cell.row, val_col, new_val)
    return new_val


def append_reservation(data: dict) -> None:
    ws = _worksheet("Reservations")
    header = ws.row_values(1)
    ws.append_row([data.get(col, "") for col in header])
    sort_reservations()


def get_reservation_by_ref(ref: str) -> dict | None:
    rows = _worksheet("Reservations").get_all_records()
    return next((r for r in rows if r["booking_ref"] == ref), None)


def _reservation_sort_key(row: dict) -> tuple[int, str, str]:
    tp = str(row.get("time_preference", ""))
    is_day = DAY_PREFERENCE in tp or "نهار" in tp
    preference_rank = 0 if is_day else 1
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


