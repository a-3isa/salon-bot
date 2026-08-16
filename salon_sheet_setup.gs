/**
 * Salon booking — dynamic reservations BOARD.
 *
 * HOW TO RUN
 *   1. Open the booking Google Sheet (the one with "Reservations" and "Barbers" tabs).
 *   2. Extensions → Apps Script. Paste this whole file, Save.
 *   3. Run `buildBoard` once and authorise.
 *   4. From then on, use the "🪒 Salon" menu (appears after reload) → "Rebuild board".
 *
 * WHAT IT DOES
 *   - Creates/refreshes a single "Board" tab that shows EVERY barber at the same time,
 *     each in his OWN table, laid out side-by-side.
 *   - The list of barbers is read dynamically from the "Barbers" tab (name_ar column).
 *     Add a barber there → run "Rebuild board" → a new table appears automatically.
 *   - Each table shows that barber's bookings for ONE day. The day is cell B1 and
 *     defaults to TODAY; the owner edits B1 to view any other day. (No rebuild needed
 *     to change the day — only to add/remove a barber.)
 *   - All bookings still live in the single "Reservations" sheet; the bot tags each row
 *     with barber_name, so storage is fully dynamic and needs no per-barber setup.
 */

var RESERVATIONS_SHEET = 'Reservations';
var BARBERS_SHEET = 'Barbers';
var BOARD_SHEET = 'Board';

// Columns shown in each barber's table, in order. Edit this list to change what shows.
// Keys must match Reservations header names; titles are the Arabic labels on the Board.
var DISPLAY_COLUMNS = [
  { key: 'slot',          title: 'الموعد' },
  { key: 'customer_name', title: 'العميل' },
  { key: 'phone',         title: 'الهاتف' },
  { key: 'service_name',  title: 'الخدمة' }
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🪒 Salon')
    .addItem('تحديث اللوحة / Rebuild board', 'buildBoard')
    .addToUi();
}

function buildBoard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var res = ss.getSheetByName(RESERVATIONS_SHEET);
  if (!res) throw new Error('Sheet "' + RESERVATIONS_SHEET + '" not found.');

  // Make sure the columns the bot writes exist (so filters never error).
  ensureColumn(res, 'booking_date');
  ensureColumn(res, 'slot');

  var headers = res.getRange(1, 1, 1, res.getLastColumn()).getValues()[0];
  var lastColL = columnLetter(headers.length);
  var cBarber = headers.indexOf('barber_name');
  var cDate = headers.indexOf('booking_date');
  if (cBarber === -1) throw new Error('barber_name column missing in Reservations.');
  if (cDate === -1) throw new Error('booking_date column missing in Reservations.');
  var barberColL = columnLetter(cBarber + 1);
  var dateColL = columnLetter(cDate + 1);

  // Resolve which display columns actually exist, keep their order.
  var idxs = [], heads = [];
  DISPLAY_COLUMNS.forEach(function (c) {
    var i = headers.indexOf(c.key);
    if (i !== -1) { idxs.push(i + 1); heads.push(c.title); }
  });
  if (idxs.length === 0) throw new Error('None of the display columns were found.');
  var blockW = idxs.length;
  var idxList = idxs.join(',');

  // Barbers come dynamically from the Barbers tab (name_ar = how the bot stores barber_name).
  var barbers = readBarbers(ss);
  if (barbers.length === 0) throw new Error('No barbers found in "' + BARBERS_SHEET + '" tab.');

  var board = ss.getSheetByName(BOARD_SHEET) || ss.insertSheet(BOARD_SHEET);
  board.clear();

  board.getRange('A1').setValue('اليوم / Day:').setFontWeight('bold');
  board.getRange('B1').setFormula('=TODAY()').setNumberFormat('yyyy-mm-dd');
  board.getRange('A2').setValue('غيّر B1 لعرض يوم آخر / change B1 to view another day');

  var startRow = 4;
  barbers.forEach(function (b, k) {
    var sc = 1 + k * (blockW + 1); // start column (1-based), 1 blank column between blocks

    // Title
    board.getRange(startRow, sc, 1, blockW).merge()
      .setValue(b.ar + (b.en ? ' / ' + b.en : ''))
      .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#d9ead3');

    // Count for the chosen day
    var countF = '="عدد الحجوزات: "&COUNTIFS(' +
      RESERVATIONS_SHEET + '!$' + barberColL + ':$' + barberColL + ',"' + b.ar + '",' +
      RESERVATIONS_SHEET + '!$' + dateColL + ':$' + dateColL + ',TEXT($B$1,"yyyy-mm-dd"))';
    board.getRange(startRow + 1, sc).setFormula(countF);

    // Column headers
    board.getRange(startRow + 2, sc, 1, blockW).setValues([heads])
      .setFontWeight('bold').setBackground('#f3f3f3');

    // Live table: this barber's rows for the day in B1
    // booking_date may be stored as text OR auto-parsed to a date by Sheets — wrap both sides
    // in TEXT() so the match works either way (COUNTIFS coerces, but FILTER compares strictly).
    var dataF = '=IFERROR(CHOOSECOLS(FILTER(' +
      RESERVATIONS_SHEET + '!$A$2:$' + lastColL + ',' +
      RESERVATIONS_SHEET + '!$' + barberColL + '$2:$' + barberColL + '="' + b.ar + '",' +
      'TEXT(' + RESERVATIONS_SHEET + '!$' + dateColL + '$2:$' + dateColL + ',"yyyy-mm-dd")=TEXT($B$1,"yyyy-mm-dd")),' +
      idxList + '),"— لا حجوزات في هذا اليوم —")';
    board.getRange(startRow + 3, sc).setFormula(dataF);

    board.setColumnWidths(sc, blockW, 130);
  });

  board.setFrozenRows(startRow + 2);
  ss.toast('Board rebuilt for ' + barbers.length + ' barber(s). Edit B1 to change the day.');
}

function readBarbers(ss) {
  var sh = ss.getSheetByName(BARBERS_SHEET);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var h = vals[0];
  var nAr = h.indexOf('name_ar');
  var nEn = h.indexOf('name');
  var out = [];
  for (var r = 1; r < vals.length; r++) {
    var ar = nAr !== -1 ? String(vals[r][nAr]).trim() : '';
    if (!ar) continue;
    out.push({ ar: ar, en: nEn !== -1 ? String(vals[r][nEn]).trim() : '' });
  }
  return out;
}

function ensureColumn(sheet, name) {
  var headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  if (headers.indexOf(name) !== -1) return;
  sheet.getRange(1, sheet.getLastColumn() + 1).setValue(name);
}

function columnLetter(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
