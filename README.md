# הזמנה לבר מצווה של רני – אתר סטטי + Google Sheets

## הפעלה (פעם אחת)
1. צרו Google Sheet חדש → Extensions → Apps Script → הדביקו את `apps-script/Code.gs`.
2. Project Settings → Script properties → הוסיפו `ADMIN_PASSWORD` (הסיסמה שלכם לניהול).
3. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone → העתיקו את כתובת ה-`/exec`.
4. הדביקו אותה ב-`js/config.js` בשדה `SHEETS_API_URL`.
5. העלו את התיקייה לאירוח סטטי (Render / Netlify / GitHub Pages). הניהול: `/admin/`.

## הגדרות (ב-`js/config.js`)
`SITE_URL`, `PAYBOX_URL`, `SHEETS_API_URL`. בנוסף עדכנו את הדומיין בתגיות og ב-`index.html` (חייב https מוחלט לוואטסאפ).

## בדיקה מקומית
`node test/mock-server.js` ← http://localhost:8099 (סיסמת ניהול לבדיקה: test1234, הנתונים בזיכרון בלבד).
