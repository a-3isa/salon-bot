import { workflow, node, trigger, expr, newCredential, switchCase, ifElse, placeholder } from '@n8n/workflow-sdk';

// NOTE: This file mirrors the LIVE workflow iwANa0BUrf4haJoq ("Salon WhatsApp Booking Bot").
// Source of truth is the deployed n8n workflow; this is a readable reference.
//
// Services + barbers are now stored INLINE in Process Message (no longer read from
// Google Sheets). Booking flow: Service -> Barber -> Day -> 2-hour Slot -> Name -> Confirm.
// Each barber has a weekday day_off; each 2-hour slot holds SLOT_CAPACITY (3) clients per
// barber per day, tracked in Workflow Static Data. The Day/Slot steps only show options the
// chosen barber is actually available for.

// Legacy Google Sheet — kept for reference only. Reservations now live in Postgres
// (Supabase project mdwutpkrimtiwmfazpoi, table `reservations`).
const SHEET_ID = '1liMVjPZ9cRbqEVmBnAIn4syOCv6a3QU3v5cHvc0E0n0';
const PG_CREDENTIAL = 'Salon Postgres';
// Shared projection: every column the bot/reminder code reads, with booking_date
// rendered as 'YYYY-MM-DD' and NULLs flattened to '' so the existing JS keeps working.
const RES_SELECT = [
  'select booking_ref, service_name, barber_name, time_preference, customer_name,',
  "       coalesce(phone,'') as phone, created_at,",
  "       coalesce(to_char(booking_date,'YYYY-MM-DD'),'') as booking_date,",
  "       coalesce(slot,'') as slot, coalesce(status,'') as status,",
  "       coalesce(reminded_at,'') as reminded_at",
  '  from reservations'
].join('\n');
const PHONE_NUMBER_ID = '1136333829565655'; // +20 15 52332137 (WABA Eisa's company 967480272998055)
const GRAPH_URL = 'https://graph.facebook.com/v21.0/' + PHONE_NUMBER_ID + '/messages';
// Real token intentionally NOT committed. The live value is baked into the
// "Notify Barber (Telegram)" node URL on workflow ValuwlCKXRdDokCC (bot @salon_res_bot);
// copy it from there before re-creating this workflow from this file.
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '<TELEGRAM_BOT_TOKEN>';
const TELEGRAM_URL = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage';
// Bookings post to the shared barbers' group (bot is a member — no per-user Start needed).
const TELEGRAM_GROUP = '-5556274644';

// ─── TRIGGER ────────────────────────────────────────────────────
const waTrigger = trigger({
  type: 'n8n-nodes-base.whatsAppTrigger',
  version: 1,
  credentials: { whatsAppTriggerApi: newCredential('WhatsApp OAuth account') },
  config: {
    name: 'WhatsApp Trigger',
    parameters: { updates: ['messages'], options: { messageStatusUpdates: [] } }
  }
});

// ─── NORMALIZE (text + interactive button/list replies) ─────────
const normalizeMsg = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Normalize Message',
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'f1', name: 'from', value: expr("{{ $json.messages?.[0]?.from ?? '' }}"), type: 'string' },
          { id: 'f2', name: 'body', value: expr("{{ ($json.messages?.[0]?.text?.body ?? $json.messages?.[0]?.interactive?.button_reply?.id ?? $json.messages?.[0]?.interactive?.list_reply?.id ?? $json.messages?.[0]?.interactive?.nfm_reply?.response_json ?? '').trim() }}"), type: 'string' },
          { id: 'f3', name: 'msgType', value: expr("{{ (['text','interactive'].indexOf($json.messages?.[0]?.type) !== -1) ? 'text' : ($json.messages?.[0]?.type ?? 'status') }}"), type: 'string' },
          { id: 'f5', name: 'profileName', value: expr("{{ ($json.contacts?.[0]?.profile?.name ?? '').trim() }}"), type: 'string' },
          // Drop stale/retried webhooks (e.g. WhatsApp re-delivering an hours-old message): only "ok" passes the filter.
          { id: 'f4', name: 'recent', value: expr("{{ (!$json.messages?.[0]?.timestamp || (Date.now()/1000 - Number($json.messages?.[0]?.timestamp)) <= 600) ? 'ok' : 'stale' }}"), type: 'string' }
        ]
      }
    }
  },
  output: [{ from: '201011130090', body: 'hello', msgType: 'text' }]
});

// ─── FILTER: TEXT/INTERACTIVE & RECENT ONLY ─────────────────────
const filterText = ifElse({
  version: 2.3,
  config: {
    name: 'Text Messages Only',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
        conditions: [
          { id: 'c-msgtype', leftValue: expr('{{ $json.msgType }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'text' },
          { id: 'c-recent', leftValue: expr('{{ $json.recent }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'ok' }
        ],
        combinator: 'and'
      }
    }
  }
});

// ─── LOAD SESSION (Code — reads Workflow Static Data) ────────────
const loadSession = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Load Session',
    alwaysOutputData: true,
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
var staticData = $getWorkflowStaticData('global');
var from = $('Normalize Message').first().json.from;
var sessions = staticData.sessions || {};
var sess = sessions[from] || {};
return [{ json: {
  phone: from,
  step: sess.step || '',
  lang: sess.lang || '',
  service_name: sess.service_name || '',
  service_ids: sess.service_ids || '',
  barber_id: sess.barber_id || '',
  barber_name: sess.barber_name || '',
  booking_date: sess.booking_date || '',
  day_label: sess.day_label || '',
  slot_id: sess.slot_id || '',
  slot_label: sess.slot_label || '',
  time_preference: sess.time_preference || '',
  customer_name: sess.customer_name || '',
  customer_phone: sess.customer_phone || '',
  editing: sess.editing || '',
  pending_ref: sess.pending_ref || ''
} }];
`
    }
  },
  output: [{ phone: '201011130090', step: '', lang: '', service_name: '', barber_name: '', time_preference: '', customer_name: '', customer_phone: '' }]
});

// ─── READ RESERVATIONS ──────────────────────────────────────────
// Feeds Process Message the live bookings so slot availability is computed
// from Postgres (single source of truth) — manual adds/deletes (dashboard) and
// bot bookings all count. alwaysOutputData so an empty table still runs the flow.
// booking_date is cast with to_char so downstream code keeps comparing plain
// 'YYYY-MM-DD' strings (a raw `date` column would arrive as an ISO timestamp).
const readReservations = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  credentials: { postgres: newCredential(PG_CREDENTIAL) },
  config: {
    name: 'Read Reservations',
    alwaysOutputData: true,
    parameters: {
      operation: 'executeQuery',
      query: RES_SELECT + ' order by id',
      options: {}
    }
  },
  output: [{}]
});

// ─── MAIN STATE MACHINE ─────────────────────────────────────────
// Arabic-only. Services + barbers are inline. Builds WhatsApp interactive
// button/list payloads (waPayload); slot counts come from the Reservations
// sheet (Read Reservations); only sessions live in Workflow Static Data.
const processMsg = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Process Message',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
var staticData = $getWorkflowStaticData('global');

// ===== Inline catalog (moved out of Google Sheets) =====
var allServices = [
  { service_id:'SV001', name:'Haircut', name_ar:'قص الشعر' },
  { service_id:'SV002', name:'Beard Trim', name_ar:'قص اللحية' },
  { service_id:'SV005', name:'Hair Wash', name_ar:'خيط wax' },
  { service_id:'SV006', name:'Hair Coloring', name_ar:'بخار' },
  { service_id:'SV007', name:'Skin Cleaning', name_ar:'تنظيف البشرة' },
  { service_id:'SV008', name:'Facial Mask', name_ar:'ماسك' },
  { service_id:'SV009', name:'Black Mask', name_ar:'سشوار' },
  { service_id:'SV010', name:'Hair Styling', name_ar:'ماسك للشعر' }
];
// day_off uses JS getUTCDay(): Sun=0 Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6
var allBarbers = [
  { barber_id:'BR001', name:'Omar', name_ar:'عمر', day_off:1, telegram:'1170200180' },
  { barber_id:'BR002', name:'Mohamed', name_ar:'محمد', day_off:2, telegram:'1148578378' }
];
// Salon hours 1PM-1AM split into six 2-hour slots. end is the Cairo hour the slot ends (S6 ends 1AM = 25).
var SLOTS = [
  { id:'S1', label:'من 1 إلى 3 مساءً', end:15 },
  { id:'S2', label:'من 3 إلى 5 مساءً', end:17 },
  { id:'S3', label:'من 5 إلى 7 مساءً', end:19 },
  { id:'S4', label:'من 7 إلى 9 مساءً', end:21 },
  { id:'S5', label:'من 9 إلى 11 مساءً', end:23 },
  { id:'S6', label:'من 11 مساءً إلى 1 صباحاً', end:25 }
];
var SLOT_CAPACITY = 3;

var msg = $('Normalize Message').first().json;
var sessionRaw = $('Load Session').first().json;

var from = msg.from;
var rawBody = (msg.body || '').trim();
var profileName = (msg.profileName || '').trim();
var NL = String.fromCharCode(10);
var waNum = from.charAt(0)==='+'?from:('+'+from);

var normDigits = function(s){ return s.replace(/[٠-٩]/g, function(c){ return String(c.charCodeAt(0)-0x0660); }); };
var normAr = function(s){ return s.replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[ً-ٟ]/g,''); };
var norm = function(s){ return normAr(normDigits(s)).toLowerCase().trim(); };

var body = normDigits(rawBody).trim();
var bodyN = norm(rawBody);

var lang = 'ar';
var step = sessionRaw.step || 'WELCOME';
var serviceName = sessionRaw.service_name || '';
var selectedIds = sessionRaw.service_ids ? String(sessionRaw.service_ids).split(',').filter(Boolean) : [];
var barberId = sessionRaw.barber_id || '';
var barberName = sessionRaw.barber_name || '';
var bookingDate = sessionRaw.booking_date || '';
var dayLabel = sessionRaw.day_label || '';
var slotId = sessionRaw.slot_id || '';
var slotLabel = sessionRaw.slot_label || '';
var timePreference = sessionRaw.time_preference || '';
var customerName = sessionRaw.customer_name || '';
var customerPhone = sessionRaw.customer_phone || '';
var editing = sessionRaw.editing || '';
var pendingRef = sessionRaw.pending_ref || '';   // booking being changed/cancelled

var SALON = 'اهلا بك في صالون محمد وعمر للحلاقة';
var SALON_PHONE = '01280800867 - 01285588096';

function clip(s,n){ s=String(s); return s.length>n ? s.substring(0,n) : s; }
function btn(id,title){ return { type:'reply', reply:{ id:String(id), title:clip(title,20) } }; }
function row(id,title,desc){ var r={ id:String(id), title:clip(title,24) }; if(desc){ r.description=clip(desc,72); } return r; }
function iButtons(text,buttons){ return { type:'button', body:{ text:clip(text,1024) }, action:{ buttons:buttons } }; }
function iList(text,buttonLabel,rows){ return { type:'list', body:{ text:clip(text,1024) }, action:{ button:clip(buttonLabel,20), sections:[{ rows:rows }] } }; }

function sidOf(sv,i){ return String(sv.service_id || ('IDX'+(i+1))); }
function svcById(id){ for(var i=0;i<allServices.length;i++){ if(sidOf(allServices[i],i)===id) return allServices[i]; } return null; }
function svcNameById(id){ var s=svcById(id); return s?(s.name_ar||s.name):null; }
function selNames(){ return selectedIds.map(svcNameById).filter(Boolean); }
function barberById(id){ for(var i=0;i<allBarbers.length;i++){ if(allBarbers[i].barber_id===id) return allBarbers[i]; } return null; }

function showServicesText(p){
  p=p||'';
  return p + SALON + NL + 'اختر خدماتك واكتب الأرقام مفصولة بمسافة:' + NL +
    allServices.map(function(sv,i){ return (i+1)+'. '+(sv.name_ar||sv.name); }).join(NL);
}
function summaryText(){
  return 'راجع حجزك:' + NL + NL +
    'الخدمة: ' + serviceName + NL +
    'الحلاق: ' + barberName + NL +
    'الوقت: ' + timePreference + NL +
    'الاسم: ' + customerName + NL +
    'الهاتف: ' + customerPhone;
}

var months_ar = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var days_ar = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
// Dates computed in Africa/Cairo (server runs UTC) so "today" is correct in Egypt.
var cairoToday = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo' }).format(new Date());
var cairoHour = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Cairo', hour:'2-digit', hour12:false }).format(new Date()), 10);
var cairoNow = cairoToday + ' ' + new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Cairo', hour:'2-digit', minute:'2-digit', hour12:false }).format(new Date());
function cairoDate(off){ var d=new Date(cairoToday+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+off); return d; }
function isoForOff(off){ return cairoDate(off).toISOString().slice(0,10); }
function offOfIso(iso){ return Math.round((new Date(iso+'T12:00:00Z') - new Date(cairoToday+'T12:00:00Z'))/86400000); }
function dayLabelOff(off){ var d=cairoDate(off); return off===0?'اليوم':(off===1?'غداً':(days_ar[d.getUTCDay()]+' '+d.getUTCDate()+' '+months_ar[d.getUTCMonth()])); }

// ===== Capacity: counted live from the Reservations sheet (single source of truth) =====
// Rows come from the "Read Reservations" node. Manual adds/deletes (webview) and bot
// bookings all live in the sheet, so availability is always accurate. No more static
// slotCounts (which drifted from the sheet and clobbered under concurrency).
var resRows = [];
try { resRows = $('Read Reservations').all().map(function(it){ return it.json; }); } catch(e) { resRows = []; }
function barberNameById(bId){ var b=barberById(bId); return b ? (b.name_ar||b.name) : ''; }
function rowStatus(r){ return String(r.status==null?'':r.status).trim().toLowerCase(); }
function slotCount(iso,bId,sId){
  var bn=barberNameById(bId); var sl=slotById(sId); var lbl=sl?sl.label:'';
  var c=0;
  for(var i=0;i<resRows.length;i++){
    var r=resRows[i];
    if(rowStatus(r)==='cancelled') continue; // cancelled frees the seat
    if(String(r.booking_date).slice(0,10)===iso && String(r.barber_name).trim()===bn && String(r.slot).trim()===lbl) c++;
  }
  return c;
}

// ===== One-booking-per-client: find this client's live booking =====
// Sheets returns phone as a NUMBER (leading + lost, a leading 0 stripped), so
// normalise both sides before comparing.
function normPhone(v){
  var s=String(v==null?'':v).replace(/[^0-9]/g,'');
  if(!s) return '';
  if(s.charAt(0)==='0') s='2'+s;                             // 01xxxxxxxxx -> 201xxxxxxxxx
  else if(s.length===10 && s.charAt(0)==='1') s='20'+s;      // numeric cell ate the leading 0
  return s;
}
var myPhone = normPhone(from);
function slotPassedLabel(iso,lbl){
  if(iso!==cairoToday) return false;
  for(var i=0;i<SLOTS.length;i++){ if(SLOTS[i].label===lbl) return cairoHour>=SLOTS[i].end; }
  return false;
}
// Soonest not-yet-past, not-cancelled booking for this phone.
function findActiveBooking(){
  var best=null, bestIso='';
  for(var i=0;i<resRows.length;i++){
    var r=resRows[i];
    if(normPhone(r.phone)!==myPhone) continue;
    if(rowStatus(r)==='cancelled') continue;
    var iso=String(r.booking_date==null?'':r.booking_date).slice(0,10);
    if(!iso || iso<cairoToday) continue;
    if(iso===cairoToday && slotPassedLabel(iso,String(r.slot).trim())) continue;
    if(!best || iso<bestIso){ best=r; bestIso=iso; }
  }
  return best;
}
function barberIdByName(nm){
  nm=String(nm||'').trim();
  for(var i=0;i<allBarbers.length;i++){ if((allBarbers[i].name_ar||allBarbers[i].name)===nm) return allBarbers[i].barber_id; }
  return '';
}
function slotPassed(off,s){ if(off!==0) return false; if(cairoHour<13) return false; return cairoHour>=s.end; }
function availSlots(off,iso,bId){ return SLOTS.filter(function(s){ return !slotPassed(off,s) && slotCount(iso,bId,s.id)<SLOT_CAPACITY; }); }
function slotById(id){ for(var i=0;i<SLOTS.length;i++){ if(SLOTS[i].id===id) return SLOTS[i]; } return null; }

// Merged step: shows chosen services + barber options + an edit-services option.
function showBarber(p){
  p=p||'';
  var text=p+'اخترت: '+serviceName+NL+NL+'اختر الحلاق:';
  if(allBarbers.length<=2){
    var btns = allBarbers.map(function(b,i){ return btn(i+1, b.name_ar||b.name); });
    btns.push(btn('EDIT','تعديل الخدمات'));
    return { t:text, i:iButtons(text, btns) };
  }
  var rows = allBarbers.map(function(b,i){ return row(i+1, b.name_ar||b.name); });
  rows.push(row('EDIT','تعديل الخدمات','تغيير الخدمات المختارة'));
  return { t:text, i:iList(text, 'اختر', rows) };
}

// Day = today..+7, skipping the barber's day_off and any day with no free slots.
function bookableDays(bId){
  var b=barberById(bId); var dayOff=b?b.day_off:-1; var out=[];
  for(var o=0;o<=7;o++){
    var d=cairoDate(o);
    if(d.getUTCDay()===dayOff) continue;
    if(availSlots(o, isoForOff(o), bId).length===0) continue;
    out.push(o);
  }
  return out;
}
function showDay(p){
  p=p||'';
  var offs=bookableDays(barberId);
  if(offs.length===0){ return { t:'لا توجد مواعيد متاحة لهذا الحلاق حالياً. اكتب 0 للرجوع.', i:null }; }
  var text=p+'اختر اليوم:';
  var rows=offs.map(function(o){
    var d=cairoDate(o); var wd=days_ar[d.getUTCDay()]; var ds=d.getUTCDate()+' '+months_ar[d.getUTCMonth()];
    var title=o===0?'اليوم':(o===1?'غداً':(wd+' '+ds));
    var desc=o<=1?(wd+' '+ds):'';
    return row('D'+o, title, desc);
  });
  return { t:text, i:iList(text, 'اختر اليوم', rows) };
}
// Slot = only the 2-hour slots still free for this barber on the chosen day.
function showSlot(p){
  p=p||'';
  var off=offOfIso(bookingDate);
  var avail=availSlots(off, bookingDate, barberId);
  if(avail.length===0){ return { t:'لا توجد مواعيد متاحة في هذا اليوم. اكتب 0 لاختيار يوم آخر.', i:null }; }
  var text=p+'اختر الموعد ('+dayLabel+'):';
  var rows=avail.map(function(s){ var left=SLOT_CAPACITY-slotCount(bookingDate,barberId,s.id); return row(s.id, s.label, 'متاح '+left+' من '+SLOT_CAPACITY); });
  return { t:text, i:iList(text, 'اختر الموعد', rows) };
}
function showEditMenu(p){ p=p||''; var text=p+'ماذا تريد ان تعدل؟'; var rows=[ row('E_SVC','الخدمات'), row('E_NAME','الاسم'), row('E_PHONE','الهاتف'), row('E_TIME','الموعد') ]; return { t:text, i:iList(text, 'تعديل', rows) }; }
function showConfirm(p){ p=p||''; var text=p+summaryText(); return { t:text, i:iButtons(text, [ btn('1','تأكيد ✅'), btn('2','إلغاء'), btn('3','تعديل') ]) }; }
// Client already has a live booking: change it, cancel it, or book an extra one.
function bookingLine(ex){
  return 'الحلاق: '+String(ex.barber_name||'')+NL+'اليوم: '+String(ex.booking_date||'').slice(0,10)+NL+
         'الموعد: '+String(ex.slot||'')+NL+'رقم الحجز: '+String(ex.booking_ref||'');
}
function showHasBooking(ex,p){ p=p||'';
  var text=p+'عندك حجز قائم بالفعل:'+NL+bookingLine(ex)+NL+NL+'تحب تعمل ايه؟';
  return { t:text, i:iButtons(text, [ btn('1','تغيير الموعد'), btn('2','إلغاء الحجز'), btn('3','حجز إضافي') ]) };
}
function showCancelConfirm(ex,p){ p=p||'';
  var text=p+'تأكيد إلغاء الحجز؟'+NL+bookingLine(ex);
  return { t:text, i:iButtons(text, [ btn('1','نعم، الغِ'), btn('2','تراجع') ]) };
}
function showMoveConfirm(p){ p=p||'';
  var text=p+'تأكيد الموعد الجديد؟'+NL+'الحلاق: '+barberName+NL+'الموعد: '+timePreference+NL+'رقم الحجز: '+pendingRef;
  return { t:text, i:iButtons(text, [ btn('1','تأكيد ✅'), btn('2','تراجع') ]) };
}

var valName=function(n){ n=n.trim(); if(n.length<3) return null; if(!/^[؀-ۿa-zA-Z ]+$/.test(n)) return null; return n; };
var valPhone=function(p){ p=normDigits(p).replace(/[^0-9+]/g,''); if(!/^[+]?[0-9]{7,15}$/.test(p)) return null; return p; };

var restartKw=['hi','hello','hey','start','welcome','greetings','yo','sup','howdy','hola','elo','alo','ello','مرحبا','اهلا','هاي','هالو','هلو','سلام','السلام','الو','الوو','ابدا','بدايه','من جديد'];
// Typed anywhere -> cancel the live booking (this is what the 1h reminder promises).
var cancelKw=['الغاء','الغاء الحجز','الغى','الغي','كنسل','cancel'];
var backKw=['back','رجوع','رجع','عوده','العوده','خلف','للخلف'];
var isBack=function(){ return body==='0' || backKw.indexOf(bodyN)!==-1; };

function resetBooking(){ serviceName=''; selectedIds=[]; barberId=''; barberName=''; bookingDate=''; dayLabel=''; slotId=''; slotLabel=''; timePreference=''; customerName=''; customerPhone=''; editing=''; pendingRef=''; }
function resetTime(){ bookingDate=''; dayLabel=''; slotId=''; slotLabel=''; timePreference=''; }

var response='', interactive=null, action='reply', bookingRef='', bookingData=null, adminMsg='';
var telegramChatId='', telegramText='';
var updateData=null; // set for action='update_booking' (change time OR cancel)
var TG_GROUP='-5556274644';
function setMenu(m){ response=m.t; interactive=m.i; }
// Entry point: a client with a live booking gets the manage menu, not a fresh flow.
// This is what stops "changing my time" turning into a second reservation.
function startFlow(){
  var ex=findActiveBooking();
  resetBooking();
  if(ex){ pendingRef=String(ex.booking_ref||''); step='HAS_BOOKING'; setMenu(showHasBooking(ex)); }
  else { step='SERVICE'; response=showServicesText(); }
}

if (restartKw.indexOf(bodyN)!==-1) {
  startFlow();

} else if (cancelKw.indexOf(bodyN)!==-1) {
  var exKw=findActiveBooking();
  if(!exKw){ resetBooking(); step='SERVICE'; response=showServicesText('لا يوجد حجز قائم لإلغائه.'+NL+NL); }
  else { pendingRef=String(exKw.booking_ref||''); step='CANCEL_CONFIRM'; setMenu(showCancelConfirm(exKw)); }

} else if (step==='WELCOME' || step==='LANG' || step==='') {
  startFlow();

} else if (step==='HAS_BOOKING') {
  var exh=findActiveBooking();
  if(!exh){ startFlow(); }
  else if(body==='1'){                        // change the time of the SAME booking
    pendingRef=String(exh.booking_ref||'');
    barberName=String(exh.barber_name||'').trim();
    barberId=barberIdByName(barberName);
    serviceName=String(exh.service_name||'');
    customerName=String(exh.customer_name||'');
    customerPhone=String(exh.phone||'');
    editing='reschedule'; resetTime(); step='DAY'; setMenu(showDay());
  }
  else if(body==='2'){ pendingRef=String(exh.booking_ref||''); step='CANCEL_CONFIRM'; setMenu(showCancelConfirm(exh)); }
  else if(body==='3'){ resetBooking(); step='SERVICE'; response=showServicesText(); }  // extra booking (family)
  else { setMenu(showHasBooking(exh,'اختيار غير صحيح.'+NL+NL)); }

} else if (step==='CANCEL_CONFIRM') {
  if(body==='1'){
    var exc=findActiveBooking();
    if(!exc){ resetBooking(); step='SERVICE'; response=showServicesText('لا يوجد حجز قائم.'+NL+NL); }
    else {
      action='update_booking';
      updateData={ booking_ref:String(exc.booking_ref||''), booking_date:String(exc.booking_date||'').slice(0,10), slot:String(exc.slot||''), time_preference:String(exc.time_preference||''), status:'cancelled' };
      response='تم إلغاء حجزك ✅'+NL+'رقم الحجز: '+String(exc.booking_ref||'')+NL+NL+'تقدر تحجز من جديد في أي وقت.';
      telegramChatId=TG_GROUP;
      telegramText='إلغاء حجز ❌'+NL+'الحلاق: '+String(exc.barber_name||'')+NL+'الاسم: '+String(exc.customer_name||'')+NL+'اليوم: '+String(exc.booking_date||'').slice(0,10)+NL+'الموعد: '+String(exc.slot||'')+NL+'رقم الحجز: '+String(exc.booking_ref||'');
      resetBooking(); step='SERVICE';
    }
  } else { resetBooking(); step='SERVICE'; response=showServicesText('تم التراجع، حجزك زي ما هو.'+NL+NL); }

} else if (step==='MOVE_CONFIRM') {
  if(body==='1'){
    action='update_booking';
    updateData={ booking_ref:pendingRef, booking_date:bookingDate, slot:slotLabel, time_preference:timePreference, status:'' };
    response='تم تغيير موعدك ✅'+NL+'رقم الحجز: '+pendingRef+NL+'الحلاق: '+barberName+NL+'الموعد الجديد: '+timePreference;
    telegramChatId=TG_GROUP;
    telegramText='تغيير موعد 🔄'+NL+'الحلاق: '+barberName+NL+'الاسم: '+customerName+NL+'الموعد الجديد: '+timePreference+NL+'رقم الحجز: '+pendingRef;
    resetBooking(); step='SERVICE';
  } else if(body==='2'){ resetBooking(); step='SERVICE'; response=showServicesText('تم التراجع، حجزك زي ما هو.'+NL+NL); }
  else { setMenu(showMoveConfirm('اختيار غير صحيح.'+NL+NL)); }

} else if (step==='SERVICE') {
  if (isBack() && editing==='svc') { editing=''; step='CONFIRM'; setMenu(showConfirm()); }
  else {
  var nums = normDigits(rawBody).split(/[ ,،]+/).map(function(x){ return parseInt(x.trim(),10); }).filter(function(n){ return !isNaN(n)&&n>=1&&n<=allServices.length; });
  if(nums.length===0){ response=showServicesText(); }
  else {
    var seen={}; var picked=[];
    nums.forEach(function(n){ if(!seen[n]){ seen[n]=1; picked.push(n); } });
    selectedIds = picked.map(function(n){ return sidOf(allServices[n-1],n-1); });
    serviceName = selNames().join('، ');
    // Edit-service-only: barber/day/slot unaffected, go straight back to review.
    if(editing==='svc'){ editing=''; step='CONFIRM'; setMenu(showConfirm()); }
    else { step='BARBER'; setMenu(showBarber()); }
  }
  }

} else if (step==='BARBER') {
  if (isBack() || bodyN==='edit' || body==='EDIT') { step='SERVICE'; selectedIds=[]; serviceName=''; barberId=''; barberName=''; resetTime(); response=showServicesText(); }
  else {
    var bn=parseInt(body,10);
    if(isNaN(bn)||bn<1||bn>allBarbers.length){ setMenu(showBarber('اختيار غير صحيح.'+NL+NL)); }
    else { var br=allBarbers[bn-1]; barberId=br.barber_id; barberName=br.name_ar||br.name; resetTime(); step='DAY'; setMenu(showDay()); }
  }

} else if (step==='DAY') {
  if (isBack()) {
    if(editing==='reschedule'){ var exb=findActiveBooking(); if(exb){ editing=''; step='HAS_BOOKING'; setMenu(showHasBooking(exb)); } else { startFlow(); } }
    else if(editing==='time'){ editing=''; step='CONFIRM'; setMenu(showConfirm()); }
    else { step='BARBER'; resetTime(); setMenu(showBarber()); }
  }
  else if (body.charAt(0)==='D' && /^[0-9]+$/.test(body.substring(1))) {
    var off=parseInt(body.substring(1),10);
    var bb=barberById(barberId);
    var okDay = off>=0 && off<=7 && (!bb || cairoDate(off).getUTCDay()!==bb.day_off) && availSlots(off, isoForOff(off), barberId).length>0;
    if(!okDay){ setMenu(showDay('اختيار غير صحيح.'+NL+NL)); }
    else { bookingDate=isoForOff(off); dayLabel=dayLabelOff(off); step='SLOT'; setMenu(showSlot()); }
  } else { setMenu(showDay('اختيار غير صحيح.'+NL+NL)); }

} else if (step==='SLOT') {
  if (isBack()) { step='DAY'; bookingDate=''; dayLabel=''; setMenu(showDay()); }
  else {
    var off2=offOfIso(bookingDate);
    var s=slotById(body);
    var isAvail = s && availSlots(off2, bookingDate, barberId).some(function(x){ return x.id===s.id; });
    if(!isAvail){ setMenu(showSlot('اختيار غير صحيح أو ممتلئ.'+NL+NL)); }
    else {
      slotId=s.id; slotLabel=s.label; timePreference=dayLabel+' - '+slotLabel;
      if(editing==='reschedule'){        // moving an existing booking -> update, don't append
        editing=''; step='MOVE_CONFIRM'; setMenu(showMoveConfirm());
      } else {
        editing='';
        if(!customerName){ customerName=profileName; }
        if(!customerPhone){ customerPhone=waNum; }
        step='CONFIRM'; setMenu(showConfirm());
      }
    }
  }

} else if (step==='NAME') {
  // Reached only via the review-screen edit menu; returns to the review (CONFIRM).
  if (isBack()) { editing=''; step='CONFIRM'; setMenu(showConfirm()); }
  else {
    var vn=valName(rawBody);
    if(!vn){ response='اسم غير صحيح. ادخل اسمك الحقيقي (3 احرف على الاقل).'; }
    else { customerName=vn; editing=''; step='CONFIRM'; setMenu(showConfirm()); }
  }

} else if (step==='PHONE') {
  if (isBack()) { editing=''; step='CONFIRM'; setMenu(showConfirm()); }
  else {
    var vp=valPhone(rawBody);
    if(!vp){ response='رقم هاتف غير صحيح. مثال: 201012345678'; }
    else { customerPhone=vp; editing=''; step='CONFIRM'; setMenu(showConfirm()); }
  }

} else if (step==='CONFIRM') {
  if (body==='1') {
    if(!customerName){ step='NAME'; response='ادخل اسمك الكامل:'; }
    else if(slotCount(bookingDate,barberId,slotId) >= SLOT_CAPACITY){
      step='SLOT'; slotId=''; slotLabel=''; timePreference='';
      setMenu(showSlot('عذراً، امتلأ هذا الموعد. اختر موعداً آخر.'+NL+NL));
    } else {
      // No incSlot: the appended sheet row is the count. Next reads see it.
      action='save_booking';
      bookingRef='BK-'+String(Date.now()%1000000).padStart(6,'0');
      response='✅ تم تاكيد حجزك!'+NL+'رقم الحجز: '+bookingRef+NL+NL+'الخدمة: '+serviceName+NL+'الحلاق: '+barberName+NL+'الوقت: '+timePreference+NL+'الاسم: '+customerName+NL+'الهاتف: '+customerPhone+NL+NL+'للاستفسار: '+SALON_PHONE;
      adminMsg='New Reservation'+NL+'Ref: '+bookingRef+NL+'Service: '+serviceName+NL+'Barber: '+barberName+NL+'Time: '+timePreference+NL+'Name: '+customerName+NL+'Phone: '+customerPhone+NL+'WA: '+from;
      // Store the phone canonically as 20XXXXXXXXXX. Sheets coerces the cell to a
      // NUMBER, which silently eats a leading 0 ("01013800670" -> 1013800670) and
      // broke reminders. Starting with "20" there is no leading zero to lose.
      bookingData={ booking_ref:bookingRef, service_name:serviceName, barber_name:barberName, booking_date:bookingDate, slot:slotLabel, time_preference:timePreference, customer_name:customerName, phone:(normPhone(customerPhone)||normPhone(from)||customerPhone), created_at:cairoNow };
      telegramChatId = '-5556274644'; // barbers' group
      telegramText = 'حجز جديد 💈'+NL+'الحلاق: '+barberName+NL+'الاسم: '+customerName+NL+'الخدمة: '+serviceName+NL+'الوقت: '+timePreference+NL+'الهاتف: '+customerPhone+NL+'رقم الحجز: '+bookingRef;
      step='SERVICE'; resetBooking();
    }
  } else if (body==='2') {
    step='SERVICE'; resetBooking(); response=showServicesText('تم الغاء الحجز.'+NL+NL);
  } else if (body==='3') {
    step='EDIT_MENU'; setMenu(showEditMenu());
  } else { setMenu(showConfirm('اختيار غير صحيح.'+NL+NL)); }

} else if (step==='EDIT_MENU') {
  if (isBack()) { step='CONFIRM'; setMenu(showConfirm()); }
  else if (body==='E_SVC') { editing='svc'; selectedIds=[]; serviceName=''; step='SERVICE'; response=showServicesText(); }
  else if (body==='E_NAME') { editing=''; step='NAME'; response='ادخل اسمك الكامل:'; }
  else if (body==='E_PHONE') { editing=''; step='PHONE'; response='ادخل رقم هاتفك:'; }
  else if (body==='E_TIME') { editing='time'; resetTime(); step='DAY'; setMenu(showDay()); }
  else { setMenu(showEditMenu('⚠️ اختيار غير صحيح.'+NL+NL)); }

} else {
  startFlow();
}

var sessions = staticData.sessions || {};
sessions[from] = { phone:from, step:step, lang:lang, service_name:serviceName, service_ids:selectedIds.join(','), barber_id:barberId, barber_name:barberName, booking_date:bookingDate, day_label:dayLabel, slot_id:slotId, slot_label:slotLabel, time_preference:timePreference, customer_name:customerName, customer_phone:customerPhone, editing:editing, pending_ref:pendingRef };
staticData.sessions = sessions;

var waPayload;
if (interactive) { waPayload = { messaging_product:'whatsapp', recipient_type:'individual', to:from, type:'interactive', interactive:interactive }; }
else { waPayload = { messaging_product:'whatsapp', recipient_type:'individual', to:from, type:'text', text:{ preview_url:false, body:response } }; }

return [{ json: { action:action, response:response, waPayload:waPayload, adminMsg:adminMsg, telegramChatId:telegramChatId, telegramText:telegramText, updateData:updateData, from:from, lang:lang, step:step, service_name:serviceName, barber_name:barberName, time_preference:timePreference, customer_name:customerName, customer_phone:customerPhone, bookingRef:bookingRef, bookingData:bookingData } }];
`
    }
  },
  output: [{ action: 'reply', response: 'Hello', waPayload: {}, from: '201011130090', lang: 'ar', step: 'SERVICE' }]
});

// ─── ROUTE BY ACTION ────────────────────────────────────────────
const routeAction = switchCase({
  version: 3.4,
  config: {
    name: 'Route by Action',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          {
            renameOutput: true, outputKey: 'Save Booking',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'save_booking' }],
              combinator: 'and'
            }
          },
          {
            renameOutput: true, outputKey: 'Check Booking',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'check_booking' }],
              combinator: 'and'
            }
          },
          {
            renameOutput: true, outputKey: 'Update Booking',
            conditions: {
              options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: expr('{{ $json.action }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'update_booking' }],
              combinator: 'and'
            }
          }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'Reply' }
    }
  }
});

// ─── BRANCH: SAVE BOOKING (out0) ────────────────────────────────
// Session is persisted inside Process Message via Static Data — no upsert here.
// Query parameters are passed as an ARRAY expression (not a comma-separated string):
// Arabic service lists contain separators, and the string form would split on them.
const appendReservation = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  credentials: { postgres: newCredential(PG_CREDENTIAL) },
  config: {
    name: 'Append Reservation',
    parameters: {
      operation: 'executeQuery',
      query: [
        'insert into reservations',
        '  (booking_ref, service_name, barber_name, booking_date, slot, time_preference, customer_name, phone, created_at)',
        "values ($1, $2, $3, nullif($4,'')::date, $5, $6, $7, $8, $9)",
        'on conflict (booking_ref) do nothing',
        'returning booking_ref'
      ].join('\n'),
      options: {
        queryReplacement: expr(`{{ (function(b){ return [
  b.booking_ref, b.service_name, b.barber_name, b.booking_date,
  b.slot, b.time_preference, b.customer_name, b.phone, b.created_at
].map(function(v){ return v == null ? '' : String(v); }); })($('Process Message').first().json.bookingData) }}`)
      }
    }
  },
  output: [{}]
});

const sendConfirmation = node({
  type: 'n8n-nodes-base.whatsApp',
  version: 1.1,
  credentials: { whatsAppApi: newCredential('WhatsApp account 2') },
  config: {
    name: 'Send Confirmation',
    parameters: {
      resource: 'message',
      operation: 'send',
      phoneNumberId: PHONE_NUMBER_ID,
      recipientPhoneNumber: expr("{{ $('Process Message').first().json.from }}"),
      messageType: 'text',
      textBody: expr("{{ $('Process Message').first().json.response }}")
    }
  },
  output: [{ messages: [{ id: 'wamid.abc' }] }]
});

// Telegram ping to the barber on a new booking (token in URL — no n8n credential).
// onError continue so a not-started chat never fails the save execution.
const notifyBarber = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Notify Barber (Telegram)',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: TELEGRAM_URL,
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ chat_id: $('Process Message').first().json.telegramChatId, text: $('Process Message').first().json.telegramText }) }}")
    }
  },
  output: [{ ok: true }]
});

// ─── BRANCH: REPLY (out2 / fallback) — interactive via Graph API ─
// HTTP Request POSTs the interactive (button/list) or text payload that
// Process Message built. Credential must be set in the n8n UI to the
// predefined "WhatsApp API" credential ("WhatsApp account 2") — the SDK
// cannot bind a whatsAppApi credential onto an httpRequest node.
const sendReply = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send Reply',
    parameters: {
      method: 'POST',
      url: GRAPH_URL,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'whatsAppApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify($('Process Message').first().json.waPayload) }}")
    }
  },
  output: [{ messaging_product: 'whatsapp', messages: [{ id: 'wamid.abc' }] }]
});

// ─── BRANCH: CHECK BOOKING (out1) ───────────────────────────────
const lookupBooking = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  credentials: { postgres: newCredential(PG_CREDENTIAL) },
  config: {
    name: 'Lookup Booking',
    alwaysOutputData: true,
    parameters: {
      operation: 'executeQuery',
      query: RES_SELECT + '\n where booking_ref = $1\n limit 1',
      options: {
        queryReplacement: expr("{{ [ String($('Process Message').first().json.bookingRef || '') ] }}")
      }
    }
  },
  output: [{ booking_ref: 'BK-000001', service_name: 'Haircut', barber_name: 'Omar', time_preference: 'Day', customer_name: 'Ahmed', phone: '+201000000000', created_at: '2026-06-10' }]
});

const formatBookingDetail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Format Booking Detail',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `
var NL = String.fromCharCode(10);
var lang = $('Process Message').first().json.lang || 'en';
var from = $('Process Message').first().json.from;
var bookingRef = $('Process Message').first().json.bookingRef;
var row = $json;
var response;
if (row.booking_ref) {
  if (lang === 'ar') {
    response = 'تفاصيل حجزك:' + NL + NL + 'الخدمة: ' + row.service_name + NL + 'الحلاق: ' + row.barber_name + NL + 'الوقت: ' + row.time_preference + NL + 'الاسم: ' + row.customer_name + NL + 'الهاتف: ' + row.phone + NL + 'رقم الحجز: ' + row.booking_ref + NL + 'للاستفسار: 01280800867 - 01285588096';
  } else {
    response = 'Your Reservation:' + NL + NL + 'Service: ' + row.service_name + NL + 'Barber: ' + row.barber_name + NL + 'Time: ' + row.time_preference + NL + 'Name: ' + row.customer_name + NL + 'Phone: ' + row.phone + NL + 'Ref: ' + row.booking_ref + NL + 'Inquiries: 01280800867 - 01285588096';
  }
} else {
  response = lang === 'ar' ? 'لا يوجد حجز برقم ' + bookingRef : 'No reservation found for ' + bookingRef;
}
return [{ json: { response: response, from: from } }];
`
    }
  },
  output: [{ response: 'Your Reservation: ...', from: '201011130090' }]
});

const sendBookingDetail = node({
  type: 'n8n-nodes-base.whatsApp',
  version: 1.1,
  credentials: { whatsAppApi: newCredential('WhatsApp account 2') },
  config: {
    name: 'Send Booking Detail',
    parameters: {
      resource: 'message',
      operation: 'send',
      phoneNumberId: PHONE_NUMBER_ID,
      recipientPhoneNumber: expr("{{ $('Format Booking Detail').first().json.from }}"),
      messageType: 'text',
      textBody: expr("{{ $('Format Booking Detail').first().json.response }}")
    }
  },
  output: [{ messages: [{ id: 'wamid.abc' }] }]
});

// ─── REMINDER BRANCH (independent cron) ─────────────────────────
// Every 10 min: read the sheet, pick bookings whose slot starts in ~1h (today,
// Cairo), send a WhatsApp reminder (free-form, best-effort — only reaches
// customers inside the 24h window). Dedup via staticData.reminded[ref]=date
// (safe under concurrency=1). No sheet column needed. Slot label -> start hour:
//   S1=13 S2=15 S3=17 S4=19 S5=21 S6=23 (reminder fires at start-60..-45 min).
const reminderCron = trigger({
  type: 'n8n-nodes-base.scheduleTrigger', version: 1.2,
  config: { name: 'Reminder Cron', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } },
  output: [{}]
});
const readResReminder = node({
  type: 'n8n-nodes-base.postgres', version: 2.7,
  credentials: { postgres: newCredential(PG_CREDENTIAL) },
  config: { name: 'Read Res (Reminder)', alwaysOutputData: true, parameters: {
    operation: 'executeQuery',
    // Only today's live bookings can be due; Pick Due Reminders still does the
    // hour/dedupe logic, so its jsCode is unchanged.
    query: RES_SELECT + "\n where status not in ('cancelled','done')\n   and booking_date = (now() at time zone 'Africa/Cairo')::date",
    options: {} } },
  output: [{ booking_ref: 'BK-000001', booking_date: '2026-07-23', slot: 'من 1 إلى 3 مساءً', barber_name: 'عمر', phone: 201011076509, status: '' }]
});
const pickDueReminders = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Pick Due Reminders', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `
var staticData = $getWorkflowStaticData('global');
var rem = staticData.reminded || {};
var NL = String.fromCharCode(10);
var cairoDate = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo' }).format(new Date());
var hh = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Cairo', hour:'2-digit', hour12:false }).format(new Date()), 10);
var mm = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Cairo', minute:'2-digit' }).format(new Date()), 10);
var nowMin = hh*60 + mm;
var SLOT_START = { 'من 1 إلى 3 مساءً':13, 'من 3 إلى 5 مساءً':15, 'من 5 إلى 7 مساءً':17, 'من 7 إلى 9 مساءً':19, 'من 9 إلى 11 مساءً':21, 'من 11 مساءً إلى 1 صباحاً':23 };
// Sheets stores phone as a NUMBER (leading + lost, leading 0 stripped). Rebuild 20XXXXXXXXXX or skip.
function normPhone(v){ var s=String(v==null?'':v).replace(/[^0-9]/g,''); if(!s) return ''; if(s.charAt(0)==='0') s='2'+s; else if(s.length===10 && s.charAt(0)==='1') s='20'+s; if(s.length!==12 || s.slice(0,2)!=='20') return ''; return s; }
var rows = $input.all().map(function(i){ return i.json; });
var out = [];
rows.forEach(function(r){
  var ref = String(r.booking_ref||'').trim(); if(!ref) return;
  if(String(r.booking_date).slice(0,10) !== cairoDate) return;
  var st = String(r.status==null?'':r.status).trim().toLowerCase();
  if(st==='cancelled' || st==='done') return;
  var sh = SLOT_START[String(r.slot).trim()]; if(sh===undefined) return;
  var untilMin = sh*60 - nowMin;
  if(untilMin < 45 || untilMin > 60) return;
  if(rem[ref]) return;
  var phone = normPhone(r.phone); if(!phone) return;
  var text = 'تذكير ⏰'+NL+'حجزك النهاردة الساعة '+String(r.slot)+' مع '+String(r.barber_name||'')+'.'+NL+'رقم الحجز: '+ref+NL+'لو مش هتقدر تيجي، رد بكلمة إلغاء.';
  rem[ref] = cairoDate;
  out.push({ json: { to:phone, text:text, ref:ref } });
});
Object.keys(rem).forEach(function(k){ if(rem[k] < cairoDate) delete rem[k]; });
staticData.reminded = rem;
return out;
` } },
  output: [{ to: '201011076509', text: 'تذكير', ref: 'BK-000001' }]
});
const sendReminder = node({
  type: 'n8n-nodes-base.whatsApp', version: 1.1,
  credentials: { whatsAppApi: newCredential('WhatsApp account 2') },
  config: { name: 'Send Reminder', onError: 'continueRegularOutput', parameters: {
    resource: 'message', operation: 'send', phoneNumberId: PHONE_NUMBER_ID,
    recipientPhoneNumber: expr('{{ $json.to }}'), messageType: 'text', textBody: expr('{{ $json.text }}') } },
  output: [{ messages: [{ id: 'wamid.abc' }] }]
});

// ─── UPDATE BOOKING (change time / cancel) ──────────────────────
// Matches on booking_ref; used by both reschedule and cancel (status='cancelled').
// updateData always carries all four fields (the cancel path copies the existing
// date/slot/time_preference off the booking), so a plain SET of all of them is safe.
const updateBooking = node({
  type: 'n8n-nodes-base.postgres', version: 2.7,
  credentials: { postgres: newCredential(PG_CREDENTIAL) },
  config: {
    name: 'Update Booking',
    parameters: {
      operation: 'executeQuery',
      query: [
        'update reservations',
        "   set booking_date = nullif($2,'')::date,",
        '       slot = $3,',
        '       time_preference = $4,',
        '       status = $5',
        ' where booking_ref = $1',
        'returning booking_ref'
      ].join('\n'),
      options: {
        queryReplacement: expr(`{{ (function(u){ return [
  u.booking_ref, u.booking_date, u.slot, u.time_preference, u.status
].map(function(v){ return v == null ? '' : String(v); }); })($('Process Message').first().json.updateData) }}`)
      }
    }
  },
  output: [{ booking_ref: 'BK-000001' }]
});

// ─── COMPOSE WORKFLOW ────────────────────────────────────────────
// Services + barbers are inline now, so there is no Sheets fetch / cache gate:
//   Text Messages Only (TRUE) → Load Session → Process Message → Route by Action
const reservationFlow = routeAction
  // out0 save: write row -> confirm to customer -> ping barbers' Telegram (terminal).
  .onCase(0, appendReservation.to(sendConfirmation).to(notifyBarber))
  // out1 check: look up by ref and reply with the details.
  .onCase(1, lookupBooking.to(formatBookingDetail).to(sendBookingDetail))
  // out2 update: change-time / cancel -> update row -> confirm -> Telegram (shares the
  //   same confirm+notify terminals as save; both are fan-in with identical downstream).
  .onCase(2, updateBooking.to(sendConfirmation).to(notifyBarber))
  // out3 fallback: interactive/text reply.
  .onCase(3, sendReply);

export default workflow('salon-whatsapp-bot', 'Salon WhatsApp Booking Bot')
  .add(waTrigger)
  .to(normalizeMsg)
  .to(filterText.onTrue(
    loadSession.to(readReservations).to(processMsg.to(reservationFlow))
  ))
  .add(reminderCron)
  .to(readResReminder)
  .to(pickDueReminders)
  .to(sendReminder);
