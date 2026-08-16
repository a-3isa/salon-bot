# Men's Barber Salon Reservation Bot Design

## Goal

Convert the existing hostel reservation Telegram bot into a men's barber salon reservation bot. The converted bot should use a clean salon data model instead of relabeling hostel rooms and locations.

## Recommended Approach

Use a clean salon model:

- Replace hostel `Locations` and `Rooms` concepts with `Services` and `Barbers`.
- Replace `Bookings` sheet semantics with a customer-facing `Reservations` sheet.
- Remove date range, room photos, locations, and exact arrival time from the customer flow.
- Keep the existing Telegram bot structure, language selection, Google Sheets backend, reservation references, admin-only commands, and check-by-reference flow.

This approach avoids confusing code and sheet headers that still refer to rooms after the project becomes a salon bot.

## Customer Flow

1. User starts the bot and chooses language.
2. Main menu shows:
   - New Reservation
   - Check My Reservation
3. User accepts salon rules/policy.
4. User chooses one service.
5. User chooses one barber.
6. User chooses preferred time range:
   - Day: 10 AM - 6 PM
   - Night: 6 PM - 12 AM
7. User enters full name.
8. User enters phone number.
9. Bot shows a confirmation summary.
10. User confirms, changes details, or cancels.
11. Bot saves the reservation and sends an admin/group notification.

There are no exact dates, exact time slots, check-in/check-out dates, rooms, locations, room photos, or arrival-time picker.

## Initial Services

Each barber offers every available service. The initial service list is:

- Haircut
- Beard Trim
- Haircut + Beard
- Kids Haircut
- Hair Wash
- Hair Coloring
- Skin Cleaning
- Facial Mask
- Black Mask
- Hair Styling
- Hair Treatment
- Waxing / Face Cleanup

## Initial Barbers

- Omar
- Mohamed

## Google Sheets Schema

### Services

Columns:

- `service_id`
- `name`
- `is_available`

### Barbers

Columns:

- `barber_id`
- `name`
- `is_available`

### Reservations

Columns:

- `booking_ref`
- `service_name`
- `barber_name`
- `time_preference`
- `customer_name`
- `phone`
- `created_at`

The `Reservations` tab intentionally does not include `service_id`, `barber_id`, or `telegram_id`.

Sorting behavior after writing a reservation:

1. Day reservations first.
2. Night reservations second.
3. Inside each group, oldest reservations first.

### Config

Columns:

- `key`
- `value`

Required keys:

- `host_phone`
- `host_chat_id`
- `booking_counter`
- `rules`

## Reservation Behavior

- Choosing a service does not change service availability.
- Choosing a barber does not change barber availability.
- No item is automatically marked unavailable after reservation, because there are no exact time slots.
- Admins can hide services or barbers by setting `is_available` to false.
- Reservation references keep the existing `BK-000001` style.

## Admin Commands

Replace hostel room commands with salon commands:

- `/add_service <name>`
- `/remove_service <service_id>`
- `/set_service_available <service_id>`
- `/set_service_unavailable <service_id>`
- `/list_services`
- `/add_barber <name>`
- `/remove_barber <barber_id>`
- `/set_barber_available <barber_id>`
- `/set_barber_unavailable <barber_id>`
- `/list_barbers`

Remove `/upload_photo` from the main command set because the approved customer flow does not use photos.

## Customer-Facing Text Changes

Update English and Arabic strings from hostel wording to salon wording:

- Booking -> Reservation where customer-facing.
- Host -> Salon.
- Guest -> Customer.
- Room -> Barber.
- Location -> removed.
- Check-in/check-out -> removed.
- Arrival time -> Time preference.

## Error Handling

- If no services are available, tell the customer no services are currently available and end the reservation conversation.
- If no barbers are available, tell the customer no barbers are currently available and end the reservation conversation.
- If a selected service or barber is no longer found, show an error and ask the user to choose again.
- If saving to Google Sheets fails, show a generic retry/error message without exposing credentials or stack traces.
- Admin commands should return clear usage messages and not crash on missing or invalid IDs.

## Tests

Use test-first implementation for behavior changes. Tests should cover:

- Available services are filtered by `is_available`.
- Available barbers are filtered by `is_available`.
- Reservation append uses the `Reservations` header order.
- Reservation sorting keeps Day before Night and oldest first within each group.
- Reservation lookup by reference reads from `Reservations`.
- Confirmation/check-reservation display uses service, barber, time preference, customer name, and phone.
- Admin service/barber commands call the correct Sheets helpers.

## Credentials Needed

The bot needs:

- `BOT_TOKEN`: Telegram bot token from BotFather.
- `SHEET_ID`: Google Sheet document ID.
- `GOOGLE_CREDENTIALS_JSON`: path to the Google service account JSON file.
- `ADMIN_IDS`: comma-separated Telegram user IDs for admins.
- `host_chat_id`: Telegram chat or group ID for new reservation alerts, stored in `Config`.
- `host_phone`: salon phone or WhatsApp number shown to customers, stored in `Config`.

Existing `.env` and `service_account.json` files are secrets and should not be exposed in chat or committed publicly.

## Out Of Scope

- Exact date booking.
- Exact time-slot availability.
- Per-barber service restrictions.
- Payments.
- Customer cancellation/rescheduling.
- Photos or service galleries.
