// Loads assets/central-data.json — the single source of truth for the
// contact details, social links and brand strings that used to be
// hand-copied identically into every page (and had to be hand-edited in
// every page, in sync, whenever one of them changed — see git history for
// how error-prone that was). Every element this touches already has the
// correct static value baked into the HTML, so this is progressive
// enhancement, not a hard dependency:
//
//   - Deployed behind any real static file server (or the Apps Script
//     admin's own hosting): the fetch below succeeds and this file becomes
//     the actual editable source of truth. Change a phone number once
//     here, reload every page, done — no more hunting through 10 files.
//   - Opened directly as a local file (double-click, file:// URL) — the
//     README explicitly promises every page still works this way. A
//     fetch() of a local file is blocked by the browser's CORS rules in
//     that mode, so this silently no-ops and the static HTML values you
//     already see are exactly what's shown. Nothing breaks either way.
(function () {
  var thisScript = document.currentScript;
  if (!thisScript || !thisScript.src) return;
  var jsonUrl = thisScript.src.replace(/central-data\.js(?:\?.*)?(#.*)?$/, 'central-data.json');

  fetch(jsonUrl, { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('central-data.json responded ' + res.status);
      return res.json();
    })
    .then(applyCentralData_)
    .catch(function () {
      // Silent on purpose — see file comment above. Nothing to recover:
      // the static fallback already rendered is correct.
    });

  function applyCentralData_(data) {
    document.querySelectorAll('[data-cd-text]').forEach(function (el) {
      var value = getPath_(data, el.getAttribute('data-cd-text'));
      if (value !== undefined) el.textContent = value;
    });
    document.querySelectorAll('[data-cd-href]').forEach(function (el) {
      var value = getPath_(data, el.getAttribute('data-cd-href'));
      // A social link still set to the "#" placeholder is deliberately
      // left alone rather than overwritten with the same placeholder —
      // keeps this a no-op until real social URLs exist in the JSON.
      if (value !== undefined && value !== '#') el.setAttribute('href', value);
    });
  }

  function getPath_(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o && o[k] !== undefined) ? o[k] : undefined;
    }, obj);
  }
})();
