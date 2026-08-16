"""One-time script to create all sheet tabs with correct headers and seed Config data."""
import gspread
from google.oauth2.service_account import Credentials
import os
from dotenv import load_dotenv

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
creds = Credentials.from_service_account_file(os.environ["GOOGLE_CREDENTIALS_JSON"], scopes=SCOPES)
gc = gspread.authorize(creds)
spreadsheet = gc.open_by_key(os.environ["SHEET_ID"])

existing = {ws.title for ws in spreadsheet.worksheets()}

def get_or_create(title, rows=100, cols=20):
    if title in existing:
        print(f"  Sheet '{title}' already exists — skipping create")
        return spreadsheet.worksheet(title)
    ws = spreadsheet.add_worksheet(title=title, rows=rows, cols=cols)
    print(f"  Created sheet '{title}'")
    return ws

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

print("Setting up Config sheet...")
ws = get_or_create("Config")
if ws.row_values(1) == []:
    ws.append_row(["key", "value"])
    ws.append_row(["host_phone", ""])
    ws.append_row(["host_chat_id", ""])
    ws.append_row(["booking_counter", "0"])
    ws.append_row(["rules", "Please arrive during your selected Day/Night range. Contact the salon if you need to change your reservation."])
    print("  Config seeded")
else:
    records = ws.get_all_records()
    for i, row in enumerate(records, start=2):
        if row.get("key") == "host_chat_id" and not row.get("value"):
            header = ws.row_values(1)
            col = header.index("value") + 1
            ws.update_cell(i, col, "")
            print("  host_chat_id row present")
            break

# Remove default "Sheet1" if present
for ws in spreadsheet.worksheets():
    if ws.title == "Sheet1":
        spreadsheet.del_worksheet(ws)
        print("Removed default 'Sheet1'")

print("\nDone! Sheet structure is ready.")
print(f"Open your sheet: https://docs.google.com/spreadsheets/d/{os.environ['SHEET_ID']}/edit")
