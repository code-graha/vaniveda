// WebGraha — Client-side source protection.
// Disables right-click, common DevTools keyboard shortcuts, and redirects
// to the 405 page when DevTools are detected open.
(function () {
    // Right-click context menu
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    // DevTools keyboard shortcuts (F12, Ctrl+Shift+I/J/C/K, Ctrl+U, Ctrl+S)
    document.addEventListener('keydown', function (e) {
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;
        const k = e.key ? e.key.toUpperCase() : '';

        if (
            e.key === 'F12' ||
            (ctrl && shift && ['I', 'J', 'C', 'K'].includes(k)) ||
            (ctrl && !shift && ['U', 'S'].includes(k))
        ) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });

    // DevTools open detection — redirect to 405.
    // Skip on error pages to avoid a redirect loop.
    const onErrorPage = /^\/(404|405)(\.html)?$/i.test(window.location.pathname) ||
                        /[/\\](404|405)(\.html)?$/i.test(window.location.pathname);

    // Skip on mobile/touch devices — there's no desktop DevTools to open here,
    // and iOS/Android browsers' collapsing address/toolbar UI changes
    // innerHeight independently of outerHeight as the user scrolls, which
    // false-triggers the outerWidth/innerWidth heuristic below (seen as a
    // real customer getting redirected to /405 on iPhone Safari).
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                      (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform));

    if (!onErrorPage && !isMobile) {
        let devtoolsOpen = false;
        const THRESHOLD = 160;
        const isInIframe = window.self !== window.top;

        setInterval(function () {
            let detected = false;

            if (isInIframe) {
                // Console-object timing trick works in sandboxed iframes
                const el = new Image();
                Object.defineProperty(el, 'id', {
                    get: function () { detected = true; }
                });
                // eslint-disable-next-line no-console
                console.log('%c', el);
            } else {
                // Window size difference — reliable on desktop
                const wDiff = window.outerWidth - window.innerWidth;
                const hDiff = window.outerHeight - window.innerHeight;
                detected = wDiff > THRESHOLD || hDiff > THRESHOLD;
            }

            if (detected) {
                if (!devtoolsOpen) {
                    devtoolsOpen = true;
                    window.location.replace('/405');
                }
            } else {
                devtoolsOpen = false;
            }
        }, 1000);
    }
})();
