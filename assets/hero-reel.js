// Courses page hero: the embedded YouTube Shorts reel always autoplays
// muted and loops, with no play/pause exposed — the only control is the
// custom mute/unmute button (#hero-reel-mute), driven through YouTube's
// official IFrame Player API (postMessage under the hood) rather than a
// fake button, so it actually reflects and changes the player's real
// audio state.
//
// Known limit, not a bug: YouTube's Terms of Service require their logo
// watermark to stay visible and clickable on every embed regardless of
// player parameters — there is no legitimate way to remove it, and this
// deliberately doesn't try to crop/hide it with CSS.
window.onYouTubeIframeAPIReady = function () {
  var iframe = document.getElementById('hero-reel-player');
  var btn = document.getElementById('hero-reel-mute');
  if (!iframe || !btn) return;

  var iconOff = btn.querySelector('.hero-reel-mute-icon-off');
  var iconOn = btn.querySelector('.hero-reel-mute-icon-on');

  function reflectMuted(muted) {
    btn.setAttribute('aria-pressed', String(!muted));
    btn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    // Inline style.display, not the hidden attribute/property — guaranteed
    // to win over any stylesheet rule regardless of specificity, since a
    // conflicting rule was making both icons render at once.
    iconOff.style.display = muted ? 'block' : 'none';
    iconOn.style.display = muted ? 'none' : 'block';
  }

  // YT error codes: 2 = invalid video ID, 5 = HTML5 player error,
  // 100 = video removed/private, 101/150 = embedding disabled by the
  // video's owner for this domain. Logged so a silent failure (button
  // stays disabled forever) is diagnosable instead of just "not working".
  var ERROR_MESSAGES = {
    2: 'invalid video ID',
    5: 'HTML5 player error',
    100: 'video not found or private',
    101: 'embedding disabled by the video owner',
    150: 'embedding disabled by the video owner'
  };

  var player = new YT.Player('hero-reel-player', {
    events: {
      onReady: function (e) {
        e.target.mute();
        reflectMuted(true);
        btn.disabled = false;
        btn.addEventListener('click', function () {
          if (player.isMuted()) { player.unMute(); reflectMuted(false); }
          else { player.mute(); reflectMuted(true); }
        });
      },
      onError: function (e) {
        console.warn('[hero-reel] YouTube player error ' + e.data + ': ' + (ERROR_MESSAGES[e.data] || 'unknown'));
      }
    }
  });
};
