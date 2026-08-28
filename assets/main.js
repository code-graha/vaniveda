// VaniVeda draft-3 — shared behaviour: nav, scroll-reveal, count-up, FAQ search, contact form.

// Shared by every form (contact, course quiz, French test) to send a
// submission to the Google Apps Script backend — see /google-apps-script.
// Uses Content-Type: text/plain on purpose: Apps Script Web Apps don't handle
// the CORS preflight (OPTIONS) request that a "real" application/json POST
// triggers, so text/plain (a CORS "simple request") is the reliable way to
// call it from a static page. The script itself still JSON.parses the body.
// Resolves silently (never throws) if VV_APPS_SCRIPT_URL isn't configured yet
// or the request fails — callers should treat this as best-effort.
window.vvSubmitToSheet = function (formType, payload) {
  var url = window.VV_APPS_SCRIPT_URL;
  if (!url) return Promise.resolve({ ok: false, error: 'VV_APPS_SCRIPT_URL not configured' });
  var body = Object.assign({ formType: formType }, payload);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  }).then(function (res) { return res.json(); }).catch(function (err) {
    return { ok: false, error: String(err) };
  });
};

(function () {
  var REDUCED = false;
  try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // main.js is loaded with `defer`, which guarantees the DOM is fully parsed
  // before this runs — and, crucially, that it finishes before DOMContentLoaded
  // fires, so any page-specific inline script listening for DOMContentLoaded
  // (e.g. contact's quiz-lead prefill) can safely assume these are ready.
  initNav();
  initReveal();
  initCountUp();
  initFaqSearch();
  initContactForm();
  initPhoneCodeSelects();

  function initPhoneCodeSelects() {
    document.querySelectorAll('[data-phone-select]').forEach(function (root) {
      var trigger = root.querySelector('[data-phone-trigger]');
      var list = root.querySelector('[data-phone-list]');
      var hidden = root.querySelector('input[type=hidden]');
      var triggerFlag = root.querySelector('[data-phone-trigger-flag]');
      var triggerCode = root.querySelector('[data-phone-trigger-code]');
      if (!trigger || !list || !hidden) return;

      function close() {
        list.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
      function open() {
        list.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      }
      function select(opt) {
        var code = opt.getAttribute('data-code');
        var flagSrc = opt.querySelector('img').getAttribute('src');
        hidden.value = code;
        triggerFlag.setAttribute('src', flagSrc);
        triggerCode.textContent = code;
        list.querySelectorAll('[data-code]').forEach(function (o) { o.removeAttribute('data-active'); });
        opt.setAttribute('data-active', '');
        close();
      }

      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (list.hidden) open(); else close();
      });
      list.querySelectorAll('[data-code]').forEach(function (opt) {
        opt.addEventListener('click', function (e) {
          // The <label> wrapping this whole field forwards clicks on non-control
          // descendants (like this <li>) to the first labelable element inside it
          // — the trigger button — which would silently reopen the list we just
          // closed. preventDefault() suppresses that native forwarding.
          e.preventDefault();
          select(opt);
        });
      });
      document.addEventListener('click', function (e) {
        if (!root.contains(e.target)) close();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
      });

      root.vvSetPhoneCode = function (code) {
        var opt = list.querySelector('[data-code="' + code + '"]');
        if (opt) select(opt);
      };
    });
  }

  function initNav() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var links = document.querySelector('[data-nav-links]');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var isOpen = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        document.body.style.overflow = isOpen ? 'hidden' : '';
      });
      // switching back to desktop width with the panel still marked open
      // (e.g. rotating a tablet) shouldn't leave body scroll locked
      window.addEventListener('resize', function () {
        if (window.innerWidth > 900 && links.classList.contains('open')) {
          links.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        }
      });
    }
    document.querySelectorAll('[data-nav-item]').forEach(function (item) {
      var trigger = item.querySelector('[data-nav-trigger]');
      if (!trigger) return;
      trigger.addEventListener('click', function (e) {
        if (window.innerWidth > 900) return;
        e.preventDefault();
        item.classList.toggle('open');
      });
    });
  }

  function initReveal() {
    var targets = document.querySelectorAll('[data-reveal], [data-bar]');
    if (!targets.length) return;
    if (REDUCED) {
      targets.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        obs.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }

  function initCountUp() {
    var nums = document.querySelectorAll('[data-count]');
    if (!nums.length) return;
    var run = function (el) {
      var target = el.getAttribute('data-count');
      var match = target.match(/[\d.]+/);
      if (!match) return;
      var end = parseFloat(match[0]);
      var suffix = target.slice(match[0].length);
      var prefix = target.slice(0, target.indexOf(match[0]));
      if (REDUCED) { el.textContent = target; return; }
      var start = 0;
      var dur = 1100;
      var t0 = null;
      var decimals = match[0].indexOf('.') > -1 ? 1 : 0;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = start + (end - start) * eased;
        el.textContent = prefix + val.toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = target;
      }
      requestAnimationFrame(step);
    };
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        run(en.target);
        obs.unobserve(en.target);
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { io.observe(el); });
  }

  function initFaqSearch() {
    var input = document.querySelector('[data-faq-search]');
    if (!input) return;
    var items = document.querySelectorAll('[data-faq]');
    var empty = document.querySelector('[data-faq-empty]');
    input.addEventListener('input', function () {
      var q = (input.value || '').toLowerCase().trim();
      var hits = 0;
      items.forEach(function (el) {
        var match = !q || el.textContent.toLowerCase().indexOf(q) > -1;
        el.style.display = match ? '' : 'none';
        if (match) hits++;
        if (q && match) el.setAttribute('open', '');
        else if (!q) el.removeAttribute('open');
      });
      if (empty) empty.style.display = hits ? 'none' : 'block';
    });
  }

  function initContactForm() {
    var form = document.querySelector('[data-contact-form]');
    if (!form) return;
    var panel = document.querySelector('[data-form-panel]');
    var success = document.querySelector('[data-form-success]');
    var again = document.querySelector('[data-form-again]');
    var clearBtn = document.querySelector('[data-cf-clear]');

    var cityEl = document.getElementById('cf-city');
    var cityOtherEl = document.getElementById('cf-city-other');
    if (cityEl && cityOtherEl) {
      cityEl.addEventListener('change', function () {
        var isOther = cityEl.value === 'Other';
        cityOtherEl.style.display = isOther ? 'block' : 'none';
        if (isOther) cityOtherEl.focus();
        else cityOtherEl.value = '';
      });
    }

    // Shared by the "Clear form" button and "Submit another" — resets
    // native fields via form.reset(), then re-syncs the custom widgets
    // that a native reset doesn't touch: the phone country-code picker
    // (its own UI, not just the hidden input), the conditional "Other"
    // city field, the quiz-prefill note, and any error states. Also drops
    // the locally cached quiz-lead data (localStorage) that pre-fills
    // this form — otherwise a cleared form would silently re-fill itself
    // with the same old values on the next page load.
    function resetForm_() {
      form.reset();
      document.querySelectorAll('.field.has-error, .check-row.has-error').forEach(function (el) {
        el.classList.remove('has-error');
      });
      if (cityOtherEl) cityOtherEl.style.display = 'none';
      var phoneRoot = document.querySelector('[data-phone-select]');
      if (phoneRoot && phoneRoot.vvSetPhoneCode) phoneRoot.vvSetPhoneCode('+91');
      var prefillNote = document.querySelector('[data-quiz-prefill-note]');
      if (prefillNote) prefillNote.style.display = 'none';
      try { localStorage.removeItem('vv_quiz_lead'); } catch (e) {}
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        resetForm_();
        var nameEl = document.getElementById('cf-name');
        if (nameEl) nameEl.focus();
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var nameEl = document.getElementById('cf-name');
      var phoneEl = document.getElementById('cf-phone');
      var phoneCodeEl = document.getElementById('cf-phone-code');
      var emailEl = document.getElementById('cf-email');
      var courseEl = document.getElementById('cf-course');
      var batchEl = document.getElementById('cf-batch');
      var goalEl = document.getElementById('cf-goal');
      var agreeEl = document.getElementById('cf-agree');
      var agreeField = document.querySelector('[data-cf-field="agree"]');

      var valid = true;
      var firstInvalid = null;
      function markField(input, ok) {
        var wrap = input.closest('.field');
        if (wrap) wrap.classList.toggle('has-error', !ok);
        if (!ok) { valid = false; if (!firstInvalid) firstInvalid = input; }
      }

      markField(nameEl, nameEl.value.trim().length > 0);
      markField(phoneEl, phoneEl.value.replace(/\D/g, '').length >= 7);
      markField(emailEl, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim()));

      if (agreeField) agreeField.classList.toggle('has-error', !agreeEl.checked);
      if (!agreeEl.checked) { valid = false; if (!firstInvalid) firstInvalid = agreeEl; }

      if (!valid) { firstInvalid.focus(); return; }

      var city = cityEl ? cityEl.value : '';
      if (city === 'Other' && cityOtherEl && cityOtherEl.value.trim()) city = cityOtherEl.value.trim();

      var payload = {
        name: nameEl.value.trim(),
        phone: phoneCodeEl.value + ' ' + phoneEl.value.trim(),
        email: emailEl.value.trim(),
        city: city,
        course: courseEl.value,
        batch: batchEl.value,
        goal: goalEl.value.trim(),
        submittedAt: new Date().toISOString()
      };

      try {
        var log = JSON.parse(localStorage.getItem('vv_contact_submissions') || '[]');
        log.push(payload);
        localStorage.setItem('vv_contact_submissions', JSON.stringify(log));
      } catch (err) {}

      // Sends to the Google Apps Script backend (see /google-apps-script),
      // which appends a row to the "Contact Enrolments" sheet. No-ops until
      // assets/config.js has a real VV_APPS_SCRIPT_URL.
      if (window.vvSubmitToSheet) window.vvSubmitToSheet('contact', payload);

      if (panel) panel.style.display = 'none';
      if (success) success.style.display = 'block';
    });

    if (again) {
      again.addEventListener('click', function () {
        resetForm_();
        if (success) success.style.display = 'none';
        if (panel) panel.style.display = 'block';
      });
    }
  }
})();
