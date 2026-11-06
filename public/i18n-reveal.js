// Pages are hidden (html.i18n-pending) until the translations are applied; show them anyway after 2 s.
// A file of its own, not inline, because the Content-Security-Policy (public/_headers) only allows scripts from 'self'.
setTimeout(function () { document.documentElement.classList.remove('i18n-pending'); }, 2000);
