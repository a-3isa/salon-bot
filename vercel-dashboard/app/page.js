'use client';
import { useEffect, useRef } from 'react';

const BODY_HTML = `
<div class="spine"></div>

<header class="top">
  <div class="wrap">
    <span class="tick"></span>
    <div><h1 class="serif">صالون محمد وعمر</h1><div class="sub">M&nbsp;&amp;&nbsp;O · EST 2024</div></div>
    <span class="sp"></span>
    <button class="rfr" id="refresh" title="تحديث">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
    </button>
  </div>
</header>

<main class="wrap">
  <div class="dh">
    <div><div class="big serif" id="dayBig">—</div><div class="sub" id="daySub"></div></div>
    <span class="sp"></span>
    <button class="nav" id="prev" title="السابق"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
    <button class="nav" id="next" title="التالي"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
    <button class="nav cal" title="اختر التاريخ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="0"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><input type="date" id="datePick"></button>
  </div>

  <div class="rail" id="pills"></div>
  <div class="meta" id="summary"></div>
  <div class="filters" id="seg"></div>
  <div class="agenda" id="grid"></div>
  <div class="foot" id="foot"></div>
</main>

<div class="toast" id="toast"></div>

<button class="fab" id="addBtn" title="إضافة عميل" disabled></button>

<div class="modal" id="modal">
  <div class="scrim" id="scrim"></div>
  <div class="sheet">
    <h3>إضافة عميل يدويًا</h3>
    <div class="fld"><label>الحلاق</label><select id="f_barber"></select></div>
    <div class="frow">
      <div class="fld"><label>اليوم</label><input type="date" id="f_date"></div>
      <div class="fld"><label>الموعد</label><select id="f_slot"></select></div>
    </div>
    <div class="fld"><label>اسم العميل</label><input type="text" id="f_name" autocomplete="off" placeholder="الاسم"></div>
    <div class="frow">
      <div class="fld"><label>الهاتف (اختياري)</label><input type="tel" id="f_phone" autocomplete="off" placeholder="01xxxxxxxxx"></div>
      <div class="fld"><label>الخدمة (اختياري)</label><input type="text" id="f_service" autocomplete="off" placeholder="الخدمة"></div>
    </div>
    <div class="macts">
      <button id="f_cancel" type="button">إلغاء</button>
      <button class="save" id="f_save" type="button">حفظ</button>
    </div>
  </div>
</div>
`;

function initDashboard() {
  // ── fetch shim: keep the google.script.run.withSuccessHandler(...).method() shape ──
  function api(method, url, body) {
    return fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      if (r.status === 401) { window.location.href = '/login'; throw new Error('unauthorized'); }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      return d;
    });
  }
  function makeRunner() {
    let onS = null, onF = null;
    const b = {
      withSuccessHandler(fn) { onS = fn; return b; },
      withFailureHandler(fn) { onF = fn; return b; },
      getBoardData(date) { api('GET', '/api/board?date=' + encodeURIComponent(date || '')).then((d) => onS && onS(d)).catch((e) => onF && onF(e)); },
      setStatus(ref, done) { api('POST', '/api/status', { ref, done }).then((d) => onS && onS(d)).catch((e) => onF && onF(e)); },
      addBooking(p) { api('POST', '/api/booking', p).then((d) => onS && onS(d)).catch((e) => onF && onF(e)); },
      deleteBooking(ref) { api('DELETE', '/api/booking', { ref }).then((d) => onS && onS(d)).catch((e) => onF && onF(e)); },
    };
    return b;
  }
  const google = { script: {} };
  Object.defineProperty(google.script, 'run', { get: makeRunner });

  // ───────────────────────── original dashboard logic ─────────────────────────
  var AR_DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  var AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  var ICON = {
    phone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    wa:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.8c2.16 0 4.19.84 5.72 2.37a8.04 8.04 0 0 1 2.37 5.72c0 4.46-3.63 8.09-8.1 8.09a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.12.82.83-3.04-.19-.31a8.05 8.05 0 0 1-1.24-4.32c0-4.46 3.63-8.09 8.1-8.09zm-2.6 4.13c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.5.57.18 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.64-1.19-1.42-1.33-1.66-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46z"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
  };

  var state = { date:null, today:null, filter:'all', data:null };

  function pad(n){ return (n<10?'0':'')+n; }
  function toStr(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function parse(s){ var p=s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function addDays(s,n){ var d=parse(s); d.setDate(d.getDate()+n); return toStr(d); }
  function digits(p){ p=(p||'').replace(/[^0-9]/g,''); if(p.length && p[0]==='0') p='2'+p; return p; }
  function esc(s){ return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function dayLabels(dateStr){
    var d=parse(dateStr), tdy=parse(state.today||dateStr);
    var diff=Math.round((d-tdy)/86400000);
    var big=diff===0?'اليوم':(diff===1?'غداً':(diff===-1?'أمس':AR_DAYS[d.getDay()]));
    var sub=AR_DAYS[d.getDay()]+' · '+d.getDate()+' '+AR_MONTHS[d.getMonth()]+' '+d.getFullYear();
    return { big:big, sub:sub };
  }

  function renderPills(){
    var base=state.today||state.date, html='';
    for(var i=0;i<8;i++){
      var ds=addDays(base,i), d=parse(ds);
      var lbl=i===0?'اليوم':(i===1?'غداً':AR_DAYS[d.getDay()]);
      html+='<div class="d'+(ds===state.date?' on':'')+(i===0?' tdy':'')+'" data-d="'+ds+'"><div class="wd">'+lbl+'</div><div class="num">'+d.getDate()+'</div></div>';
    }
    var p=document.getElementById('pills'); p.innerHTML=html;
    [].forEach.call(p.children,function(el){ el.onclick=function(){ go(el.getAttribute('data-d')); }; });
  }

  function renderHeader(){
    var L=dayLabels(state.date);
    document.getElementById('dayBig').textContent=L.big;
    document.getElementById('daySub').textContent=L.sub;
    document.getElementById('datePick').value=state.date;
  }

  function renderSummary(){
    var bs=state.data.barbers, total=0, working=0;
    bs.forEach(function(b){ total+=b.total; if(!b.dayOff) working++; });
    var cap=working*state.data.capacity*6, pct=cap?Math.round(total/cap*100):0;
    var wlabel = working===1?'حلاق واحد':(working===2?'حلاقان':working+' حلاقين');
    document.getElementById('summary').innerHTML=
      '<b>'+total+'</b> حجزًا<span class="sep">/</span>'+wlabel+' على رأس العمل<span class="sep">/</span>الإشغال <b>'+pct+'%</b>';
  }

  function renderSeg(){
    var bs=state.data.barbers;
    var html='<button class="ft '+(state.filter==='all'?'on':'')+'" data-f="all">الكل</button>';
    bs.forEach(function(b){ html+='<button class="ft '+(state.filter===b.ar?'on':'')+'" data-f="'+esc(b.ar)+'">'+esc(b.ar)+'</button>'; });
    var s=document.getElementById('seg'); s.innerHTML=html;
    [].forEach.call(s.children,function(el){ el.onclick=function(){ state.filter=el.getAttribute('data-f'); renderSeg(); renderGrid(); }; });
  }

  function state_cls(c,cap){ return c===0?'free':(c>=cap?'full':'part'); }
  function state_txt(c,cap){ return c===0?'متاح':(c>=cap?'مكتمل':'باقٍ '+(cap-c)); }
  function bookingRow(bk){
    var d=digits(bk.phone);
    var wa=d?'<a class="wa" href="https://wa.me/'+d+'" target="_blank" title="واتساب">'+ICON.wa+'</a>':'';
    var call=d?'<a class="call" href="tel:+'+d+'" target="_blank" title="اتصال">'+ICON.phone+'</a>':'';
    var chk=bk.ref?'<button class="chk'+(bk.done?' on':'')+'" data-ref="'+esc(bk.ref)+'" aria-pressed="'+(bk.done?'true':'false')+'" title="'+(bk.done?'تراجع (نشِّط)':'تم')+'">'+ICON.check+'</button>':'';
    var del=bk.ref?'<a class="del" data-ref="'+esc(bk.ref)+'" role="button" title="حذف">'+ICON.trash+'</a>':'';
    return '<div class="p'+(bk.done?' done':'')+'" data-ref="'+esc(bk.ref||'')+'">'+chk+'<span class="nm">'+esc(bk.customer||'—')+'</span><span class="sv">'+esc(bk.service||'')+'</span><span class="lead"></span><span class="act">'+wa+call+del+'</span></div>';
  }

  function barberSection(b,i){
    var ix='<span class="ix">'+pad(i+1)+'</span>';
    var head='<div class="bhead">'+ix+'<h2 class="serif">'+esc(b.ar)+'</h2>'+(b.dayOff?'':'<span class="ct">'+(b.total===0?'لا حجوزات':b.total+' موعد')+'</span>')+'</div>';
    if(b.dayOff) return '<section class="b" style="animation-delay:'+(i*55)+'ms">'+head+'<div class="rest">في إجازة اليوم</div></section>';

    var body='';
    b.slots.forEach(function(s){
      body+='<div class="row'+(s.count===0?' vacant':'')+'"><div class="rh"><span class="t">'+esc(s.label)+'</span>'+
        '<span class="st '+state_cls(s.count,s.capacity)+'">'+state_txt(s.count,s.capacity)+'</span></div>';
      if(s.bookings.length){ body+='<div class="ppl">'+s.bookings.map(bookingRow).join('')+'</div>'; }
      body+='</div>';
    });
    if(b.other && b.other.length){
      body+='<div class="row"><div class="rh"><span class="t">مواعيد أخرى</span></div><div class="ppl">'+b.other.map(bookingRow).join('')+'</div></div>';
    }
    return '<section class="b" style="animation-delay:'+(i*55)+'ms">'+head+body+'</section>';
  }

  function renderGrid(){
    var bs=state.data.barbers.filter(function(b){ return state.filter==='all'||b.ar===state.filter; });
    var g=document.getElementById('grid');
    if(!bs.length){ g.innerHTML='<div class="none">لا يوجد حلاقون</div>'; document.getElementById('foot').textContent=''; return; }
    var any=state.data.barbers.some(function(b){return b.total>0;});
    g.innerHTML=bs.map(barberSection).join('');
    document.getElementById('foot').textContent='آخر تحديث '+state.data.generatedAt+(any?'':' · لا حجوزات في هذا اليوم');
  }

  function render(){ renderPills(); renderHeader(); renderSummary(); renderSeg(); renderGrid(); }

  function showLoading(){
    document.getElementById('summary').innerHTML='';
    document.getElementById('grid').innerHTML=
      '<div><div class="skn w1"></div><div class="skn w2"></div><div class="skn w3"></div></div>'+
      '<div><div class="skn w1"></div><div class="skn w2"></div><div class="skn w3"></div></div>';
  }
  function showError(e){ document.getElementById('grid').innerHTML='<div class="err">'+esc(e&&e.message||e)+'</div>'; document.getElementById('summary').innerHTML=''; }

  function load(){
    showLoading();
    var btn=document.getElementById('refresh'); btn.classList.add('spin');
    google.script.run
      .withSuccessHandler(function(d){ btn.classList.remove('spin'); state.data=d; state.today=d.today; if(!state.date) state.date=d.date; render(); document.getElementById('addBtn').disabled=false; })
      .withFailureHandler(function(e){ btn.classList.remove('spin'); showError(e); })
      .getBoardData(state.date);
  }

  function go(dateStr){ state.date=dateStr; renderPills(); renderHeader(); load(); }

  var toastTimer=null;
  function toast(msg){
    var t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.classList.remove('show'); }, 3200);
  }
  function syncDone(ref, done){
    if(!state.data) return;
    state.data.barbers.forEach(function(b){
      (b.slots||[]).forEach(function(s){ (s.bookings||[]).forEach(function(bk){ if(bk.ref===ref) bk.done=done; }); });
      (b.other||[]).forEach(function(bk){ if(bk.ref===ref) bk.done=done; });
    });
  }
  function toggleDone(btn){
    var ref=btn.getAttribute('data-ref'); if(!ref) return;
    var p=btn.parentNode;
    var makeDone=!btn.classList.contains('on');
    btn.classList.toggle('on', makeDone);
    if(p&&p.classList) p.classList.toggle('done', makeDone);
    btn.setAttribute('aria-pressed', makeDone?'true':'false');
    btn.disabled=true;
    google.script.run
      .withSuccessHandler(function(){ btn.disabled=false; btn.setAttribute('title', makeDone?'تراجع (نشِّط)':'تم'); syncDone(ref, makeDone); })
      .withFailureHandler(function(e){
        btn.classList.toggle('on', !makeDone);
        if(p&&p.classList) p.classList.toggle('done', !makeDone);
        btn.setAttribute('aria-pressed', !makeDone?'true':'false');
        btn.disabled=false;
        toast((e&&e.message)||'تعذّر الحفظ، حاول مجددًا');
      })
      .setStatus(ref, makeDone);
  }
  function delBooking(a){
    var ref=a.getAttribute('data-ref'); if(!ref) return;
    var p=a.closest('.p');
    var nm=(p&&p.querySelector('.nm')?p.querySelector('.nm').textContent:'') ;
    if(!confirm('حذف حجز '+(nm||'')+'؟')) return;
    a.style.pointerEvents='none'; a.style.opacity='.4';
    google.script.run
      .withSuccessHandler(function(){ if(p) p.parentNode.removeChild(p); toast('تم الحذف'); load(); })
      .withFailureHandler(function(e){ a.style.pointerEvents=''; a.style.opacity=''; toast((e&&e.message)||'تعذّر الحذف'); })
      .deleteBooking(ref);
  }
  document.getElementById('grid').addEventListener('click', function(e){
    var t=e.target;
    var d=t.closest ? t.closest('.del') : null;
    if(d){ e.preventDefault(); delBooking(d); return; }
    var b=t.closest ? t.closest('.chk') : null;
    if(b){ e.preventDefault(); toggleDone(b); }
  });

  var addBtn=document.getElementById('addBtn');
  addBtn.innerHTML=ICON.plus;
  function slotLabels(){
    if(state.data){
      for(var i=0;i<state.data.barbers.length;i++){
        var sl=state.data.barbers[i].slots;
        if(sl&&sl.length) return sl.map(function(s){ return s.label; });
      }
    }
    return [];
  }
  function fillSelect(sel, items, current){
    sel.innerHTML=items.map(function(v){ return '<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v)+'</option>'; }).join('');
  }
  function openModal(){
    if(!state.data) return;
    var barbers=state.data.barbers.map(function(b){ return b.ar; });
    fillSelect(document.getElementById('f_barber'), barbers, state.filter!=='all'?state.filter:barbers[0]);
    fillSelect(document.getElementById('f_slot'), slotLabels(), '');
    document.getElementById('f_date').value=state.date;
    document.getElementById('f_name').value='';
    document.getElementById('f_phone').value='';
    document.getElementById('f_service').value='';
    document.getElementById('modal').classList.add('open');
    setTimeout(function(){ document.getElementById('f_name').focus(); }, 60);
  }
  function closeModal(){ document.getElementById('modal').classList.remove('open'); }
  function saveBooking(){
    var save=document.getElementById('f_save');
    var payload={
      barber: document.getElementById('f_barber').value,
      date: document.getElementById('f_date').value,
      slot: document.getElementById('f_slot').value,
      customer: document.getElementById('f_name').value.trim(),
      phone: document.getElementById('f_phone').value.trim(),
      service: document.getElementById('f_service').value.trim()
    };
    if(!payload.barber){ toast('اختر الحلاق'); return; }
    if(!payload.slot){ toast('اختر الموعد'); return; }
    if(payload.customer.length<2){ toast('اكتب اسم العميل'); document.getElementById('f_name').focus(); return; }
    save.disabled=true; save.textContent='...';
    google.script.run
      .withSuccessHandler(function(res){
        save.disabled=false; save.textContent='حفظ';
        closeModal();
        toast('تمت الإضافة');
        if(res&&res.date&&res.date!==state.date){ go(res.date); } else { load(); }
      })
      .withFailureHandler(function(e){
        save.disabled=false; save.textContent='حفظ';
        toast((e&&e.message)||'تعذّر الحفظ');
      })
      .addBooking(payload);
  }
  addBtn.onclick=openModal;
  document.getElementById('f_cancel').onclick=closeModal;
  document.getElementById('scrim').onclick=closeModal;
  document.getElementById('f_save').onclick=saveBooking;

  document.getElementById('prev').onclick=function(){ go(addDays(state.date,-1)); };
  document.getElementById('next').onclick=function(){ go(addDays(state.date, 1)); };
  document.getElementById('refresh').onclick=load;
  document.getElementById('datePick').onchange=function(e){ if(e.target.value) go(e.target.value); };
  var _iv=setInterval(load, 60000);

  load();

  return function cleanup(){ clearInterval(_iv); clearTimeout(toastTimer); };
}

export default function Page() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;      // guard against double-invoke
    started.current = true;
    const cleanup = initDashboard();
    return () => { if (cleanup) cleanup(); };
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />;
}
