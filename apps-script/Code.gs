/**
 * Rani Bar-Mitzvah RSVP backend – Google Apps Script bound to a Google Sheet.
 * Script property required: ADMIN_PASSWORD  (Project Settings → Script properties)
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 */
var SHEET_NAME = 'RSVP';
var HEADERS = ['id', 'name', 'attending', 'count', 'note', 'created', 'updated', 'device'];
var MAX_GUESTS = 5;
var TOKEN_TTL = 3600; // שעה

function doGet() { return out_({ ok: true, service: 'rani-rsvp' }); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var req;
    try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'בקשה לא תקינה' }); }
    if (!req || typeof req !== 'object') return out_({ ok: false, error: 'בקשה לא תקינה' });
    switch (req.action) {
      case 'rsvp.create': return out_(rsvpCreate_(req));
      case 'rsvp.update': return out_(rsvpUpdate_(req));
      case 'rsvp.status': return out_(rsvpStatus_(req));
      case 'admin.login': return out_(login_(req));
      case 'admin.logout': CacheService.getScriptCache().remove('t_' + String(req.token || '')); return out_({ ok: true });
      case 'admin.list': requireAuth_(req); return out_({ ok: true, guests: readAll_() });
      case 'admin.add': requireAuth_(req); return out_(adminAdd_(req));
      case 'admin.update': requireAuth_(req); return out_(adminUpdate_(req));
      case 'admin.delete': requireAuth_(req); return out_(adminDelete_(req));
      default: return out_({ ok: false, error: 'פעולה לא מוכרת' });
    }
  } catch (err) {
    if (err && err.code) return out_({ ok: false, code: err.code, error: err.message });
    return out_({ ok: false, error: 'שגיאת שרת' });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, msg) { var e = new Error(msg); e.code = code; throw e; }

var _sh = null; // שמירה בזיכרון בתוך הרצה אחת – חוסך קריאות חוזרות לגיליון
function sheet_() {
  if (_sh) return _sh;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 1000, HEADERS.length).setNumberFormat('@'); // טקסט בלבד – מונע הזרקת נוסחאות
  } else if (String(sh.getRange(1, 8).getValue()) !== 'device') {
    sh.getRange(1, 8).setValue('device').setFontWeight('bold');
    sh.getRange(2, 8, 1000, 1).setNumberFormat('@');
  }
  _sh = sh;
  return sh;
}

// ---- הגנה על המידע: שום דבר לא הולך לאיבוד ----
// לפני כל דריסה או מחיקה של שורה – העתק של הגרסה הקודמת נשמר בגיליון ARCHIVE; פעולות ניהול וכניסות נרשמות ב-LOG.
function aux_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name); sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold'); sh.setFrozenRows(1);
  }
  return sh;
}
function auxAppend_(name, headers, vals) {
  var sh = aux_(name, headers); var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, vals.length).setNumberFormat('@').setValues([vals.map(function (v) { return String(v == null ? '' : v); })]);
}
function archive_(row, reason) {
  try {
    var vals = sheet_().getRange(row, 1, 1, HEADERS.length).getValues()[0];
    auxAppend_('ARCHIVE', ['when', 'reason'].concat(HEADERS), [now_(), reason].concat(vals));
  } catch (e) { /* גיבוי לא יכשיל את הפעולה עצמה */ }
}
function log_(what, detail) {
  try { auxAppend_('LOG', ['when', 'what', 'detail'], [now_(), what, detail || '']); } catch (e) { /* */ }
}

function clean_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.substring(0, max);
  return s;
}
function validate_(req) {
  var name = clean_(req.name, 60);
  if (name.length < 2) fail_('bad_input', 'נא לכתוב שם');
  var attending = req.attending !== false && req.attending !== 'false';
  var count = attending ? Math.floor(Number(req.count)) : 0;
  if (attending && (!(count >= 1) || count > MAX_GUESTS)) fail_('bad_input', 'כמות לא תקינה');
  return { name: name, attending: attending, count: count, note: clean_(req.note, 200) };
}
function devHash_(req) {
  var d = req.dev;
  if (typeof d !== 'string' || !/^[0-9a-f]{32}$/.test(d)) fail_('bad_input', 'שגיאה');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'rani-bm26:' + d), s = '';
  for (var i = 0; i < bytes.length; i++) s += ((bytes[i] & 255) + 256).toString(16).substring(1);
  return s;
}
function toRow_(id, d, created, updated, device) {
  return [id, d.name, d.attending ? 'yes' : 'no', String(d.count), d.note, created, updated, device || ''];
}
// הוספת שורה בטוחה: תמיד כטקסט (גם מעבר ל-1000 השורות המעוצבות מראש) – מונע הזרקת נוסחאות
function appendRow_(row) {
  var sh = sheet_(); var r = sh.getLastRow() + 1;
  var rng = sh.getRange(r, 1, 1, HEADERS.length);
  if (r > 1000) rng.setNumberFormat('@');
  rng.setValues([row]);
}
function readAll_() {
  var sh = sheet_(); var n = sh.getLastRow(); if (n < 2) return [];
  var vals = sh.getRange(2, 1, n - 1, HEADERS.length).getValues(); var res = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i]; if (!r[0]) continue;
    res.push({ id: String(r[0]), name: String(r[1]), attending: String(r[2]) === 'yes', count: Number(r[3]) || 0, note: String(r[4]), created: String(r[5]), updated: String(r[6]) });
  }
  res.sort(function (a, b) { return a.updated < b.updated ? 1 : -1; });
  return res;
}
function findRow_(col, value) {
  var sh = sheet_(); var n = sh.getLastRow(); if (n < 2 || !value) return -1;
  var vals = sh.getRange(2, col, n - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(value)) return i + 2;
  return -1;
}
function newId_() { return Utilities.getUuid().replace(/-/g, '').substring(0, 20); }
function now_() { return new Date().toISOString(); }

function rateLimit_(key, max, windowSec) {
  var c = CacheService.getScriptCache(); var k = 'rl_' + key; var v = Number(c.get(k) || 0);
  if (v >= max) fail_('rate', 'יותר מדי בקשות, נסו שוב בעוד רגע');
  c.put(k, String(v + 1), windowSec);
}

function checkHp_(req) { if (req.hp) fail_('bad_input', 'שגיאה'); }

function writeRow_(row, id, d, device) {
  archive_(row, 'before-update');
  var sh = sheet_(); var created = String(sh.getRange(row, 6).getValue());
  sh.getRange(row, 1, 1, HEADERS.length).setNumberFormat('@').setValues([toRow_(id, d, created, now_(), device)]);
}

// אישור אחד למכשיר: אם המכשיר כבר אישר – מעדכנים את אותה שורה. id מהלקוח → ניסיון חוזר לא יוצר כפילות.
function rsvpCreate_(req) {
  checkHp_(req); rateLimit_('create', 150, 600);
  var d = validate_(req); var device = devHash_(req);
  var row = findRow_(8, device);
  if (row > 0) { var sh = sheet_(); var id0 = String(sh.getRange(row, 1).getValue()); writeRow_(row, id0, d, device); return { ok: true, id: id0 }; }
  var id = /^[0-9a-f]{20}$/.test(String(req.id || '')) ? String(req.id) : newId_();
  if (findRow_(1, id) > 0) id = newId_();
  var t = now_();
  appendRow_(toRow_(id, d, t, t, device));
  return { ok: true, id: id };
}
function rsvpUpdate_(req) {
  checkHp_(req); rateLimit_('update', 150, 600);
  var d = validate_(req); var device = devHash_(req);
  var row = findRow_(1, req.id);
  if (row < 0) return rsvpCreate_(req);
  var sh = sheet_();
  if (String(sh.getRange(row, 8).getValue()) !== device) fail_('forbidden', 'אי אפשר לעדכן אישור ממכשיר אחר');
  writeRow_(row, String(req.id), d, device);
  return { ok: true, id: String(req.id) };
}

// האם האישור של המכשיר עדיין קיים (למשל נמחק ע"י הניהול)? מחזיר את הנתונים העדכניים אם כן.
function rsvpStatus_(req) {
  rateLimit_('status', 600, 600);
  var device = devHash_(req);
  var row = findRow_(8, device);
  if (row < 0) return { ok: true, exists: false };
  var r = sheet_().getRange(row, 1, 1, HEADERS.length).getValues()[0];
  if (String(req.id || '') && String(r[0]) !== String(req.id)) return { ok: true, exists: false };
  return { ok: true, exists: true, id: String(r[0]), name: String(r[1]), attending: String(r[2]) === 'yes', count: Number(r[3]) || 0, note: String(r[4]) };
}

function login_(req) {
  var c = CacheService.getScriptCache();
  var fails = Number(c.get('lf') || 0);
  if (fails >= 8) fail_('locked', 'יותר מדי ניסיונות');
  var pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pw) fail_('config', 'לא הוגדרה סיסמה בשרת');
  if (!safeEq_(String(req.password || ''), pw)) { c.put('lf', String(fails + 1), 900); log_('login.fail', 'attempt ' + (fails + 1)); Utilities.sleep(800); fail_('bad_password', 'סיסמה שגויה'); }
  c.remove('lf'); log_('login.ok', '');
  var token = Utilities.getUuid() + Utilities.getUuid();
  c.put('t_' + token, '1', TOKEN_TTL);
  return { ok: true, token: token };
}
function safeEq_(a, b) {
  var x = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a), y = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  var d = 0; for (var i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0;
}
function requireAuth_(req) {
  var t = String(req.token || '');
  if (t.length < 40 || !CacheService.getScriptCache().get('t_' + t)) fail_('auth', 'נדרשת התחברות');
}
function adminAdd_(req) { var d = validate_(req); var id = newId_(), t = now_(); appendRow_(toRow_(id, d, t, t, '')); log_('admin.add', id + ' ' + d.name); return { ok: true, id: id }; }
function adminUpdate_(req) {
  var d = validate_(req); var row = findRow_(1, req.id); if (row < 0) fail_('not_found', 'האורח לא נמצא');
  var sh = sheet_(); var device = String(sh.getRange(row, 8).getValue());
  writeRow_(row, String(req.id), d, device); log_('admin.update', String(req.id));
  return { ok: true };
}
function adminDelete_(req) { var row = findRow_(1, req.id); if (row < 0) fail_('not_found', 'האורח לא נמצא'); archive_(row, 'admin.delete'); log_('admin.delete', String(req.id)); sheet_().deleteRow(row); return { ok: true }; }
