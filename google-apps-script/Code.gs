/**
 * VaniVeda — form intake + admin portal backend.
 *
 * Deploy this bound to a Google Sheet (Extensions > Apps Script from inside
 * the Sheet). See README.md in this folder for full setup steps.
 *
 * doPost(e)  — receives form submissions from the website, appends a row to
 *              the matching sheet (creating it with headers on first use),
 *              and upserts a "Students" row keyed by email (see
 *              upsertStudent_) so the same person is tracked as one entity
 *              across all three forms.
 * doGet(e)   — serves the admin portal (Admin). The page itself is just
 *              a login screen; actual data access is gated by the password
 *              stored in the "Admin" sheet tab (see getOrCreateAdminSheet_).
 */

// ====================== CONFIG — edit before deploying ======================

// The admin portal is password-protected. The password itself lives in the
// Sheet, not here — see getOrCreateAdminSheet_() below: the first time the
// script runs, it creates an "Admin" tab with a default password that you
// should open and change immediately. Changing it later is just an edit to
// that cell — no code change or redeploy needed.
var ADMIN_SHEET_NAME = 'Admin';
var DEFAULT_ADMIN_PASSWORD = 'CHANGE-ME';

// The single source of truth for a student's status. Status used to live
// per-row on each form's own sheet (three separate, disconnected values for
// the same person), which made "what's this person's actual status?"
// ambiguous once they'd used more than one form. Now every submission
// upserts a row here (keyed by email — see upsertStudent_) and status is
// only ever edited from the admin's Students view, which calls
// updateStudentStatus below — that same call also mirrors the new value
// onto every one of that student's rows in the other sheets (see
// updateRowStatusesForEmail_), so a form's own sheet always agrees with
// the Students tab instead of just showing whatever status existed at
// submission time. The per-row Status column is still not directly
// editable from the admin page — only student-level changes flow into it.
var STUDENTS_SHEET_NAME = 'Students';

// Maps each site form to the sheet tab it writes into. All four test
// formats (frenchtest/niveautest = French, spanishtest/niveltest = Spanish)
// share one sheet — see TEST_META below, which is what lets a single
// "Test Results" tab tell them apart.
var SHEET_NAMES = {
  contact: 'Contact Enrolments',
  quiz: 'Course Quiz Leads',
  frenchtest: 'Test Results',
  niveautest: 'Test Results',
  spanishtest: 'Test Results',
  niveltest: 'Test Results'
};

// The tabs shown in the admin portal — one entry per *sheet*, not per
// formType, so the two test formTypes above (which share a sheet) don't
// render as two duplicate tabs. Add a new entry here whenever a new sheet
// (not just a new formType) is introduced.
var TAB_LIST = [
  { key: 'contact', name: 'Contact Enrolments' },
  { key: 'quiz', name: 'Course Quiz Leads' },
  { key: 'test', name: 'Test Results' }
];

// Per-formType metadata written into every row of the merged Test Results
// sheet, so results from the four different tests stay distinguishable now
// that they live in one tab together. Each test page computes its own Test
// ID client-side (language + its own current filename, e.g. "french-
// zhhbtrml") and sends it in the payload, so the ID tracks the page's real
// URL even after it gets renamed — these `id` values are only a fallback
// for a submission that arrives without one (an older cached page, etc.).
var TEST_META = {
  frenchtest: { id: 'french-zhhbtrml', language: 'French' },
  niveautest: { id: 'french-4say2f5t', language: 'French' },
  spanishtest: { id: 'spanish-wrtq8mpz', language: 'Spanish' },
  niveltest: { id: 'spanish-b4ktnfxs', language: 'Spanish' }
};

var STATUS_OPTIONS = ['New', 'Contacted', 'Enrolled', 'Not Interested'];

// Every new submission — any formType — sends a summary email here. Change
// to whoever should be alerted about new enrolments/leads/test completions;
// leave it blank ('') to turn admin notifications off entirely.
var ADMIN_NOTIFICATION_EMAIL = 'vanivedalanguagehub@gmail.com';

// Human-readable label per formType, used in email subjects/bodies. The
// formType strings themselves (contact/quiz/frenchtest/...) are internal
// identifiers pulled straight from each form's own JS — not something to
// show a person.
var FORM_TYPE_LABELS = {
  contact: 'Enrolment form',
  quiz: 'Exam-matcher quiz',
  frenchtest: 'French mixed-format test',
  niveautest: 'Test de Niveau (French)',
  spanishtest: 'Spanish mixed-format test',
  niveltest: 'Test de Nivel (Spanish)'
};

// ====================== One-time setup ======================

/**
 * Runs automatically when the bound Sheet is opened: adds the custom menu
 * AND silently creates any missing sheet/tab (see ensureAllSheetsExist_),
 * so tabs and their header rows exist automatically just from opening the
 * Sheet — no manual "Set Up All Sheets" click required. That menu item is
 * still there for an on-demand re-run with a confirmation popup; this is
 * the same underlying setup, just run quietly every time the Sheet opens.
 * Wrapped in try/catch since a simple trigger like onOpen runs with
 * restricted authorization — if sheet creation somehow can't run yet, the
 * menu itself (the more important half) still gets added regardless.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VaniVeda Admin')
    .addItem('Set Up All Sheets', 'setupAllSheets')
    .addToUi();
  try {
    ensureAllSheetsExist_();
  } catch (e) {
    Logger.log('onOpen: automatic sheet setup failed — ' + e);
  }
}

/**
 * Creates every sheet tab this project needs — Contact Enrolments, Course
 * Quiz Leads, Test Results, Students, Admin — with the correct header row,
 * all at once, instead of waiting for each one to lazily appear on its
 * first real use. Safe to run repeatedly: existing sheets and their data
 * are left untouched. Runs automatically from onOpen (above); this
 * function is what the "VaniVeda Admin" menu's "Set Up All Sheets" item
 * calls for an explicit re-run with a confirmation popup.
 */
function setupAllSheets() {
  var result = ensureAllSheetsExist_();
  var message = result.created.length
    ? 'Created: ' + result.created.join(', ') + (result.existing.length ? '\nAlready existed: ' + result.existing.join(', ') : '')
    : 'All sheets already exist — nothing to create.';

  try {
    SpreadsheetApp.getUi().alert('VaniVeda setup', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // getUi() throws when run from a context with no bound UI (e.g. run
    // directly from the Apps Script editor's Run button rather than a menu
    // click) — fall back to the execution log so the result is still visible.
    Logger.log(message);
  }
}

/**
 * Does the actual sheet-creation work shared by onOpen (silent) and
 * setupAllSheets (with a confirmation popup) — see those two for when
 * each runs. Returns which sheets were newly created vs. already existed,
 * de-duplicated (Test Results appears twice in SHEET_NAMES since
 * frenchtest and niveautest both write to it).
 */
function ensureAllSheetsExist_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var created = [];
  var existing = [];

  Object.keys(SHEET_NAMES).forEach(function (formType) {
    var name = SHEET_NAMES[formType];
    var existedBefore = !!ss.getSheetByName(name);
    getOrCreateSheet_(name, formType);
    (existedBefore ? existing : created).push(name);
  });

  var studentsExistedBefore = !!ss.getSheetByName(STUDENTS_SHEET_NAME);
  getOrCreateStudentsSheet_();
  (studentsExistedBefore ? existing : created).push(STUDENTS_SHEET_NAME);

  var adminExistedBefore = !!ss.getSheetByName(ADMIN_SHEET_NAME);
  getOrCreateAdminSheet_();
  (adminExistedBefore ? existing : created).push(ADMIN_SHEET_NAME);

  created = created.filter(function (v, i) { return created.indexOf(v) === i; });
  existing = existing.filter(function (v, i) { return existing.indexOf(v) === i; });

  return { created: created, existing: existing };
}

/**
 * One-time repair for phone numbers submitted before this file force-texted
 * the Phone column — those show as #ERROR! because Sheets auto-converted a
 * leading "+91..." into a broken formula. The original digits aren't
 * actually lost: getFormula() still returns that formula's source text
 * (e.g. "=+91 96542 24342"), just stripped of the "=" Sheets prepended.
 * This finds every #ERROR! cell in each sheet's Phone column — every
 * per-form sheet (Contact Enrolments, Course Quiz Leads, Test Results)
 * *and* Students, which has its own separate Phone column written by
 * upsertStudent_ rather than buildRow_ — reformats that column, recovers
 * the number, and rewrites it so it displays correctly and won't re-break.
 *
 * Run this once, manually, from the Apps Script editor: select
 * fixBrokenPhoneNumbers_ from the function dropdown next to the Run
 * button, then click Run. Every new submission going forward is already
 * safe (see ensurePhoneColumnIsPlainText_ and phoneAsText_), so there's
 * nothing ongoing for this to do — safe to run again later anyway (rows
 * already fixed just get skipped, since their value is no longer
 * literally "#ERROR!").
 */
function fixBrokenPhoneNumbers_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = {};
  Object.keys(SHEET_NAMES).forEach(function (formType) { sheetNames[SHEET_NAMES[formType]] = true; });
  sheetNames[STUDENTS_SHEET_NAME] = true; // has its own Phone column too — upsertStudent_ writes here separately from buildRow_

  var fixedCount = 0;
  var fixedSheets = [];

  Object.keys(sheetNames).forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var phoneCol = headers.indexOf('Phone') + 1;
    if (phoneCol === 0) return;

    // Reformat the column first — setValue() below only sticks as plain
    // text if the cell's format already says so *before* the write, so
    // this has to run ahead of the recovery loop, not just once anywhere
    // in the file. See ensurePhoneColumnIsPlainText_'s own comment.
    sheet.getRange(1, phoneCol, sheet.getMaxRows(), 1).setNumberFormat('@');

    var numRows = sheet.getLastRow() - 1;
    var range = sheet.getRange(2, phoneCol, numRows, 1);
    var values = range.getValues();
    var formulas = range.getFormulas();
    var sheetFixed = 0;

    for (var i = 0; i < values.length; i++) {
      if (values[i][0] !== '#ERROR!' || !formulas[i][0]) continue;
      var recovered = formulas[i][0].replace(/^=/, '').trim();
      sheet.getRange(2 + i, phoneCol).setValue(phoneAsText_(recovered));
      fixedCount++;
      sheetFixed++;
    }
    if (sheetFixed) fixedSheets.push(sheetName + ' (' + sheetFixed + ')');
  });

  var message = fixedCount
    ? 'Fixed ' + fixedCount + ' phone number(s): ' + fixedSheets.join(', ')
    : 'No broken phone numbers found — nothing to fix.';
  Logger.log('fixBrokenPhoneNumbers_: ' + message);
  try {
    SpreadsheetApp.getUi().alert('VaniVeda cleanup', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // No bound UI (e.g. run directly from the editor's Run button) —
    // the message is already in the execution log above.
  }
}

// ====================== Form intake (doPost) ======================

/**
 * Entry point for every form submission (Contact, Quiz, all four level
 * tests) — the client always POSTs `{ formType, ...fields }` as a JSON
 * string body (see `vvSubmitToSheet` in `assets/main.js`). Order of
 * operations matters here and is deliberate:
 *   1. Validate (see validateSubmission_) — reject before anything is
 *      written, so a malformed submission never produces a half-saved or
 *      garbage row.
 *   2. Append the row to the form's own sheet.
 *   3. Upsert the Students sheet (see upsertStudent_) — always runs after
 *      the row write succeeds, never before, so a student record is never
 *      created for a submission that didn't actually get saved.
 *   4. Fire the notification emails last, and best-effort — notifyAdmin_
 *      and sendAcknowledgment_ both swallow their own errors internally
 *      (see their own comments) so a mail quota or bad-address failure
 *      here can never undo steps 1–3.
 * Every branch is logged (Logger.log — visible in the Apps Script editor's
 * "Executions" view) since this function has no other way to report back
 * to you; the caller only ever sees the small `{ok, error}` JSON reply.
 *
 * A POST with an `action` field instead of `formType` is routed to
 * handleAdminAction_ below — that's the admin dashboard talking to this
 * script over plain HTTP instead of the google.script.run bridge, which
 * only exists when Apps Script itself serves the page (see that
 * function's own comment for why that path exists at all).
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action) return handleAdminAction_(body);

    var formType = body.formType;
    Logger.log('doPost: received formType="' + formType + '" email="' + (body.email || '') + '"');

    var sheetName = SHEET_NAMES[formType];
    if (!sheetName) throw new Error('Unknown formType: ' + formType);

    var validationError = validateSubmission_(formType, body);
    if (validationError) {
      Logger.log('doPost: rejected formType="' + formType + '" — ' + validationError);
      return jsonResponse_({ ok: false, error: validationError });
    }

    var sheet = getOrCreateSheet_(sheetName, formType);
    var row = buildRow_(formType, body);
    sheet.appendRow(row);
    Logger.log('doPost: appended row to "' + sheetName + '" for ' + (body.email || '(no email)'));

    upsertStudent_(body, formType);

    notifyAdmin_(formType, body);
    sendAcknowledgment_(formType, body);

    return jsonResponse_({ ok: true });
  } catch (err) {
    Logger.log('doPost: failed — ' + err);
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * Defense-in-depth server-side validation. The site's own forms already
 * validate these fields client-side before submitting (see main.js), so
 * this only matters for a submission that bypasses that path entirely —
 * a bug, a stale cached page running old validation logic, or a direct
 * POST to this endpoint from outside the site. Deliberately minimal and
 * format-tolerant: phone numbers arrive in many valid international
 * shapes, so only *presence* is checked, never a pattern. Email gets a
 * basic shape check (not full RFC 5322 validation — that's a rabbit hole
 * with little real benefit here) because a malformed address makes the
 * whole row useless: nobody could ever be contacted from it, and for the
 * niveautest/niveltest formTypes it would silently break the automatic
 * results email in sendNiveauResultEmail_ / sendNivelResultEmail_.
 * Returns an error string describing the first problem found, or null if
 * the submission is acceptable.
 */
function validateSubmission_(formType, b) {
  var name = String(b.name || '').trim();
  var email = String(b.email || '').trim();
  var phone = String(b.phone || '').trim();

  if (!name) return 'Missing required field: name.';
  if (!email) return 'Missing required field: email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email address: ' + email;
  if (!phone) return 'Missing required field: phone.';

  return null;
}

/**
 * Emails the student their Test de Niveau result. Runs after the row is
 * already saved, so a failure here (bad address, quota, etc.) never causes
 * the submission itself to be lost — errors are swallowed and logged.
 */
function sendNiveauResultEmail_(b) {
  if (!b.email) return;
  try {
    var firstName = (b.name || '').trim().split(' ')[0];
    var greeting = firstName ? ('Bonjour ' + firstName + ',') : 'Bonjour,';
    var subject = 'Vos résultats — Test de Niveau de Français VaniVeda';
    var score = (b.score !== undefined && b.score !== null) ? b.score : '';
    var total = (b.total !== undefined && b.total !== null) ? b.total : '';
    var levelLabel = b.levelLabel || b.level || '';
    var levelDesc = b.levelDesc || '';
    var ctaUrl = 'https://www.vaniveda.com/contact';

    var plain = greeting + '\n\n' +
      'Score : ' + score + ' / ' + total + '\n' +
      'Niveau : ' + levelLabel + '\n\n' +
      levelDesc + '\n\n' +
      'Parlez à un coach VaniVeda : ' + ctaUrl + '\n\n' +
      '— L\'équipe VaniVeda';

    var inner = '' +
      '<p style="font-size:15px;margin:0 0 18px">' + escapeHtml_(greeting) + '</p>' +
      '<p style="font-size:14px;margin:0 0 6px;color:#616E7C">Voici vos résultats au Test de Niveau de Français&nbsp;:</p>' +
      '<div style="text-align:center;padding:18px 0">' +
        '<span style="font-family:Arial,sans-serif;font-weight:800;font-size:44px;color:#D62839">' + score +
        '<span style="font-size:20px;color:#9AA5B1">/' + total + '</span></span>' +
      '</div>' +
      '<div style="text-align:center;background:#1F2933;color:#fff;font-weight:700;padding:12px;margin:0 0 18px;text-transform:uppercase;letter-spacing:.06em">' +
        escapeHtml_(levelLabel) +
      '</div>' +
      '<p style="font-size:14px;line-height:1.6;color:#3E4C59;margin:0 0 24px">' + escapeHtml_(levelDesc) + '</p>' +
      ctaButtonHtml_('PARLER À UN COACH', ctaUrl);

    MailApp.sendEmail({ to: b.email, subject: subject, body: plain, htmlBody: brandedEmailShell_(inner), name: 'VaniVeda' });
    Logger.log('sendNiveauResultEmail_: sent to ' + b.email + ' (score ' + score + '/' + total + ', level ' + levelLabel + ')');
  } catch (err) {
    Logger.log('sendNiveauResultEmail_ failed: ' + err);
  }
}

/**
 * Emails the student their Test de Nivel (Spanish) result. Same shape and
 * failure handling as sendNiveauResultEmail_ above, just in Spanish.
 */
function sendNivelResultEmail_(b) {
  if (!b.email) return;
  try {
    var firstName = (b.name || '').trim().split(' ')[0];
    var greeting = firstName ? ('Hola ' + firstName + ',') : 'Hola,';
    var subject = 'Tus resultados — Test de Nivel de Español VaniVeda';
    var score = (b.score !== undefined && b.score !== null) ? b.score : '';
    var total = (b.total !== undefined && b.total !== null) ? b.total : '';
    var levelLabel = b.levelLabel || b.level || '';
    var levelDesc = b.levelDesc || '';
    var ctaUrl = 'https://www.vaniveda.com/contact';

    var plain = greeting + '\n\n' +
      'Puntuación: ' + score + ' / ' + total + '\n' +
      'Nivel: ' + levelLabel + '\n\n' +
      levelDesc + '\n\n' +
      'Habla con un coach VaniVeda: ' + ctaUrl + '\n\n' +
      '— El equipo VaniVeda';

    var inner = '' +
      '<p style="font-size:15px;margin:0 0 18px">' + escapeHtml_(greeting) + '</p>' +
      '<p style="font-size:14px;margin:0 0 6px;color:#616E7C">Estos son tus resultados en el Test de Nivel de Español&nbsp;:</p>' +
      '<div style="text-align:center;padding:18px 0">' +
        '<span style="font-family:Arial,sans-serif;font-weight:800;font-size:44px;color:#D62839">' + score +
        '<span style="font-size:20px;color:#9AA5B1">/' + total + '</span></span>' +
      '</div>' +
      '<div style="text-align:center;background:#1F2933;color:#fff;font-weight:700;padding:12px;margin:0 0 18px;text-transform:uppercase;letter-spacing:.06em">' +
        escapeHtml_(levelLabel) +
      '</div>' +
      '<p style="font-size:14px;line-height:1.6;color:#3E4C59;margin:0 0 24px">' + escapeHtml_(levelDesc) + '</p>' +
      ctaButtonHtml_('HABLAR CON UN COACH', ctaUrl);

    MailApp.sendEmail({ to: b.email, subject: subject, body: plain, htmlBody: brandedEmailShell_(inner), name: 'VaniVeda' });
    Logger.log('sendNivelResultEmail_: sent to ' + b.email + ' (score ' + score + '/' + total + ', level ' + levelLabel + ')');
  } catch (err) {
    Logger.log('sendNivelResultEmail_ failed: ' + err);
  }
}

/**
 * Sends the student-facing "we got it" email for any formType. The two
 * fill-in-the-blank tests (niveautest/niveltest) already have detailed,
 * personalized result emails above — sendNiveauResultEmail_ /
 * sendNivelResultEmail_ — that serve as their acknowledgment too, so this
 * only builds a generic one for the four formTypes that previously had no
 * email at all: contact, quiz, and the two mixed-format tests. Same
 * failure handling as those two: best-effort, errors swallowed and
 * logged, never allowed to affect the already-saved submission.
 */
function sendAcknowledgment_(formType, b) {
  if (formType === 'niveautest') return sendNiveauResultEmail_(b);
  if (formType === 'niveltest') return sendNivelResultEmail_(b);
  if (!b.email) return;

  try {
    var firstName = String(b.name || '').trim().split(' ')[0];
    var greeting = firstName ? ('Hi ' + firstName + ',') : 'Hi,';
    var ctaUrl = 'https://www.vaniveda.com/contact';
    var subject, plain, inner;

    if (formType === 'contact') {
      var course = b.course || '';
      subject = 'We\'ve received your enrolment enquiry — VaniVeda';
      plain = greeting + '\n\n' +
        'Thanks for reaching out to VaniVeda. We\'ve received your enrolment details' +
        (course ? (' for ' + course) : '') + ' and will confirm your batch within one working day.\n\n' +
        'Course: ' + course + '\n' +
        'Preferred batch: ' + (b.batch || '') + '\n' +
        'City / time zone: ' + (b.city || '') + '\n\n' +
        'Questions in the meantime? vanivedalanguagehub@gmail.com\n\n' +
        '— The VaniVeda team';
      inner = '' +
        '<p style="font-size:15px;margin:0 0 18px">' + escapeHtml_(greeting) + '</p>' +
        '<p style="font-size:14px;line-height:1.6;color:#3E4C59;margin:0 0 18px">Thanks for reaching out to VaniVeda. We’ve received your enrolment details' +
        (course ? (' for <strong>' + escapeHtml_(course) + '</strong>') : '') + ' and will confirm your batch within one working day.</p>' +
        summaryRowsHtml_([['Course', course], ['Preferred batch', b.batch], ['City / time zone', b.city]]) +
        ctaButtonHtml_('EMAIL US', 'mailto:vanivedalanguagehub@gmail.com');
    } else if (formType === 'quiz') {
      subject = 'Your recommended exam — VaniVeda';
      plain = greeting + '\n\n' +
        'Thanks for taking the VaniVeda exam-matcher quiz. Based on your answers, here\'s what we\'d recommend:\n\n' +
        'Recommended exam: ' + (b.resultExam || '') + '\n' +
        'Suggested level: ' + (b.resultLevel || '') + '\n\n' +
        'Talk to a counsellor: ' + ctaUrl + '\n\n' +
        '— The VaniVeda team';
      inner = '' +
        '<p style="font-size:15px;margin:0 0 18px">' + escapeHtml_(greeting) + '</p>' +
        '<p style="font-size:14px;line-height:1.6;color:#3E4C59;margin:0 0 18px">Thanks for taking the VaniVeda exam-matcher quiz. Based on your answers, here’s what we’d recommend:</p>' +
        summaryRowsHtml_([['Recommended exam', b.resultExam], ['Suggested level', b.resultLevel]]) +
        ctaButtonHtml_('TALK TO A COUNSELLOR', ctaUrl);
    } else if (formType === 'frenchtest' || formType === 'spanishtest') {
      var lang = formType === 'frenchtest' ? 'French' : 'Spanish';
      var score = (b.score !== undefined && b.score !== null) ? b.score : '';
      var total = (b.total !== undefined && b.total !== null) ? b.total : '';
      var level = b.level || '';
      subject = 'Your ' + lang + ' test result — VaniVeda';
      plain = greeting + '\n\n' +
        'Thanks for completing the VaniVeda ' + lang + ' test.\n\n' +
        'Score: ' + score + ' / ' + total + '\n' +
        'Level: ' + level + '\n\n' +
        'Talk to a coach: ' + ctaUrl + '\n\n' +
        '— The VaniVeda team';
      inner = '' +
        '<p style="font-size:15px;margin:0 0 18px">' + escapeHtml_(greeting) + '</p>' +
        '<p style="font-size:14px;line-height:1.6;color:#3E4C59;margin:0 0 18px">Thanks for completing the VaniVeda ' + lang + ' test. Here’s your result:</p>' +
        '<div style="text-align:center;padding:18px 0">' +
          '<span style="font-family:Arial,sans-serif;font-weight:800;font-size:44px;color:#D62839">' + score +
          '<span style="font-size:20px;color:#9AA5B1">/' + total + '</span></span>' +
        '</div>' +
        '<div style="text-align:center;background:#1F2933;color:#fff;font-weight:700;padding:12px;margin:0 0 18px;text-transform:uppercase;letter-spacing:.06em">' +
          escapeHtml_(String(level)) +
        '</div>' +
        ctaButtonHtml_('TALK TO A COACH', ctaUrl);
    } else {
      return; // unknown formType — nothing defined to send
    }

    MailApp.sendEmail({ to: b.email, subject: subject, body: plain, htmlBody: brandedEmailShell_(inner), name: 'VaniVeda' });
    Logger.log('sendAcknowledgment_: sent ' + formType + ' acknowledgment to ' + b.email);
  } catch (err) {
    Logger.log('sendAcknowledgment_ failed for formType="' + formType + '": ' + err);
  }
}

/**
 * Emails a short summary of every new submission to
 * ADMIN_NOTIFICATION_EMAIL — previously nothing notified anyone; a new
 * lead only surfaced when someone opened the Sheet or admin dashboard.
 * Every field present on the submission is listed generically (rather
 * than a hand-built list per formType) so a new field on any form's
 * payload automatically shows up here without a matching code change.
 * Same failure handling as the student-facing emails: best-effort, never
 * allowed to affect the already-saved submission.
 */
function notifyAdmin_(formType, b) {
  if (!ADMIN_NOTIFICATION_EMAIL) return;
  try {
    var label = FORM_TYPE_LABELS[formType] || formType;
    var name = b.name || '(no name given)';
    var subject = 'New ' + label + ' submission — ' + name;

    // Fields not worth listing: formType is redundant with the subject,
    // submittedAt duplicates the timestamp line below, and
    // placementChecks is a JSON blob meant for the admin dashboard's own
    // rendering, not a plain-text summary email.
    var skip = { formType: true, submittedAt: true, placementChecks: true };
    var fields = Object.keys(b).filter(function (key) {
      var value = b[key];
      return !skip[key] && value !== undefined && value !== null && value !== '';
    });

    var adminUrl = '';
    try { adminUrl = ScriptApp.getService().getUrl(); } catch (e) {}

    var inner = '' +
      '<p style="font-size:15px;margin:0 0 6px;font-weight:700">New ' + escapeHtml_(label) + ' submission</p>' +
      '<p style="font-size:13px;color:#616E7C;margin:0 0 18px">' + escapeHtml_(new Date().toString()) + '</p>' +
      summaryRowsHtml_(fields.map(function (key) { return [fieldLabel_(key), b[key]]; })) +
      (adminUrl ? ctaButtonHtml_('OPEN ADMIN DASHBOARD', adminUrl) : '');

    var plain = 'New ' + label + ' submission\n\n' +
      fields.map(function (key) { return fieldLabel_(key) + ': ' + b[key]; }).join('\n') +
      (adminUrl ? ('\n\nOpen admin dashboard: ' + adminUrl) : '');

    MailApp.sendEmail({ to: ADMIN_NOTIFICATION_EMAIL, subject: subject, body: plain, htmlBody: brandedEmailShell_(inner), name: 'VaniVeda Website' });
    Logger.log('notifyAdmin_: sent ' + formType + ' notification for ' + name);
  } catch (err) {
    Logger.log('notifyAdmin_ failed for formType="' + formType + '": ' + err);
  }
}

/** Wraps arbitrary inner HTML in the shared VaniVeda email shell — a dark
 * header bar with the wordmark, a bordered content box, and a footer
 * line. Every outgoing email (student acknowledgments, results, admin
 * notifications) uses this so they all look like they came from the same
 * place, instead of each function hand-rolling its own header/footer. */
function brandedEmailShell_(innerHtml) {
  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1F2933">' +
    '<div style="background:#1F2933;padding:20px 28px">' +
      '<span style="color:#fff;font-weight:700;font-size:18px;letter-spacing:.04em">VANIVEDA</span>' +
    '</div>' +
    '<div style="padding:28px;border:1px solid #E4E7EB;border-top:none">' +
      innerHtml +
    '</div>' +
    '<p style="text-align:center;color:#9AA5B1;font-size:11px;padding:18px 0 0">© VaniVeda — The Voice That Drives Mastery</p>' +
    '</div>';
}

/** The solid-red call-to-action button used at the bottom of every
 * outgoing email. `label` is passed pre-formatted (existing callers use
 * full caps, matching the rest of the brand's button styling) rather than
 * auto-uppercased here, so a caller that wants different casing can. */
function ctaButtonHtml_(label, url) {
  return '<div style="text-align:center">' +
    '<a href="' + url + '" style="display:inline-block;background:#D62839;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;letter-spacing:.04em">' + label + '</a>' +
    '</div>';
}

/** Renders a list of [label, value] pairs as a simple two-column HTML
 * table for an email body — used by both sendAcknowledgment_ (a short,
 * hand-picked list of fields relevant to that formType) and notifyAdmin_
 * (every non-empty field on the submission). Pairs whose value is empty
 * are skipped so an optional field a student left blank doesn't show up
 * as a bare label with nothing after it. */
function summaryRowsHtml_(pairs) {
  var rows = pairs
    .filter(function (pair) { return pair[1] !== undefined && pair[1] !== null && pair[1] !== ''; })
    .map(function (pair) {
      return '<tr>' +
        '<td style="padding:6px 12px 6px 0;color:#616E7C;font-size:13px;white-space:nowrap;vertical-align:top">' + escapeHtml_(pair[0]) + '</td>' +
        '<td style="padding:6px 0;font-size:13px;color:#1F2933">' + escapeHtml_(String(pair[1])) + '</td>' +
        '</tr>';
    });
  if (!rows.length) return '';
  return '<table style="width:100%;border-collapse:collapse;margin:0 0 20px">' + rows.join('') + '</table>';
}

/** Turns a payload key like "resultExam" into "Result Exam" for display
 * in the admin notification email — good enough for the known field
 * names without needing a hand-maintained label map for each one. */
function fieldLabel_(key) {
  var spaced = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Escapes the four HTML-unsafe characters that matter for text dropped into
 * the result-email HTML body (student name, level description) — those
 * values come from the client's own quiz/test logic, not free-typed user
 * input, but they're escaped anyway since it costs nothing and removes any
 * doubt about HTML injection in an email rendered by the recipient's client. */
function escapeHtml_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Returns the sheet for `name`, creating it with the right header row
 * (from headersFor_) and bolded, frozen first row if it doesn't exist yet.
 * Called both from setupAllSheets (to create everything up front) and from
 * doPost (so a sheet still gets created correctly even if setupAllSheets
 * was never run) — either path ends up with an identical sheet.
 *
 * ensurePhoneColumnIsPlainText_ (below) runs every time, not just on
 * creation — a sheet that already existed before that safeguard was added
 * would otherwise never get it, which is exactly what left an
 * already-created Sheet still vulnerable to the +/-/= auto-formula-parsing
 * gotcha (see phoneAsText_'s own comment) even after this file was updated.
 */
function getOrCreateSheet_(name, formType) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    var headers = headersFor_(formType);
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  ensurePhoneColumnIsPlainText_(sheet, headersFor_(formType).indexOf('Phone') + 1);
  return sheet;
}

/**
 * Sets a Phone column's number format to Plain Text ('@') — the
 * authoritative fix for the +/-/= auto-formula-parsing gotcha (see
 * phoneAsText_'s own comment). This is what actually stops Sheets from
 * trying to parse the value at all, regardless of how it's written;
 * phoneAsText_'s leading apostrophe is a second, redundant layer on top,
 * not a substitute for this. Idempotent and cheap — safe to call on
 * every getOrCreateSheet_/getOrCreateStudentsSheet_ call, which is what
 * lets a sheet created before this safeguard existed still pick it up
 * automatically instead of needing a separate migration step. Takes a
 * 1-based column *number* rather than looking it up itself, since the
 * Students sheet's columns aren't defined via headersFor_ like the
 * per-form sheets are — every caller already knows its own Phone column.
 */
function ensurePhoneColumnIsPlainText_(sheet, phoneCol) {
  if (phoneCol > 0) sheet.getRange(1, phoneCol, sheet.getMaxRows(), 1).setNumberFormat('@');
}

/**
 * The header row for a given formType's sheet — also doubles as the
 * canonical column order buildRow_ must produce a row in, and as the
 * lookup headersForTab_ uses to describe an *empty* tab to the admin page
 * (one that has no rows yet, so there's no real header row to read back).
 */
function headersFor_(formType) {
  if (formType === 'contact') {
    return ['ID', 'Timestamp', 'Status', 'Name', 'Phone', 'Email', 'City', 'Course', 'Preferred Batch', 'Goal & Deadline'];
  }
  if (formType === 'quiz') {
    return ['ID', 'Timestamp', 'Status', 'Name', 'Phone', 'Email', 'Goal', 'Deadline', 'Placement Checks', 'Recommended Exam', 'Suggested Level', 'Estimated Points'];
  }
  if (TEST_META[formType]) {
    return ['ID', 'Timestamp', 'Status', 'Test ID', 'Language', 'Name', 'Phone', 'Email', 'Score', 'Total', 'Level'];
  }
  return ['ID', 'Timestamp', 'Status'];
}

/**
 * Turns a validated submission body into the exact row array
 * getOrCreateSheet_/appendRow expects — column order here must always
 * match headersFor_ for the same formType, since nothing enforces that
 * pairing except this file being internally consistent. Every field falls
 * back to '' rather than undefined so a sparse payload never produces a
 * ragged row. Phone specifically goes through phoneAsText_ — see its own
 * comment for why.
 */
function buildRow_(formType, b) {
  var id = Utilities.getUuid();
  var ts = new Date();
  if (formType === 'contact') {
    return [id, ts, 'New', b.name || '', phoneAsText_(b.phone), b.email || '', b.city || '', b.course || '', b.batch || '', b.goal || ''];
  }
  if (formType === 'quiz') {
    return [id, ts, 'New', b.name || '', phoneAsText_(b.phone), b.email || '', b.goal || '', b.deadline || '',
      JSON.stringify(b.placementChecks || []), b.resultExam || '', b.resultLevel || '', b.resultPoints || ''];
  }
  if (TEST_META[formType]) {
    var meta = TEST_META[formType];
    return [id, ts, 'New', b.testId || meta.id, meta.language, b.name || '', phoneAsText_(b.phone), b.email || '', b.score || '', b.total || '', b.level || ''];
  }
  return [id, ts, 'New'];
}

/**
 * A phone number like "+91 96542 24342" written as a plain string is
 * exactly the kind of value Sheets tries to auto-parse as a formula —
 * anything starting with +, -, or = triggers that, both from manual
 * typing and from a script writing the same string via appendRow/
 * setValues. The parse fails (it's not valid formula syntax) and the
 * cell shows #ERROR! instead of the phone number. A leading apostrophe
 * is Sheets' own "force this as literal text" marker — same trick you'd
 * use typing it into the UI by hand. The apostrophe itself never shows
 * up in the stored value or in getValues() reads; only getFormula()
 * would reveal a cell was force-texted, which nothing here relies on.
 */
function phoneAsText_(phone) {
  return "'" + (phone || '');
}

// ====================== Students (cross-sheet identity + status) ======================

function getOrCreateStudentsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STUDENTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STUDENTS_SHEET_NAME);
    sheet.appendRow(['Email', 'Name', 'Phone', 'Status', 'First Seen', 'Last Seen', 'Total Submissions']);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  ensurePhoneColumnIsPlainText_(sheet, 3); // column C = Phone
  return sheet;
}

/**
 * Called from doPost after every successful form submission. Finds the
 * existing Students row for this email (case-insensitive) and refreshes
 * Name/Phone/Last Seen/Total Submissions, or creates a new row with
 * Status 'New' if this is the first time this email has been seen.
 *
 * A fresh Contact Enrolments or Course Quiz Leads submission also resets
 * Status back to 'New' on an existing student — a new enquiry or quiz lead
 * means they need attention again, even if they were previously Contacted,
 * Enrolled or Not Interested. A Test Results submission never resets
 * status this way (someone retaking a level test isn't a fresh enquiry).
 * Otherwise, Status is only ever changed by updateStudentStatus, called
 * from the admin's Students view.
 */
function upsertStudent_(b, formType) {
  var email = String(b.email || '').trim();
  if (!email) return; // nothing to key this submission's identity on
  var emailKey = email.toLowerCase();
  var sheet = getOrCreateStudentsSheet_();
  var values = sheet.getDataRange().getValues();
  var now = new Date();
  var resetsStatus = (formType === 'contact' || formType === 'quiz');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === emailKey) {
      var rowNum = i + 1;
      // Most recent submission's name/phone wins, on the assumption it's
      // the most likely to be accurate/current.
      if (b.name) sheet.getRange(rowNum, 2).setValue(b.name);
      if (b.phone) sheet.getRange(rowNum, 3).setValue(phoneAsText_(b.phone));
      if (resetsStatus) sheet.getRange(rowNum, 4).setValue('New');
      sheet.getRange(rowNum, 6).setValue(now); // Last Seen
      sheet.getRange(rowNum, 7).setValue((Number(values[i][6]) || 0) + 1); // Total Submissions
      Logger.log('upsertStudent_: updated existing student ' + emailKey + (resetsStatus ? ' (status reset to New)' : ''));
      return;
    }
  }

  sheet.appendRow([email, b.name || '', phoneAsText_(b.phone), 'New', now, now, 1]);
  Logger.log('upsertStudent_: created new student ' + emailKey);
}

/** Called from the admin's Students detail view via google.script.run. */
function updateStudentStatus(password, email, newStatus) {
  if (!verifyAdminPassword_(password)) throw new Error('Unauthorized');
  var emailKey = String(email || '').trim().toLowerCase();
  if (!emailKey) throw new Error('No email given.');
  var sheet = getOrCreateStudentsSheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === emailKey) {
      sheet.getRange(i + 1, 4).setValue(newStatus); // column D = Status
      updateRowStatusesForEmail_(emailKey, newStatus);
      Logger.log('updateStudentStatus: ' + emailKey + ' -> ' + newStatus);
      return { ok: true };
    }
  }
  throw new Error('Student not found: ' + email);
}

/**
 * Mirrors a student-level status change onto every one of their rows in
 * Contact Enrolments, Course Quiz Leads and Test Results, so a form's own
 * sheet always agrees with the Students tab instead of showing a stale
 * value from whenever the row was first submitted. Called only from
 * updateStudentStatus, right after the Students sheet itself is updated.
 */
function updateRowStatusesForEmail_(emailKey, newStatus) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  TAB_LIST.forEach(function (tab) {
    var sheet = ss.getSheetByName(tab.name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var emailIdx = headers.indexOf('Email');
    var statusIdx = headers.indexOf('Status');
    if (emailIdx === -1 || statusIdx === -1) return;

    var statusColumn = [];
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      if (i === 0) { statusColumn.push([values[i][statusIdx]]); continue; }
      if (String(values[i][emailIdx]).trim().toLowerCase() === emailKey) {
        statusColumn.push([newStatus]);
        changed = true;
      } else {
        statusColumn.push([values[i][statusIdx]]);
      }
    }
    if (changed) sheet.getRange(1, statusIdx + 1, statusColumn.length, 1).setValues(statusColumn);
  });
}

/** Wraps any plain object as the JSON response doPost must return — every
 * call site passes at minimum `{ ok: true|false }`, optionally with an
 * `error` string alongside `ok: false`. */
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ====================== Admin portal (doGet) ======================

/**
 * Serves the admin dashboard for *any* GET to the Web App URL — there's no
 * routing here because this deployment only ever serves one page. The
 * `Admin` template referenced below must be the HTML file created in Apps
 * Script during setup (see README.md step 2.3); its content is the site's
 * own `admin/index.html`, pasted in under that internal name. Serving it
 * to anyone with the URL is intentional and safe: the page itself is just
 * a login screen, and every privileged call it makes (getAllSubmissions,
 * updateStudentStatus, ...) independently re-checks the password
 * server-side — see the "Admin auth" section below.
 * XFrameOptionsMode.ALLOWALL is required for Apps Script Web Apps to
 * render at all in most browsers' top-level navigation; it does not
 * relax the privileged-call password checks.
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Admin').evaluate()
    .setTitle('VaniVeda — Submissions')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ====================== Admin auth ======================
//
// The page itself (doGet, above) is served to anyone who has the URL — same
// as any login page. The actual data is what's protected: every privileged
// call below (getAllSubmissions, updateStudentStatus) takes the password as an
// argument and re-checks it server-side on every single call. That's
// deliberate — trusting a client-side "already logged in" flag would let
// anyone who has the page open just call these functions directly from the
// browser console and skip the password entirely.

function getOrCreateAdminSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ADMIN_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ADMIN_SHEET_NAME);
    sheet.appendRow(['Setting', 'Value']);
    sheet.appendRow(['Password', DEFAULT_ADMIN_PASSWORD]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 260);
  }
  return sheet;
}

function getAdminSetting_(key) {
  var sheet = getOrCreateAdminSheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === key.toLowerCase()) return values[i][1];
  }
  return null;
}

function verifyAdminPassword_(password) {
  var stored = getAdminSetting_('Password');
  return stored !== null && stored !== '' && String(password) === String(stored);
}

/** Called from Admin's login form via google.script.run. */
function adminLogin(password) {
  if (verifyAdminPassword_(password)) return { ok: true };
  return { ok: false, error: 'Incorrect password.' };
}

/** Maps a TAB_LIST key (contact/quiz/test) to the header row for its sheet. */
function headersForTab_(key) {
  // frenchtest and niveautest produce identical headers (see headersFor_),
  // so either works as the lookup for the merged 'test' tab.
  var formType = key === 'test' ? 'frenchtest' : key;
  return headersFor_(formType);
}

/** Called from Admin via google.script.run. Re-verifies the password on every call. */
function getAllSubmissions(password) {
  if (!verifyAdminPassword_(password)) throw new Error('Unauthorized');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {};
  TAB_LIST.forEach(function (tab) {
    var sheet = ss.getSheetByName(tab.name);
    if (!sheet || sheet.getLastRow() < 2) {
      out[tab.key] = { name: tab.name, headers: headersForTab_(tab.key), rows: [] };
      return;
    }
    var values = sheet.getDataRange().getValues();
    var headers = values.shift();
    out[tab.key] = { name: tab.name, headers: headers, rows: values };
  });

  var studentsSheet = ss.getSheetByName(STUDENTS_SHEET_NAME);
  var studentStatuses = {};
  if (studentsSheet && studentsSheet.getLastRow() >= 2) {
    var studentValues = studentsSheet.getDataRange().getValues();
    for (var i = 1; i < studentValues.length; i++) {
      var emailKey = String(studentValues[i][0] || '').trim().toLowerCase();
      if (emailKey) studentStatuses[emailKey] = studentValues[i][3]; // column D = Status
    }
  }

  return { sheets: out, statusOptions: STATUS_OPTIONS, studentStatuses: studentStatuses };
}

// ====================== Admin over plain HTTP (fallback transport) ======================
//
// The admin dashboard normally calls adminLogin/getAllSubmissions/
// updateStudentStatus through google.script.run — a bridge Google injects
// into a page only when Apps Script itself served that page (the deployed
// .../exec URL). Opened any other way (a local dev server, ngrok, etc. —
// useful for iterating on the dashboard's UI without redeploying every
// time), that bridge doesn't exist, so the same three actions are also
// reachable as a plain POST here, the same way the public site's own
// forms already reach doPost (see vvSubmitToSheet in assets/main.js —
// same text/plain trick to dodge the CORS preflight Apps Script Web Apps
// don't handle). This is not a looser trust boundary than the
// google.script.run path: every action below still re-verifies the
// password server-side on every single call, exactly like the functions
// it calls.

/**
 * Routes a doPost body that has an `action` field (rather than a
 * `formType`) to the matching admin function and wraps the result as
 * `{ok, result}` / `{ok, error}` — adminLogin already returns that exact
 * `{ok, error}` shape itself without throwing, so it's passed straight
 * through; getAllSubmissions and updateStudentStatus throw on a bad
 * password instead, so those are caught here and converted to the same
 * shape the client already knows how to handle either way.
 */
function handleAdminAction_(body) {
  try {
    if (body.action === 'adminLogin') {
      return jsonResponse_(adminLogin(body.password));
    }
    if (body.action === 'getAllSubmissions') {
      return jsonResponse_({ ok: true, result: getAllSubmissions(body.password) });
    }
    if (body.action === 'updateStudentStatus') {
      return jsonResponse_({ ok: true, result: updateStudentStatus(body.password, body.email, body.status) });
    }
    return jsonResponse_({ ok: false, error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
