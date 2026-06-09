/**
 * Pre-paint theme application to avoid a flash of the wrong theme.
 *
 * Loaded synchronously in <head> (no defer) by index.html and 404.html so the
 * data-theme attribute is set before first paint. Kept as a separate same-origin
 * file (rather than inline) so the Content-Security-Policy script-src can stay
 * 'self' without 'unsafe-inline'. The toggle and live OS-change handling live in
 * main.js; this file only sets the initial theme.
 */
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (_) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();