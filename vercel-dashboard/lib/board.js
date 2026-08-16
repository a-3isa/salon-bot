// Server-side port of the Apps Script getBoardData / add / status / delete logic.
import { q } from './db';

export const TZ = 'Africa/Cairo';
export const CAPACITY = 3;
export const STATUS_DONE = 'done';
export const STATUS_CANCELLED = 'cancelled';

// The six 2-hour slots (mirror the bot). Order matters — display order.
export const SLOTS = [
  { id: 'S1', label: 'من 1 إلى 3 مساءً' },
  { id: 'S2', label: 'من 3 إلى 5 مساءً' },
  { id: 'S3', label: 'من 5 إلى 7 مساءً' },
  { id: 'S4', label: 'من 7 إلى 9 مساءً' },
  { id: 'S5', label: 'من 9 إلى 11 مساءً' },
  { id: 'S6', label: 'من 11 مساءً إلى 1 صباحاً' },
];

// Canonical Egyptian mobile: 20XXXXXXXXXX. (mirror normPhone_)
export function normPhone(v) {
  let s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (!s) return '';
  if (s.charAt(0) === '0') s = '2' + s;
  else if (s.length === 10 && s.charAt(0) === '1') s = '20' + s;
  return s;
}

// 'yyyy-MM-dd' for a Date in Cairo.
export function cairoDateStr(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

// 'HH:mm' for a Date in Cairo.
export function cairoTimeStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

// 'yyMMddHHmm' for the walk-in booking ref, Cairo.
export function cairoRefStamp(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}`;
}

async function readBarbers() {
  const { rows } = await q(
    `select barber_id, name, name_ar, day_off, sort_order
       from barbers where coalesce(is_available,true) = true
      order by sort_order asc, barber_id asc`
  );
  return rows.map((r) => ({
    ar: (r.name_ar || '').trim(),
    en: (r.name || '').trim(),
    dayOff: r.day_off == null ? -1 : Number(r.day_off),
  }));
}

// Mirrors getBoardData(dateStr). dateStr = 'yyyy-MM-dd' (Cairo) or null => today.
export async function getBoardData(dateStr) {
  const today = cairoDateStr();
  if (!dateStr) dateStr = today;

  const barbers = await readBarbers();
  const slotIndex = {};
  SLOTS.forEach((s, i) => { slotIndex[s.label] = i; });

  // one day, non-cancelled. booking_date NULL rows never match a date (same as sheet).
  const { rows } = await q(
    `select booking_ref, service_name, barber_name, time_preference, customer_name,
            phone, created_at, to_char(booking_date,'YYYY-MM-DD') as booking_date,
            slot, status
       from reservations
      where booking_date = $1
        and coalesce(lower(status),'') <> $2`,
    [dateStr, STATUS_CANCELLED]
  );

  const bucket = {};
  barbers.forEach((b) => { bucket[b.ar] = { slots: {}, other: [] }; });

  for (const row of rows) {
    const bAr = String(row.barber_name || '').trim();
    if (!bAr || !bucket[bAr]) continue;
    const booking = {
      customer: String(row.customer_name || '').trim(),
      phone: String(row.phone || '').trim(),
      service: String(row.service_name || '').trim(),
      ref: String(row.booking_ref || '').trim(),
      time: String(row.time_preference || '').trim(),
      created: String(row.created_at || '').trim(),
      done: String(row.status || '').trim().toLowerCase() === STATUS_DONE,
    };
    const slotLabel = String(row.slot || '').trim();
    if (slotLabel && slotIndex[slotLabel] !== undefined) {
      const sid = SLOTS[slotIndex[slotLabel]].id;
      (bucket[bAr].slots[sid] = bucket[bAr].slots[sid] || []).push(booking);
    } else {
      bucket[bAr].other.push(booking);
    }
  }

  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  const outBarbers = barbers.map((b) => {
    let total = 0;
    const slots = SLOTS.map((s) => {
      const list = bucket[b.ar].slots[s.id] || [];
      total += list.length;
      return { id: s.id, label: s.label, count: list.length, capacity: CAPACITY, bookings: list };
    });
    const other = bucket[b.ar].other || [];
    total += other.length;
    return { ar: b.ar, en: b.en, dayOff: b.dayOff === dow, total, slots, other };
  });

  return {
    date: dateStr,
    today,
    capacity: CAPACITY,
    barbers: outBarbers,
    generatedAt: cairoTimeStr(),
  };
}

export async function setStatus(ref, done) {
  ref = String(ref || '').trim();
  if (!ref) throw new Error('لا يمكن تحديد الحجز (لا يوجد رقم مرجعي).');
  const { rowCount } = await q(
    `update reservations set status = $2 where booking_ref = $1`,
    [ref, done ? STATUS_DONE : '']
  );
  if (!rowCount) throw new Error('لم يتم العثور على الحجز. قد يكون قد حُذف — حدّث الصفحة.');
  return { ref, done: !!done };
}

export async function addBooking(p) {
  p = p || {};
  const barber = String(p.barber || '').trim();
  const date = String(p.date || '').trim().slice(0, 10);
  const slot = String(p.slot || '').trim();
  const customer = String(p.customer || '').trim();
  const phone = normPhone(p.phone);
  const service = String(p.service || '').trim();

  if (!barber) throw new Error('اختر الحلاق.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('التاريخ غير صحيح.');
  if (!slot) throw new Error('اختر الموعد.');
  if (customer.length < 2) throw new Error('اكتب اسم العميل.');

  const now = new Date();
  const ref = 'W' + cairoRefStamp(now) + String(Math.floor(Math.random() * 90 + 10));
  const createdAt = cairoDateStr(now) + ' ' + cairoTimeStr(now);

  await q(
    `insert into reservations
       (booking_ref, service_name, barber_name, time_preference, customer_name,
        phone, created_at, booking_date, slot, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'')`,
    [ref, service, barber, slot, customer, phone, createdAt, date, slot]
  );
  return { ok: true, ref, date };
}

export async function deleteBooking(ref) {
  ref = String(ref || '').trim();
  if (!ref) throw new Error('لا يوجد رقم حجز.');
  const { rowCount } = await q(`delete from reservations where booking_ref = $1`, [ref]);
  if (!rowCount) throw new Error('الحجز غير موجود (قد يكون محذوفًا).');
  return { ok: true, ref };
}
