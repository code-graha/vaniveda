# VaniVeda form backend (Google Apps Script + Google Sheets)

This turns a Google Sheet into the "database" for the forms on the
site — the Contact enrolment form, the Courses page exam-matcher quiz, and
the four level tests (two French, two Spanish) — and gives you an admin
dashboard to see submissions and change their status (New / Contacted /
Enrolled / Not Interested).

No servers, no hosting bill: Google runs this for you for free at normal
small-business volume.

**Want to see the admin portal before setting any of this up?** Just open
[`../admin/index.html`](../admin/index.html) (one level up from this
folder, in the site root's `admin/` directory) directly in a browser
(double-click it). It detects it isn't running inside Apps Script and shows
sample data instead — same look, same Overview dashboard, same status
dropdowns — so you can review the design and interactions with nothing
deployed yet. A yellow banner reminds you it's sample data. Once deployed
and opened via the real Web App URL (step 5 below), that banner disappears
and it switches to your live Sheet.

## 1. Create the Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet. Name it something like **VaniVeda Submissions**.
2. You don't need to create any tabs yourself. Every sheet — **Contact
   Enrolments**, **Course Quiz Leads**, **Test Results**, **Students** (see
   "Students: one profile per person" below) and **Admin** (holding the
   dashboard password) — is created automatically: the moment the script
   is installed and the Sheet is reopened (step 2.5), every tab and its
   header row is created up front, with no manual step. A **Set Up All
   Sheets** menu item is still there too, for an on-demand re-run — see
   step 2.5. All four level-test pages share the one **Test Results**
   tab — see "Test Results: one tab, four tests" below.

## 2. Add the script

1. In the Sheet, go to **Extensions → Apps Script**. This opens the Apps
   Script editor, already linked to your Sheet.
2. Delete the placeholder `Code.gs` content and paste in the contents of
   [`Code.gs`](Code.gs) from this folder.
3. In the editor, click the **+** next to "Files" → **HTML** → name it
   exactly `Admin` (Apps Script adds the `.html` itself — this internal name
   is what matters to Apps Script, not the file's path on disk, which is why
   the source file is called `admin/index.html` even though it must be pasted in
   as a file named `Admin`). Delete the placeholder content and paste in
   [`../admin/index.html`](../admin/index.html) (site root, not this folder).
4. Nothing to configure in the code itself for admin access — the password
   lives in the Sheet, not `Code.gs` (see step 5). Click the **Save** icon
   (or `Ctrl+S` / `Cmd+S`).
5. Close the Apps Script editor tab and reload the Sheet itself in the
   browser. A new **VaniVeda Admin** menu appears in the Sheet's menu bar
   (next to Help), and every tab and its header row is created
   automatically at this point — nothing left to click. The menu's **Set
   Up All Sheets** item is there for an on-demand re-run (e.g. after
   adding a new formType) with a confirmation popup; safe to run anytime,
   it never touches a sheet that already exists.

## 3. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Fill in:
   - **Description**: `VaniVeda forms` (or anything)
   - **Execute as**: **Me** (your account)
   - **Who has access**: **Anyone**
     
     This has to be "Anyone" so the public contact/quiz/test forms can
     submit without visitors needing a Google account. The admin page is
     still kept private by its password screen (step 5), not by this
     deployment setting.
4. Click **Deploy**. The first time, Google will ask you to authorize the
   script — click through the "unverified app" warning (it's unverified
   because it's your own private script, not a public one).
5. Copy the **Web app URL** it gives you — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

Whenever you edit `Code.gs` or `Admin` afterward, you need to
**Deploy → Manage deployments → edit (pencil icon) → New version → Deploy**
for the changes to go live — saving alone isn't enough.

## 4. Connect the website

Open `../assets/config.js` (i.e. `assets/config.js` one level up from this
folder, in the site root) and set:

```js
window.VV_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

using the URL you copied. That's the only file you need to touch — all
four forms already know to send their data here (see `vvSubmitToSheet` in
`assets/main.js`).

## 5. Open the admin portal

Visit your Web app URL directly (no `?admin=...` or any query param needed
— just the plain `.../exec` link). Bookmark it.

The first thing you'll see is a password screen. The password isn't set in
code — the script auto-creates an **Admin** tab in your Sheet the first time
it runs, with a default password of `CHANGE-ME`. **Open that tab and change
it immediately** to something real; there's no redeploy needed, editing the
cell takes effect on the next login attempt.

Once signed in, you land on **Overview** — built around students and leads,
not raw submission rows: total students, new leads, contacted, enrolled and
repeat-student counts; a students-by-form breakdown (click a card to jump
straight to that form's table); a donut chart of student status; and a
"Tests" section (completions, average score, a level-distribution bar
chart, completions by language). There's no activity feed — for "what did
this specific person do," that's what Students (next) is for.

**Students** solves the "same person shows up more than once" problem — it
groups every submission across all three forms by email address, so a
student who filled the contact form, took a placement quiz, *and* sat a
level test shows up once, with all of it in one place, instead of as three
disconnected rows in three different tables. The list is searchable and
sortable (most recent activity / most submissions / name), shows a
submission count badge (highlighted red once someone has more than one),
and clicking a row drills into that student's full history — every
submission they've made, grouped by form, with every field from that row
(not just the columns visible in the main table). Someone submitting the
*same* form more than once (e.g. contacting twice) is grouped exactly the
same way as someone using two different forms — either way you see one
profile, not scattered rows. **Status lives here and only here** — see
"Students: one profile per person" below for why.

Next to that, **Share Tests** lists all four hidden evaluation pages (see
"Hidden evaluation pages" below) with a link to copy, a Preview button, and
a "Share with a message" panel — write or edit a short note and send it
(with the link appended) straight to WhatsApp or email, or just copy the
combined message. Every page's link is built from a `SITE_BASE_URL`
constant near the top of `admin/index.html`'s script — update it once the
real domain is live, same as everywhere else that placeholder domain
appears.

**Syllabus** works the same way as Share Tests, for the four DELF/TCF level
syllabus PDFs in the site's `assets/syllabus/` folder instead of the hidden
test pages — each card shows the level (A1–B2), a one-line description of
what that level covers, a link to copy or open, and the same
copy-message/WhatsApp/email "Share with a message" panel, pre-filled with a
short default note appropriate to that level (English for A1/A2, French for
B1/B2, matching those documents' own language). Unlike the evaluation
pages, these PDFs aren't hidden — they're meant to be handed out — so
there's no `robots.txt` exclusion for `assets/syllabus/` the way there is
for `evaluation/`. Edit the `SHARE_SYLLABUS` array near the top of
`admin/index.html`'s script to change the description or default message
for a level, or to add a new document the same way.

The link each card shows/shares is **not** a direct link to the `.pdf`
file — it points at `assets/syllabus/view?level=A1` (etc.), a protected
in-page viewer that renders the PDF into `<canvas>` elements instead of
handing it to the browser's own PDF viewer, so there's no built-in
download/print button for either Chrome or Firefox to show. The PDFs
themselves are also permission-encrypted (no print/copy/edit — see
`docs/syllabus/_protect_pdfs.py`, run once against the deployed copies in
`drafts/draft-4/assets/syllabus/`, not the editable masters in
`docs/syllabus/` — same folder name, different location, don't confuse
the two).
None of this is real DRM — it deters casual copying, not a determined
person with a screenshot — but it removes the one-click paths. If you add
a fifth syllabus PDF, update both `SHARE_SYLLABUS` here and the `LEVELS`
lookup in `assets/syllabus-viewer.js`, and run `_protect_pdfs.py` again
for the new file.

The sidebar below that lists each form's own tab — search, filter by
status/date, and sort newest-first or oldest-first; the Status column there
is a read-only badge (see below), not editable. **Log out** in the sidebar
clears the session (otherwise remembered for the browser tab via
`sessionStorage`, so you're not re-entering the password on every reload).

Note that the *page itself* loads for anyone with the URL, same as any
login page — what's actually protected is the data. Every privileged call
(loading submissions, changing a student's status) re-sends the password
and gets re-checked against the Admin sheet on the server side each time,
so there's no client-side "already logged in" state to bypass.

**Previewing the dashboard from somewhere other than the deployed URL** (a
local server, ngrok, etc. — useful while iterating on the dashboard's own
UI without redeploying every time) works too, as long as
`assets/config.js` has a real `VV_APPS_SCRIPT_URL` set. Normally the page
talks to Apps Script through `google.script.run`, a bridge Google injects
only into pages Apps Script itself serves — opened any other way, that
bridge doesn't exist, so the page falls back to a plain `fetch()` POST
straight to your deployed script instead (same `text/plain` CORS-preflight
workaround the site's own public forms already use — see `callBackend_` in
`admin/index.html` and `handleAdminAction_` in `Code.gs`). A grey
"Connected remotely" banner marks this mode, distinct from the red
"Preview mode" banner (sample data, no real backend at all). Either way
the password is still re-checked server-side on every call — this fallback
doesn't loosen that.

## Notes

- **Changing the admin password later**: open the **Admin** tab in the
  Sheet and edit the "Password" cell (row 2, column B) directly. Takes
  effect immediately — no code change, no redeploy.
- **The Admin sheet tab isn't part of the submissions dashboard.** It's
  excluded from the tabs list on purpose — it only ever holds the
  `Setting`/`Value` password row (more settings could be added there later
  the same way). Don't rename it; the script looks it up by the exact name
  "Admin".
- **This password model is intentionally simple**, matching the rest of
  this setup: it's a plaintext comparison against a cell in the Sheet.
  Anyone with edit or view access to the underlying Google Sheet can already
  see every student's data *and* the password cell, so this isn't meant to
  resist a determined insider — it's meant to keep the dashboard out of
  reach of anyone who merely finds or guesses the Web app URL.
- **Columns**: the "ID" and "Timestamp" columns on each form's sheet are
  managed by the script — editing them by hand in the Sheet is fine, but ID
  is how the admin page matches a row, so don't delete it. Each form
  sheet's own "Status" column isn't directly editable from the admin
  page — it starts as "New" on every new row and only ever changes after
  that as a side effect of a student-level status change (see "Students:
  one profile per person" below).
- **Phone numbers and `#ERROR!`**: a value like `+91 96542 24342` written
  into a cell — by this script or by typing it in by hand — gets
  auto-parsed by Sheets as a formula attempt (anything starting with `+`,
  `-`, or `=` does), which fails and shows `#ERROR!` ("Formula parse
  error" on hover) instead of the number. The real fix is the Phone
  column's own number format being set to Plain Text (`@`) —
  `ensurePhoneColumnIsPlainText_` does this on every `doPost`, not just
  when a sheet is first created, so a sheet that already existed before
  this fix was added still picks it up automatically the next time
  anything is submitted to it. `phoneAsText_`'s leading apostrophe is a
  second, redundant layer on top of that, not a substitute for it — the
  column format is what actually stops Sheets from attempting to parse
  the value in the first place. If you're looking at rows submitted
  before this fix, run `fixBrokenPhoneNumbers_` once from the Apps
  Script editor's function dropdown — it reformats the column and
  recovers each broken cell's original number from its formula's own
  source text (nothing is actually lost), then rewrites it correctly.
- **This is intentionally simple.** For real production use at scale (or if
  you need row-level access control, audit logs, GDPR-grade deletion
  workflows, etc.), a proper database behind an authenticated API would be
  the next step up from this — this setup is meant to get you a genuinely
  working, zero-cost backend today.
- **Every submission emails both the student and you, automatically.**
  After a row is saved (any form — contact, quiz, or any of the four level
  tests), the script sends two emails: an acknowledgment to the student
  (`sendAcknowledgment_` — for the two fill-in-the-blank tests this is the
  same detailed score/level email as before; the other four formTypes get
  a shorter one built around whatever they actually submitted — course
  and batch for the contact form, recommended exam for the quiz, score
  and level for the mixed-format tests), and a summary to whoever's set as
  `ADMIN_NOTIFICATION_EMAIL` near the top of `Code.gs` (defaults to
  `vanivedalanguagehub@gmail.com` — change it, or set it to `''` to turn
  admin notifications off). Both use the same branded look — dark header
  bar, red accent, VaniVeda footer — built by `brandedEmailShell_` so
  every outgoing email reads as one consistent template rather than
  several different ones. All of this is sent via `MailApp.sendEmail`
  from whichever Google account you used in "Execute as" during
  deployment (step 3.3) — that account's name/address is what recipients
  see as the sender. If a send fails (bad address, quota, etc.) the row is
  still saved; only that one email is skipped, silently — a failed
  acknowledgment never blocks the admin notification or vice versa, since
  each is its own independent best-effort call.
- **If you already deployed before the two tests were merged into one
  tab**: older deployments have separate "French Test Results" and "Niveau
  Test Results" tabs. New submissions after redeploying go into a new
  "Test Results" tab instead — the two old tabs are never written to again
  and just sit there with their historical data. If you want everything in
  one place, manually copy their rows into the new "Test Results" tab (see
  "Test Results: one tab, four tests" below for what the "Test ID" and
  "Language" values should be), then delete the two old tabs.

## Test Results: one tab, four tests

All four level-test pages — the mixed-format test and the "Test de
Niveau"/"Test de Nivel" fill-in-the-blank test, one pair per language
(French, Spanish) — write into the same **Test Results** tab instead of
separate ones, so you can see every test completion in one place, filter,
and sort across all of them. Two columns tell them apart:

- **Test ID** — each page computes this itself, client-side, as its
  language prefix (`french-` or `spanish-`) + its own current filename
  (e.g. a page at `evaluation/spanish/wrtq8mpz` sends
  `spanish-wrtq8mpz`). That means the ID **tracks a page's real URL and
  changes if the page is renamed** — the opposite of a stable identifier.
  Rows submitted before a rename keep their old Test ID; only new
  submissions after the rename get the new one. If you rename a page and
  want its history to read as one continuous series, you'd need to
  manually update the old rows' Test ID column to match.
- **Language** — `French` or `Spanish`, sent by the server based on which
  form submitted (`frenchtest`/`niveautest` vs. `spanishtest`/`niveltest`),
  independent of filename. The admin Overview dashboard uses this for a
  completions-by-language breakdown; adding a third language later just
  means a third bar, no code changes needed beyond wiring up the new
  formType the same way as the ones here (see `SHEET_NAMES` and
  `TEST_META` in `Code.gs`).

Every test formType emails the student automatically (see "Every submission
emails both the student and you" above) — the fill-in-the-blank tests
(`niveautest`/`niveltest`) get a detailed score/level email via
`sendNiveauResultEmail_`/`sendNivelResultEmail_`; the mixed-format tests
(`frenchtest`/`spanishtest`) get a shorter score/level email via the generic
`sendAcknowledgment_` in `Code.gs`.

## Students: one profile per person

**Email address is the primary key for a student** — it's the only field
every form collects, so it's what ties a Contact Enrolments row, a Course
Quiz Leads row and a Test Results row back to the same person. It's matched
case-insensitively and trimmed (`Ravi@Example.com` and
` ravi@example.com ` are the same student), but two genuinely different
email addresses are always two different students, even if the name and
phone are identical — there's no phone-based fallback matching.

A dedicated **Students** sheet is the source of truth for this: columns
`Email, Name, Phone, Status, First Seen, Last Seen, Total Submissions`.
Every `doPost` upserts a row here (see `upsertStudent_` in `Code.gs`) —
finds the existing row by email and refreshes Name/Phone/Last
Seen/Total Submissions, or creates a new one with Status `New` if this
email hasn't been seen before. **Status is edited from the Status dropdown
in a student's detail view in the admin's Students tab**, which calls
`updateStudentStatus` — that same call also writes the new status onto
every one of that student's existing rows in Contact Enrolments, Course
Quiz Leads and Test Results (see `updateRowStatusesForEmail_`), so those
sheets' own Status column always agrees with the Students tab instead of
just showing whatever was true when each row was first submitted.

A fresh Contact Enrolments or Course Quiz Leads submission also resets an
existing student's Status back to `New` — a new enquiry or quiz lead means
they need attention again, even if they'd previously been marked Contacted,
Enrolled or Not Interested. A Test Results submission (someone retaking a
level test) never does this reset, since that's not a fresh enquiry. This
whole design replaced an earlier one where each form's own sheet had its
own independently-editable Status column, which made "what's this person's
actual status?" ambiguous the moment they'd used more than one form (or the
same form twice) with different statuses set on each row.

**If you already had submissions before this update**: the Students sheet
starts empty and only gets a row for someone the *next* time they submit
anything — it isn't backfilled from historical rows automatically. Until
then (or forever, for someone who never submits again), the admin's
Students tab still shows them — built from their existing rows on the
other sheets, same as always — but with Status defaulting to `New`,
regardless of whatever value was sitting in their old rows' individual
Status columns. If you want to preserve that history, manually add rows to
the Students sheet (one per person, with the status you want) before
anyone reopens the dashboard.

## Hidden evaluation pages

The four level-test pages — two French under `evaluation/french/`, two
Spanish under `evaluation/spanish/` — aren't linked from anywhere on the
site and use random 8-character filenames instead of predictable ones like
`french-test` — the random name is the only thing keeping them from
being casually found, so don't link to them publicly or rename them to
anything guessable. `robots.txt` blocks the whole `/evaluation/` path from
being crawled/indexed as a second layer. Ask whoever's holding this project
for the current URLs if you need them — they're not repeated here since
this file itself could end up public.
