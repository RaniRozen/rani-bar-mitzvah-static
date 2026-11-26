(() => {
  'use strict';
  const C = window.RANI;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sheet = $('#sheet');
  const scrim = $('#scrim');
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(C.STORAGE_KEY)); } catch { return null; } },
    set(v) { try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify(v)); } catch { /* */ } },
  };
  const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, '0')).join('');
  // מזהה מכשיר אקראי – מבטיח אישור אחד למכשיר (השרת שומר רק גיבוב שלו)
  const deviceId = (() => {
    const k = C.STORAGE_KEY + '_dev';
    try { let d = localStorage.getItem(k); if (!/^[0-9a-f]{32}$/.test(d || '')) { d = hex(32); localStorage.setItem(k, d); } return d; } catch { return hex(32); }
  })();
  const isFieldEl = (el) => el && /^(INPUT|TEXTAREA)$/.test(el.tagName);

  // ---------- ללא זום / גרירה מוזרה ----------
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((g) => document.addEventListener(g, (e) => e.preventDefault()));
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // ---------- טוסט ----------
  let toastT = 0;
  function toast(msg, ok) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (ok ? ' ok' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // ---------- גיליון תחתון ----------
  let current = null;
  let leaveTimer = 0;
  let closeTimer = 0;
  function showView(name) {
    $$('[data-view]', sheet).forEach((v) => { v.hidden = v.dataset.view !== name; });
    current = name;
    sheet.classList.toggle('compact', false);
    layoutSheet();
  }
  function openSheet(name) {
    // גם אם הגיליון באמצע סגירה (לחיצה מהירה שוב) – מבטלים את הסגירה ופותחים מחדש
    clearTimeout(closeTimer);
    scrim.hidden = false; sheet.hidden = false;
    document.body.classList.add('locked');
    if (!sheet.classList.contains('show')) requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('show'); sheet.classList.add('show'); }));
    showView(name);
  }
  function closeSheet() {
    clearTimeout(leaveTimer);
    const a = document.activeElement; if (isFieldEl(a)) a.blur();
    scrim.classList.remove('show'); sheet.classList.remove('show');
    document.body.classList.remove('locked');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!sheet.classList.contains('show')) { scrim.hidden = true; sheet.hidden = true; current = null; sheet.classList.remove('compact', 'note-open', 'declined'); } }, reduced ? 130 : 220);
  }
  scrim.addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

  // ---------- מקלדת: גיליון מעל המקלדת (visualViewport) ----------
  const vv = window.visualViewport;
  // גובה "בסיס" של המסך בלי מקלדת – כדי לזהות שהמקלדת פתוחה בלי להסתמך על innerHeight (שמתנהג שונה בכל דפדפן)
  let baseH = vv ? vv.height : innerHeight;
  const fieldFocused = () => isFieldEl(document.activeElement) && sheet.contains(document.activeElement);
  function layoutSheet() {
    const vh = vv ? vv.height : innerHeight;
    const top0 = vv ? vv.offsetTop : 0;
    if (!fieldFocused() && vh >= baseH * 0.8) baseH = vh;
    const kbOpen = !!vv && fieldFocused() && baseH - vh > 100;
    const compact = current === 'rsvp' && vh < 520;
    sheet.classList.toggle('compact', compact);
    if (!compact && document.activeElement !== f.note) sheet.classList.remove('note-open');
    if (kbOpen) {
      // מצמידים את הגיליון לתחתית האזור הנראה (מעל המקלדת) – גם כשהדף "נגרר" למעלה
      sheet.style.maxHeight = vh + 'px'; sheet.style.height = 'auto';
      const h = Math.min(sheet.scrollHeight, vh);
      sheet.style.top = Math.round(top0 + vh - h) + 'px'; sheet.style.bottom = 'auto'; sheet.style.height = h + 'px';
    } else {
      sheet.style.top = ''; sheet.style.bottom = ''; sheet.style.height = ''; sheet.style.maxHeight = '';
    }
  }
  addEventListener('orientationchange', () => { setTimeout(() => { baseH = vv ? vv.height : innerHeight; layoutSheet(); }, 300); });
  if (vv) { vv.addEventListener('resize', layoutSheet); vv.addEventListener('scroll', layoutSheet); }
  addEventListener('scroll', () => { if (fieldFocused()) layoutSheet(); }, { passive: true });
  document.addEventListener('focusin', () => { layoutSheet(); setTimeout(layoutSheet, 120); setTimeout(layoutSheet, 400); });
  document.addEventListener('focusout', () => setTimeout(layoutSheet, 60));
  // גרירה על הרקע/הגיליון לא מזיזה את הדף
  scrim.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // ---------- אפליקציה חיצונית ----------
  function leaveTo(url, appName, color) {
    $('#leaveCircle').style.background = color || '';
    $('#leaveTitle').textContent = 'פותחים את ' + appName + '…';
    $('#leaveRetry').href = url;
    openSheet('leave');
    const onVis = () => { if (document.visibilityState === 'visible') { closeSheet(); document.removeEventListener('visibilitychange', onVis); } };
    document.addEventListener('visibilitychange', onVis);
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => { document.removeEventListener('visibilitychange', onVis); if (current === 'leave') closeSheet(); }, 4000);
    setTimeout(() => { window.location.href = url; }, 150);
  }
  $('#leaveRetry').addEventListener('click', (e) => { e.preventDefault(); window.location.href = e.currentTarget.href; });
  $$('#sheet [data-app]').forEach((a) => a.addEventListener('click', (e) => {
    if (a.id === 'giftOpen') return;
    e.preventDefault(); leaveTo(a.href, a.dataset.app, a.dataset.color);
  }));

  // ---------- העתקה ----------
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fallback */ }
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;font-size:16px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
  function flashOk(btn, label) {
    const span = $('span', btn); const old = span.textContent;
    btn.classList.add('ok'); span.textContent = label;
    navigator.vibrate?.(15);
    setTimeout(() => { btn.classList.remove('ok'); span.textContent = old; }, 2000);
  }
  $('#copyAddr').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (await copyText('הצפירה 10, תל אביב')) { toast('הכתובת הועתקה', true); flashOk(btn, 'הועתק!'); } else toast('לא הצלחנו להעתיק');
  });

  // ---------- מתנה ----------
  const gift = $('#giftOpen');
  if (C.PAYBOX_URL) {
    gift.href = C.PAYBOX_URL;
    gift.addEventListener('click', (e) => { e.preventDefault(); leaveTo(C.PAYBOX_URL, 'PayBox', '#1fa0c4'); });
    $('#copyGift').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (await copyText(C.PAYBOX_URL)) { toast('הקישור לפייבוקס הועתק', true); flashOk(btn, 'הקישור הועתק!'); } else toast('לא הצלחנו להעתיק');
    });
  } else {
    $('.act-gift').hidden = true; $('.actions').style.gridTemplateColumns = 'repeat(2, minmax(0,1fr))';
  }

  // ---------- יומן ----------
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const calRows = $('#calRows');
  const appleRow = $('[data-id="apple"]', calRows);
  // Apple Calendar נפתח ישירות באפליקציה (webcal) – בלי קובץ
  if (appleRow) appleRow.href = 'webcal://' + new URL(C.SITE_URL).host + '/rani-bar-mitzvah.ics';
  const firstEl = $(`[data-id="${isIOS ? 'apple' : 'google'}"]`, calRows); if (firstEl) calRows.prepend(firstEl);
  $$('[data-ics]', calRows).forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); openSheet('ics');
    $('#icsOpen').href = a.href;
    setTimeout(() => { window.location.href = a.href; }, 150);
  }));

  $$('[data-open]').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.open)));

  // ---------- אישור הגעה ----------
  const st = { attending: true, count: 1, id: null, status: 'idle' };
  const f = {
    name: $('#fName'), note: $('#fNote'), form: $('#rsvpForm'), err: $('#rsvpErr'), send: $('#sendBtn'),
    plus: $('#plus'), minus: $('#minus'), val: $('#countVal'),
  };
  function renderRsvp() {
    $$('.ch', sheet).forEach((b) => { b.setAttribute('aria-checked', String((b.dataset.v === 'yes') === st.attending)); });
    $('#countWrap').classList.toggle('closed', !st.attending);
    f.val.textContent = st.count;
    f.plus.disabled = st.count >= C.MAX_GUESTS; f.minus.disabled = st.count <= 1;
    sheet.classList.toggle('declined', !st.attending);
  }
  $$('.ch', sheet).forEach((b) => b.addEventListener('click', () => {
    st.attending = b.dataset.v === 'yes'; renderRsvp();
    b.classList.remove('pop'); void b.offsetWidth; if (!reduced) b.classList.add('pop');
  }));
  f.plus.addEventListener('click', () => { st.count = Math.min(C.MAX_GUESTS, st.count + 1); renderRsvp(); });
  f.minus.addEventListener('click', () => { st.count = Math.max(1, st.count - 1); renderRsvp(); });
  // לחיצה על שדה ההערה לא מסתירה אותו כשהמקלדת נפתחת (מצב קומפקטי)
  f.note.addEventListener('focus', () => sheet.classList.add('note-open'));
  $('#noteLink').addEventListener('click', () => { sheet.classList.add('note-open'); f.note.focus(); });
  f.form.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } }));

  function openRsvp(focusName) {
    const saved = store.get();
    // ברירת מחדל לאישור חדש: מגיעים, אורח אחד, בלי הערה
    st.id = saved?.id || null;
    st.attending = saved ? saved.attending !== false : true;
    st.count = saved ? Math.min(C.MAX_GUESTS, Math.max(1, saved.count || 1)) : 1;
    f.name.value = saved?.name || '';
    f.note.value = saved?.note || '';
    f.err.hidden = true; f.send.disabled = false; f.send.textContent = 'שליחה'; f.send.removeAttribute('aria-busy');
    sheet.classList.remove('note-open');
    renderRsvp();
    openSheet('rsvp');
    if (focusName) f.name.focus();   // באותה לחיצה – כדי שהמקלדת תיפתח גם ב-iOS
    // אם יש אישור שמור שלא אומת לאחרונה – בודקים מול השרת שלא נמחק (ואם נמחק, חוזרים לברירות המחדל)
    if (saved && !saved.pending && Date.now() - (saved.verified || 0) > 15000) syncStatus();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function once(action, data, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(C.SHEETS_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...data }), signal: ctl.signal, redirect: 'follow', cache: 'no-store' });
      const j = await res.json();
      if (!j.ok) { const e = new Error(j.error || 'שגיאה'); e.server = true; e.code = j.code; throw e; }
      return j;
    } finally { clearTimeout(t); }
  }
  // שגיאה "סופית" = השרת דחה במפורש (נתון לא תקין וכו'). שגיאת שרת כללית / עומס / חוסר רשת – ננסה שוב.
  const permanent = (e) => !!(e && e.server && e.code && e.code !== 'rate' && e.code !== 'busy');
  // שליחה עם ניסיונות חוזרים (הפעולה אידמפוטנטית – אותו id/מכשיר לא יוצר כפילות)
  async function api(action, data, onRetry) {
    if (!C.SHEETS_API_URL) throw new Error('not-configured');
    let last;
    for (let i = 0; i < 3; i++) {
      if (i) { onRetry?.(); await sleep(700 * i); }
      try { return await once(action, data, i ? 25000 : 18000); } catch (e) { if (permanent(e)) throw e; last = e; }
    }
    throw last;
  }

  // שליחה "אופטימית": מסך התודה מופיע מיד, והשליחה לשרת רצה ברקע עם ניסיונות חוזרים.
  // אם נכשלה – האישור נשמר במכשיר כ"ממתין" ונשלח שוב אוטומטית (טעינה/חזרה לדף/חזרת רשת).
  const sendStatus = $('#sendStatus');
  let flushing = false; let retryTimer = 0;
  function setSendStatus(txt) { sendStatus.textContent = txt || ''; sendStatus.hidden = !txt; }
  async function flushPending() {
    const s = store.get();
    if (!s?.pending || flushing || !C.SHEETS_API_URL) return;
    flushing = true; clearTimeout(retryTimer);
    setSendStatus('שולחים את האישור…');
    try {
      const r = await api(s.exists ? 'rsvp.update' : 'rsvp.create', { id: s.id, name: s.name, attending: s.attending, count: s.attending ? s.count : 0, note: s.note, hp: '', dev: deviceId });
      const cur = store.get();
      // אם בינתיים נשלח עדכון חדש יותר – משאירים אותו כ"ממתין"
      if (cur && cur.rev === s.rev) store.set({ id: r.id || s.id, name: s.name, attending: s.attending, count: s.count, note: s.note, exists: true, verified: Date.now() });
      setSendStatus(cur && cur.rev !== s.rev ? 'שולחים את האישור…' : 'האישור נקלט ✓');
      refreshMain();
      if (store.get()?.pending) { flushing = false; return flushPending(); }
      setTimeout(() => { if (!store.get()?.pending) setSendStatus(''); }, 2500);
    } catch (ex) {
      if (permanent(ex)) {
        // השרת דחה (למשל נתון לא תקין) – אין טעם לנסות שוב
        store.set({ ...s, pending: false }); setSendStatus(''); toast(ex.message);
      } else {
        setSendStatus('אין חיבור כרגע – ננסה לשלוח שוב אוטומטית');
        retryTimer = setTimeout(flushPending, 6000);
      }
    } finally { flushing = false; refreshMain(); }
  }
  addEventListener('online', flushPending);

  f.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    if (name.length < 2) { f.err.textContent = 'נא לכתוב שם כדי לאשר הגעה'; f.err.hidden = false; f.name.classList.add('bad'); f.name.focus(); return; }
    if ($('#hp').value) return;                                   // honeypot
    f.name.classList.remove('bad'); f.err.hidden = true;
    const prev = store.get();
    const id = prev?.id || st.id || hex(20);                      // id נוצר אצל הלקוח → ניסיון חוזר לא יוצר כפילות
    const count = st.attending ? st.count : 0;
    store.set({ id, name, attending: st.attending, count: count || 1, note: f.note.value.trim(), pending: true, exists: !!prev?.exists, rev: Date.now() });
    st.id = id;
    refreshMain();
    showThanks(name, st.attending, count);
    flushPending();
  });

  function showThanks(name, attending, count) {
    const first = name.split(' ')[0];
    $('#thanksTitle').textContent = attending ? `תודה ${first}!` : 'חבל!';
    const line = $('#thanksLine'); line.replaceChildren();
    if (attending) {
      line.append('מגיעים: ');
      const b = document.createElement('b'); b.textContent = count === 1 ? 'אורח אחד' : `${count} אורחים`; line.append(b, '. נתראה ב-');
      const d = document.createElement('bdi'); d.setAttribute('dir', 'ltr'); d.textContent = '16.12'; line.append(d, '!');
    } else line.textContent = 'תודה שעדכנתם 💛';
    showView('thanks'); sheet.classList.remove('compact', 'note-open', 'declined');
  }
  $('#editRsvp').addEventListener('click', () => openRsvp(false));

  // ---------- שורת האישור בדף הראשי ----------
  const quick = $('#quick'); const qName = $('#quickName'); const qBtn = $('.quick-btn', quick); const banner = $('.banner');
  const bannerText = banner.textContent;
  function refreshMain() {
    const saved = store.get();
    if (saved?.id) {
      // כבר אישרו מהמכשיר הזה → אין שליחה חוזרת, רק עריכה
      qName.hidden = true; quick.classList.add('done');
      qBtn.textContent = 'עריכת האישור ✏️';
      banner.textContent = saved.pending ? 'שולחים את האישור…' : (saved.attending === false ? 'עדכנתם שלא תגיעו' : 'תודה! אישרתם הגעה ✓');
    } else {
      qName.hidden = false; quick.classList.remove('done'); qBtn.textContent = 'אישור הגעה ✏️'; banner.textContent = bannerText;
    }
  }
  refreshMain();
  // סנכרון מול השרת: אם הניהול מחק את האישור – חוזרים למצב ההתחלתי; אם עדכן – מציגים את הנתונים העדכניים
  let syncing = false;
  async function syncStatus() {
    const saved = store.get();
    if (!saved?.id || saved.pending || flushing || syncing || !C.SHEETS_API_URL) return;
    syncing = true;
    try {
      const r = await once('rsvp.status', { id: saved.id, dev: deviceId }, 15000);
      const now = store.get();
      if (!now || now.pending || now.id !== saved.id) return;     // בינתיים השתנה משהו מקומית
      if (!r.exists) {
        try { localStorage.removeItem(C.STORAGE_KEY); } catch { /* */ }
        st.id = null;
        if (current === 'rsvp') {                                 // הטופס פתוח עם נתונים ישנים → ברירות מחדל
          st.attending = true; st.count = 1; if (f.name.value === saved.name) f.name.value = ''; f.note.value = ''; renderRsvp();
        }
        refreshMain();
        if (current === 'thanks') closeSheet();
      } else {
        const same = r.name === now.name && r.attending === now.attending && r.count === now.count && r.note === now.note;
        store.set({ id: r.id, name: r.name, attending: r.attending, count: r.count || 1, note: r.note, exists: true, verified: Date.now() });
        if (!same) refreshMain();
      }
    } catch { /* אין רשת – משאירים את המצב המקומי */ } finally { syncing = false; }
  }
  if (store.get()?.pending) flushPending(); else syncStatus();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (store.get()?.pending) flushPending(); else syncStatus(); } });
  window.addEventListener('pageshow', (e) => { if (e.persisted) { if (store.get()?.pending) flushPending(); else syncStatus(); } });
  // לחיצה על שדה השם פותחת את גיליון האישור עם המקלדת – הדף הראשי נשאר יציב
  qName.addEventListener('focus', () => { if (!sheet.hidden) return; qName.blur(); openRsvp(true); });
  qName.addEventListener('click', (e) => { e.preventDefault(); if (sheet.hidden) { qName.blur(); openRsvp(true); } });
  quick.addEventListener('submit', (e) => { e.preventDefault(); openRsvp(!store.get()?.id); });
})();
