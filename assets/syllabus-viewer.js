// Protected syllabus viewer (assets/syllabus/view?level=A1). Renders every
// page of the requested syllabus into <canvas> elements with PDF.js
// instead of embedding the raw PDF in an iframe. That matters because
// embedding the raw file hands control to whichever PDF viewer the
// browser has built in — Chrome respects the #toolbar=0 URL fragment
// and hides its download/print button, but Firefox's PDF.js viewer does
// not, so its full toolbar (including Save) always shows regardless of
// what we set. Rendering to canvas ourselves means neither browser's
// native PDF chrome ever appears, so there's no download/print button
// to hide in the first place, in either browser.
//
// If canvas rendering can't load the file (e.g. opened directly via
// file:// in a browser that blocks local fetch() calls), this falls
// back to the old iframe+#toolbar=0 embed so the syllabus is still
// readable — degraded, but not broken.
//
// Honest limits: this deters casual copying, it doesn't achieve real
// DRM. Nothing served to a general browser can be made download-proof —
// a screenshot or OS-level "print to file" always remains possible. The
// PDF itself is also permission-encrypted (see docs/syllabus/_protect_pdfs.py)
// so a compliant reader like Adobe Acrobat enforces no-print/no-copy too.
(function () {
  var LEVELS = {
    A1: { name: 'DELF A1 Syllabus', file: 'VaniVeda-DELF-TCF-A1-Syllabus.pdf' },
    A2: { name: 'DELF A2 Syllabus', file: 'VaniVeda-DELF-TCF-A2-Syllabus.pdf' },
    B1: { name: 'DELF B1 Syllabus', file: 'VaniVeda-DELF-TCF-B1-Syllabus.pdf' },
    B2: { name: 'DELF B2 Syllabus', file: 'VaniVeda-DELF-TCF-B2-Syllabus.pdf' }
  };

  var params = new URLSearchParams(window.location.search);
  var level = (params.get('level') || '').toUpperCase();
  var entry = LEVELS[level];

  var titleEl = document.getElementById('syllabus-title');
  var frameWrap = document.getElementById('syllabus-frame-wrap');
  var notFound = document.getElementById('syllabus-not-found');
  var notice = document.getElementById('syllabus-notice');
  var statusEl = document.getElementById('syllabus-status');

  if (!entry) {
    frameWrap.hidden = true;
    notice.hidden = true;
    statusEl.hidden = true;
    notFound.hidden = false;
    titleEl.textContent = 'Syllabus not found';
    return;
  }

  document.title = entry.name + ' | VaniVeda';
  titleEl.textContent = entry.name;

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    var key = e.key ? e.key.toLowerCase() : '';
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (key === 'p' || key === 's')) e.preventDefault();
  });

  renderWithCanvas_(entry.file).catch(function () {
    renderWithIframeFallback_(entry.file, entry.name);
  });

  function renderWithCanvas_(file) {
    if (!window.pdfjsLib) return Promise.reject(new Error('pdf.js unavailable'));
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdfjs/pdf.worker.min.js';

    return pdfjsLib.getDocument(file).promise.then(function (pdf) {
      var reservedMargin = 32; // matches .syllabus-page's CSS margin/max-width reserve
      var containerWidth = Math.max(280, (frameWrap.clientWidth || 800) - reservedMargin);
      var dpr = window.devicePixelRatio || 1;

      function renderPage(pageNum) {
        if (pageNum > pdf.numPages) return Promise.resolve();
        return pdf.getPage(pageNum).then(function (page) {
          var baseViewport = page.getViewport({ scale: 1 });
          var scale = containerWidth / baseViewport.width;
          var viewport = page.getViewport({ scale: scale });

          var canvas = document.createElement('canvas');
          canvas.className = 'syllabus-page';
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = viewport.width + 'px';
          canvas.style.height = viewport.height + 'px';
          frameWrap.appendChild(canvas);

          var ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);
          return page.render({ canvasContext: ctx, viewport: viewport }).promise;
        }).then(function () {
          return renderPage(pageNum + 1);
        });
      }

      return renderPage(1).then(function () {
        statusEl.hidden = true;
      });
    });
  }

  function renderWithIframeFallback_(file, name) {
    statusEl.hidden = true;
    frameWrap.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.src = file + '#toolbar=0&navpanes=0&statusbar=0';
    iframe.title = name;
    iframe.loading = 'lazy';
    frameWrap.appendChild(iframe);
  }
})();
