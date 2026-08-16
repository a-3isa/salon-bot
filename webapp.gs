/**
 * Salon Reservations — premium Web App dashboard (mobile + PC).
 *
 * SETUP (one time)
 *   1. Open the booking Google Sheet → Extensions → Apps Script.
 *   2. Add this file's code to the project (a .gs file).
 *   3. Add an HTML file named EXACTLY  Index  (File → New → HTML) and paste
 *      webapp_index.html into it.
 *   4. Deploy → New deployment → type "Web app".
 *        - Execute as: Me
 *        - Who has access: choose "Only myself" (private) or "Anyone with the link"
 *          if you want to share the URL with your barbers. NOTE: the page shows
 *          customer phone numbers, so prefer the most restrictive option that works.
 *   5. Open the Web app URL on your phone or PC. Add it to your home screen for an
 *      app-like experience.
 *
 * The dashboard is READ-ONLY and live: it reads the same Reservations sheet the bot
 * writes to, groups bookings by barber and by 2-hour slot, and shows capacity (x/3).
 */

// The booking spreadsheet ID (from its URL: /spreadsheets/d/<ID>/edit).
var SHEET_ID = '1liMVjPZ9cRbqEVmBnAIn4syOCv6a3QU3v5cHvc0E0n0';
var SHEET_RES = 'Reservations';
var SHEET_BARBERS = 'Barbers';
var TZ = 'Africa/Cairo';
var CAPACITY = 3;

// Booking lifecycle: a barber can mark a served customer "done" from the dashboard.
// Stored in a "status" column on Reservations. Empty = active, "done" = served.
var STATUS_COL = 'status';
var STATUS_DONE = 'done';
var STATUS_CANCELLED = 'cancelled';   // set by the bot when a client cancels

/**
 * Canonical Egyptian mobile: 20XXXXXXXXXX.
 * Sheets stores the phone cell as a NUMBER, so a leading 0 is silently stripped
 * ("01013800670" -> 1013800670) which broke the 1h reminder. Saving it already
 * prefixed with "20" means there is no leading zero to lose.
 */
function normPhone_(v) {
  var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (!s) return '';
  if (s.charAt(0) === '0') s = '2' + s;                          // 01xxxxxxxxx -> 201xxxxxxxxx
  else if (s.length === 10 && s.charAt(0) === '1') s = '20' + s; // 0 already eaten
  return s;
}

// The six 2-hour slots (mirror the bot). Order matters — this is the display order.
var SLOTS = [
  { id: 'S1', label: 'من 1 إلى 3 مساءً' },
  { id: 'S2', label: 'من 3 إلى 5 مساءً' },
  { id: 'S3', label: 'من 5 إلى 7 مساءً' },
  { id: 'S4', label: 'من 7 إلى 9 مساءً' },
  { id: 'S5', label: 'من 9 إلى 11 مساءً' },
  { id: 'S6', label: 'من 11 مساءً إلى 1 صباحاً' }
];

// Fallback day-off per barber (JS getDay: Sun=0..Sat=6), used only if the Barbers
// tab has no "day_off" column. Mirrors the bot: Omar=Mon(1), Mohamed=Tue(2).
var DAY_OFF_FALLBACK = { 'عمر': 1, 'محمد': 2 };

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('لوحة حجوزات الصالون')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Opens the booking sheet by ID. When the web app is deployed with
 * "Execute as: User accessing the web app", this only succeeds if the visitor
 * has access to the sheet — so the sheet's own sharing IS the access control.
 */
function openBookingSheet_() {
  try {
    return SpreadsheetApp.openById(SHEET_ID);
  } catch (e) {
    throw new Error('ليس لديك صلاحية الوصول لهذه اللوحة. اطلب من المالك مشاركة جدول الحجوزات معك بنفس البريد.');
  }
}

/**
 * Returns the full board for one day.
 * @param {string|null} dateStr  'yyyy-MM-dd' (Cairo). null/empty => today.
 */
function getBoardData(dateStr) {
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  if (!dateStr) dateStr = today;

  var ss = openBookingSheet_();
  var res = ss.getSheetByName(SHEET_RES);
  if (!res) throw new Error('Sheet "' + SHEET_RES + '" not found.');

  var values = res.getDataRange().getValues();
  var H = values[0] || [];
  var col = {
    barber: H.indexOf('barber_name'),
    date: H.indexOf('booking_date'),
    slot: H.indexOf('slot'),
    cust: H.indexOf('customer_name'),
    phone: H.indexOf('phone'),
    svc: H.indexOf('service_name'),
    ref: H.indexOf('booking_ref'),
    time: H.indexOf('time_preference'),
    created: H.indexOf('created_at'),
    status: H.indexOf(STATUS_COL)
  };

  var barbers = readBarbers(ss); // [{ar, en, dayOff}]
  var slotIndex = {};
  SLOTS.forEach(function (s, i) { slotIndex[s.label] = i; });

  // bucket[barberAr][slotId] = [bookings]; plus "other" bucket for legacy/unknown slots
  var bucket = {};
  barbers.forEach(function (b) { bucket[b.ar] = { slots: {}, other: [] }; });

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var bAr = col.barber !== -1 ? String(row[col.barber]).trim() : '';
    if (!bAr || !bucket[bAr]) continue;
    if (cellDate(row[col.date]) !== dateStr) continue;
    // Client-cancelled bookings (via the bot) are hidden and free their slot.
    if (col.status !== -1 && String(row[col.status]).trim().toLowerCase() === STATUS_CANCELLED) continue;

    var booking = {
      customer: col.cust !== -1 ? String(row[col.cust]).trim() : '',
      phone: col.phone !== -1 ? String(row[col.phone]).trim() : '',
      service: col.svc !== -1 ? String(row[col.svc]).trim() : '',
      ref: col.ref !== -1 ? String(row[col.ref]).trim() : '',
      time: col.time !== -1 ? String(row[col.time]).trim() : '',
      created: col.created !== -1 ? String(row[col.created]).trim() : '',
      done: col.status !== -1 && String(row[col.status]).trim().toLowerCase() === STATUS_DONE
    };
    var slotLabel = col.slot !== -1 ? String(row[col.slot]).trim() : '';
    if (slotLabel && slotIndex[slotLabel] !== undefined) {
      var sid = SLOTS[slotIndex[slotLabel]].id;
      (bucket[bAr].slots[sid] = bucket[bAr].slots[sid] || []).push(booking);
    } else {
      bucket[bAr].other.push(booking);
    }
  }

  var dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  var outBarbers = barbers.map(function (b) {
    var total = 0;
    var slots = SLOTS.map(function (s) {
      var list = bucket[b.ar].slots[s.id] || [];
      total += list.length;
      return { id: s.id, label: s.label, count: list.length, capacity: CAPACITY, bookings: list };
    });
    var other = bucket[b.ar].other || [];
    total += other.length;
    return {
      ar: b.ar, en: b.en,
      dayOff: (b.dayOff === dow),
      total: total,
      slots: slots,
      other: other
    };
  });

  return {
    date: dateStr,
    today: today,
    capacity: CAPACITY,
    barbers: outBarbers,
    generatedAt: Utilities.formatDate(new Date(), TZ, 'HH:mm')
  };
}

/**
 * Toggle a booking's served state. Called from the dashboard.
 * Identified by booking_ref (unique per booking). Creates the "status" column
 * on first use. Guarded by a lock so two barbers can't clobber each other.
 * @param {string} ref   booking_ref of the row to update.
 * @param {boolean} done true => mark served ("done"), false => reactivate ("").
 * @return {{ref:string, done:boolean}}
 */
function setStatus(ref, done) {
  ref = String(ref || '').trim();
  if (!ref) throw new Error('لا يمكن تحديد الحجز (لا يوجد رقم مرجعي).');

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = openBookingSheet_();
    var res = ss.getSheetByName(SHEET_RES);
    if (!res) throw new Error('Sheet "' + SHEET_RES + '" not found.');

    var lastCol = res.getLastColumn();
    var headers = res.getRange(1, 1, 1, lastCol).getValues()[0];
    var refIdx = headers.indexOf('booking_ref');
    if (refIdx === -1) throw new Error('عمود booking_ref غير موجود في جدول الحجوزات.');

    // Ensure the status column exists; create it at the end if missing.
    var statusIdx = headers.indexOf(STATUS_COL);
    if (statusIdx === -1) {
      statusIdx = lastCol;                 // 0-based index of the new column
      res.getRange(1, lastCol + 1).setValue(STATUS_COL);
    }

    // Find the row whose booking_ref matches.
    var lastRow = res.getLastRow();
    if (lastRow < 2) throw new Error('لا توجد حجوزات.');
    var refCol = res.getRange(2, refIdx + 1, lastRow - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < refCol.length; i++) {
      if (String(refCol[i][0]).trim() === ref) { targetRow = i + 2; break; }
    }
    if (targetRow === -1) throw new Error('لم يتم العثور على الحجز. قد يكون قد حُذف — حدّث الصفحة.');

    res.getRange(targetRow, statusIdx + 1).setValue(done ? STATUS_DONE : '');
    SpreadsheetApp.flush();
    return { ref: ref, done: !!done };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manually add a walk-in booking from the dashboard. Appends a row to
 * Reservations, mapping fields to whatever columns exist (header-driven, so it
 * won't break if the sheet layout changes). Generates a booking_ref.
 * @param {{barber:string,date:string,slot:string,customer:string,phone:string,service:string}} p
 * @return {{ok:boolean, ref:string, date:string}}
 */
function addBooking(p) {
  p = p || {};
  var barber = String(p.barber || '').trim();
  var date = String(p.date || '').trim().slice(0, 10);
  var slot = String(p.slot || '').trim();
  var customer = String(p.customer || '').trim();
  var phone = normPhone_(p.phone);   // canonical 20XXXXXXXXXX (see normPhone_)
  var service = String(p.service || '').trim();

  if (!barber) throw new Error('اختر الحلاق.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('التاريخ غير صحيح.');
  if (!slot) throw new Error('اختر الموعد.');
  if (customer.length < 2) throw new Error('اكتب اسم العميل.');

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = openBookingSheet_();
    var res = ss.getSheetByName(SHEET_RES);
    if (!res) throw new Error('Sheet "' + SHEET_RES + '" not found.');

    var lastCol = res.getLastColumn();
    var headers = res.getRange(1, 1, 1, lastCol).getValues()[0];

    var now = new Date();
    var ref = 'W' + Utilities.formatDate(now, TZ, 'yyMMddHHmm') + Math.floor(Math.random() * 90 + 10);
    var createdAt = Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm');

    var vals = {
      barber_name: barber,
      booking_date: date,
      slot: slot,
      customer_name: customer,
      phone: phone,
      service_name: service,
      booking_ref: ref,
      time_preference: slot,
      created_at: createdAt,
      status: ''
    };

    var row = new Array(headers.length).fill('');
    for (var i = 0; i < headers.length; i++) {
      var key = String(headers[i]).trim();
      if (vals.hasOwnProperty(key)) row[i] = vals[key];
    }
    res.appendRow(row);
    SpreadsheetApp.flush();
    return { ok: true, ref: ref, date: date };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Hard-delete a booking row by booking_ref. Frees the slot immediately (once the
 * bot counts availability from the sheet). Returns {ok, ref}.
 * @param {string} ref
 */
function deleteBooking(ref) {
  ref = String(ref || '').trim();
  if (!ref) throw new Error('لا يوجد رقم حجز.');

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = openBookingSheet_();
    var res = ss.getSheetByName(SHEET_RES);
    if (!res) throw new Error('Sheet "' + SHEET_RES + '" not found.');

    var values = res.getDataRange().getValues();
    var H = values[0] || [];
    var cRef = H.indexOf('booking_ref');
    if (cRef === -1) throw new Error('عمود booking_ref غير موجود.');

    // Scan bottom-up so row indexes stay valid; delete the first match.
    for (var r = values.length - 1; r >= 1; r--) {
      if (String(values[r][cRef]).trim() === ref) {
        res.deleteRow(r + 1); // +1: sheet rows are 1-based, header is row 1
        SpreadsheetApp.flush();
        return { ok: true, ref: ref };
      }
    }
    throw new Error('الحجز غير موجود (قد يكون محذوفًا).');
  } finally {
    lock.releaseLock();
  }
}

function readBarbers(ss) {
  var sh = ss.getSheetByName(SHEET_BARBERS);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var h = vals[0];
  var nAr = h.indexOf('name_ar'), nEn = h.indexOf('name'), nOff = h.indexOf('day_off');
  var out = [];
  for (var r = 1; r < vals.length; r++) {
    var ar = nAr !== -1 ? String(vals[r][nAr]).trim() : '';
    if (!ar) continue;
    var en = nEn !== -1 ? String(vals[r][nEn]).trim() : '';
    var dayOff = nOff !== -1 ? parseDayOff(vals[r][nOff]) : (DAY_OFF_FALLBACK[ar] !== undefined ? DAY_OFF_FALLBACK[ar] : -1);
    out.push({ ar: ar, en: en, dayOff: dayOff });
  }
  return out;
}

function parseDayOff(v) {
  if (v === '' || v === null || v === undefined) return -1;
  if (typeof v === 'number') return v;
  var s = String(v).trim().toLowerCase();
  var map = {
    'sun': 0, 'sunday': 0, 'الأحد': 0, 'الاحد': 0,
    'mon': 1, 'monday': 1, 'الإثنين': 1, 'الاثنين': 1,
    'tue': 2, 'tuesday': 2, 'الثلاثاء': 2,
    'wed': 3, 'wednesday': 3, 'الأربعاء': 3, 'الاربعاء': 3,
    'thu': 4, 'thursday': 4, 'الخميس': 4,
    'fri': 5, 'friday': 5, 'الجمعة': 5,
    'sat': 6, 'saturday': 6, 'السبت': 6
  };
  if (map[s] !== undefined) return map[s];
  var n = parseInt(s, 10);
  return isNaN(n) ? -1 : n;
}

function cellDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v).trim().slice(0, 10);
}
