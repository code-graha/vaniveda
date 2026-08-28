// Click-to-expand lightbox for proof cards (certificates, video reviews).
// Every card is real, complete content on its own — a compact cropped
// thumbnail — so this is a pure enhancement: with JS disabled, cards are
// just non-interactive cards and nothing is lost. Uses <dialog> for
// native focus trap + Escape-to-close + backdrop instead of a hand-rolled
// modal (see the ui-ux-pro-max `system-controls` guideline).
(function () {
  var dialog = document.getElementById('proof-lightbox');
  if (!dialog) return;

  var body = dialog.querySelector('.proof-lightbox-body');
  var caption = dialog.querySelector('.proof-lightbox-caption');
  var closeBtn = dialog.querySelector('.proof-lightbox-close');
  var opener = null;

  function openFromCard(card) {
    var type = card.getAttribute('data-lightbox');
    var src = card.getAttribute('data-lightbox-src');
    if (!type || !src) return;

    body.innerHTML = '';
    if (type === 'video') {
      var video = document.createElement('video');
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      body.appendChild(video);
    } else {
      var img = document.createElement('img');
      img.src = src;
      img.alt = card.getAttribute('data-lightbox-alt') || '';
      body.appendChild(img);
    }
    caption.textContent = card.getAttribute('data-lightbox-caption') || '';
    opener = card;
    dialog.showModal();
  }

  document.querySelectorAll('[data-lightbox]').forEach(function (card) {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-haspopup', 'dialog');
    card.addEventListener('click', function () { openFromCard(card); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFromCard(card);
      }
    });
  });

  closeBtn.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', function () {
    var media = body.querySelector('video');
    if (media) { media.pause(); media.removeAttribute('src'); media.load(); }
    body.innerHTML = '';
    if (opener) { opener.focus(); opener = null; }
  });
})();
