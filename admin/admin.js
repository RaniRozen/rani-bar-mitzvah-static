(() => {
  'use strict';
  const C = window.RANI;
  const $ = (s) => document.querySelector(s);
  const TOK = 'raniAdminTok';
  let token = sessionStorage.getItem(TOK) || '';
  let guests = [], filter = 'all', query = '', editing = null, ma = true, mc = 1, delArmed = false, busy = false, pending = 0;
  const syncBadge = () => document.body.classList.toggle('saving', pending > 0);

  function toast(msg, ok) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (ok ? ' ok' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3000); }

  async function api(action, data) {
    if (!C.SHEETS_API_URL) throw new Error('כתובת ה-API עדיין לא הוגדרה');
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(C.SHEETS_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token, ...data }), signal: ctl.signal, redirect: 'follow' });
      const j = await r.json();
      if (!j.ok) { const e = new Error(j.error || 'שגיאה'); e.code = j.code; throw e; }
      return j;
    } catch (e) { if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('אין חיבור, נסו שוב'); throw e; }
    finally { clearTimeout(to); }
  }

  // ---- כניסה ----
  function showLogin() { $('#dash').hidden = true; $('#login').hidden = false; token = ''; sessionStorage.removeItem(TOK); setTimeout(() => $('#pw').focus(), 50); }
  async function showDash() { $('#login').hidden = true; $('#dash').hidden = false; await load(); }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); if (busy) return;
    const pw = $('#pw').value; const err = $('#loginErr'); err.hidden = true; $('.pw').classList.remove('bad');
    if (!pw) { err.hidden = false; $('.pw').classList.add('bad'); return; }
    busy = true; const b = $('#loginBtn'); b.disabled = true; b.textContent = '⟳ רגע…'; b.setAttribute('aria-busy', 'true');
    try {
      const r = await api('admin.login', { password: pw });
      token = r.token; sessionStorage.setItem(TOK, token); $('#pw').value = '';
      await showDash();
    } catch (ex) {
      err.textContent = ex.code === 'locked' ? 'יותר מדי ניסיונות, נסו שוב בעוד כמה דקות' : (ex.code === 'bad_password' || !ex.code ? (/חיבור|API/.test(ex.message) ? ex.message : 'סיסמה שגויה, נסו שוב') : ex.message);
      err.hidden = false; $('.pw').classList.add('bad'); $('#pw').select();
    } finally { busy = false; b.disabled = false; b.textContent = 'כניסה'; b.removeAttribute('aria-busy'); }
  });
  $('#logoutBtn').addEventListener('click', async () => { try { await api('admin.logout'); } catch { /* */ } showLogin(); });

  // ---- נתונים ----
  async function load(silent) {
    try { const r = await api('admin.list'); guests = r.guests || []; render(); }
    catch (ex) { if (ex.code === 'auth') { showLogin(); toast('ההתחברות פגה, היכנסו שוב'); } else if (!silent) toast(ex.message); }
  }
  const fmt = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function iconBtn(cls, label, icon, fn) {
    const b = el('button', 'ib ' + cls); b.type = 'button'; b.setAttribute('aria-label', label);
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '../assets/icons/sprite.svg#' + icon); s.append(u); b.append(s);
    b.addEventListener('click', fn); return b;
  }
  function render() {
    const yes = guests.filter((g) => g.attending), no = guests.filter((g) => !g.attending);
    const total = yes.reduce((a, g) => a + (+g.count || 0), 0);
    $('#sTotal').textContent = total; $('#sYes').textContent = yes.length; $('#sPlus').textContent = total - yes.length; $('#sNo').textContent = no.length;
    $('#cAll').textContent = guests.length; $('#cYes').textContent = yes.length; $('#cNo').textContent = no.length;
    const q = query.trim().toLowerCase();
    const list = guests.filter((g) => (filter === 'all' || (filter === 'yes') === !!g.attending) && (!q || String(g.name).toLowerCase().includes(q)));
    const body = $('#rows'); body.replaceChildren();
    for (const g of list) {
      const tr = el('tr');
      tr.append(el('td', 'nm', g.name));
      const st = el('td', 'st'); st.append(el('span', 'tag ' + (g.attending ? 'y' : 'n'), g.attending ? 'מגיע/ה' : 'לא מגיע/ה')); tr.append(st);
      tr.append(el('td', 'ct', g.attending ? String(g.count) : '—'));
      const nt = el('td', 'nt', g.note || ''); nt.title = g.note || ''; tr.append(nt);
      const dt = el('td', 'dt'); const bd = el('bdi', '', fmt(g.updated)); bd.dir = 'ltr'; dt.append(bd); tr.append(dt);
      const ac = el('td', 'ac'); const w = el('div', 'acts');
      w.append(iconBtn('', 'עריכה', 'i-edit', () => openModal(g)), iconBtn('del', 'מחיקה', 'i-trash', () => openModal(g, true)));
      ac.append(w); tr.append(ac); body.append(tr);
    }
    $('#empty').hidden = list.length > 0;
  }
  $('#q').addEventListener('input', (e) => { query = e.target.value; render(); });
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f; document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render();
  }));

  // ---- מודאל ----
  const scrim = $('#mScrim'); let opener = null;
  function paint() {
    document.querySelectorAll('#mForm .ch').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.v === 'yes') === ma)));
    $('#mCountWrap').hidden = !ma; $('#mCount').textContent = mc; $('#mPlus').disabled = mc >= C.MAX_GUESTS; $('#mMinus').disabled = mc <= 1;
  }
  function resetDel() { delArmed = false; const s = $('#mDel span'); s.textContent = 'מחיקה'; }
  function openModal(g, askDelete) {
    opener = document.activeElement; editing = g || null; resetDel();
    $('#mTitle').textContent = g ? 'עריכת אורח' : 'הוספת אורח';
    $('#mName').value = g ? g.name : ''; $('#mNote').value = g ? (g.note || '') : '';
    ma = g ? !!g.attending : true; mc = g ? (+g.count || 1) : 1;
    $('#mDel').hidden = !g; $('#mErr').hidden = true; $('#mName').classList.remove('bad');
    paint(); scrim.hidden = false; setTimeout(() => (askDelete ? $('#mDel') : $('#mName')).focus(), 30);
    if (askDelete) { delArmed = true; $('#mDel span').textContent = 'לחצו שוב למחיקה סופית'; }
  }
  function closeModal() { scrim.hidden = true; editing = null; if (opener && opener.focus) opener.focus(); }
  $('#addBtn').addEventListener('click', () => openModal(null));
  $('#mCancel').addEventListener('click', closeModal);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (scrim.hidden) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') { const f = [...scrim.querySelectorAll('button,input,textarea')].filter((n) => !n.disabled && n.offsetParent); const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  });
  document.querySelectorAll('#mForm .ch').forEach((b) => b.addEventListener('click', () => { ma = b.dataset.v === 'yes'; paint(); }));
  $('#mPlus').addEventListener('click', () => { mc = Math.min(C.MAX_GUESTS, mc + 1); paint(); });
  $('#mMinus').addEventListener('click', () => { mc = Math.max(1, mc - 1); paint(); });
  $('#mForm').addEventListener('submit', async (e) => {
    e.preventDefault(); if (busy) return;
    const name = $('#mName').value.trim(); const err = $('#mErr');
    if (name.length < 2) { err.textContent = 'נא לכתוב שם'; err.hidden = false; $('#mName').classList.add('bad'); $('#mName').focus(); return; }
    // עדכון מיידי במסך (optimistic) – השרת מתעדכן ברקע; אם נכשל, חוזרים למצב הקודם
    const d = { name, attending: ma, count: ma ? mc : 0, note: $('#mNote').value.trim() };
    const before = guests.slice(); const target = editing;
    const stamp = new Date().toISOString();
    if (target) guests = guests.map((g) => (g.id === target.id ? { ...g, ...d, updated: stamp } : g));
    else guests = [{ id: 'tmp' + Date.now(), ...d, created: stamp, updated: stamp }, ...guests];
    render(); closeModal();
    pending++; syncBadge();
    try {
      if (target) await api('admin.update', { id: target.id, ...d }); else await api('admin.add', d);
      toast('נשמר', true);
    } catch (ex) {
      guests = before; render();
      if (ex.code === 'auth') { showLogin(); } else toast('השמירה נכשלה: ' + ex.message);
    } finally { pending--; syncBadge(); if (!pending) load(true); }
  });
  $('#mDel').addEventListener('click', async () => {
    if (!editing) return;
    if (!delArmed) { delArmed = true; $('#mDel span').textContent = 'לחצו שוב למחיקה סופית'; return; }
    const target = editing; const before = guests.slice();
    guests = guests.filter((g) => g.id !== target.id);
    render(); closeModal();
    pending++; syncBadge();
    try { if (!String(target.id).startsWith('tmp')) await api('admin.delete', { id: target.id }); toast('נמחק', true); }
    catch (ex) { guests = before; render(); if (ex.code === 'auth') showLogin(); else toast('המחיקה נכשלה: ' + ex.message); }
    finally { pending--; syncBadge(); if (!pending) load(true); }
  });

  // ---- ייצוא CSV ----
  $('#exportBtn').addEventListener('click', () => {
    const safe = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = [['שם', 'סטטוס', 'כמות', 'הערה', 'עודכן']].concat(guests.map((g) => [g.name, g.attending ? 'מגיע/ה' : 'לא מגיע/ה', g.attending ? g.count : 0, g.note || '', g.updated || '']));
    const csv = '﻿' + rows.map((r) => r.map(safe).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'rani-guests.csv';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  if (token) showDash().catch(showLogin); else showLogin();
})();
