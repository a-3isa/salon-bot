"""Seed standard services and initial barbers."""
import gspread
from google.oauth2.service_account import Credentials
import os
from dotenv import load_dotenv

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
creds = Credentials.from_service_account_file(os.environ["GOOGLE_CREDENTIALS_JSON"], scopes=SCOPES)
gc = gspread.authorize(creds)
spreadsheet = gc.open_by_key(os.environ["SHEET_ID"])

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
