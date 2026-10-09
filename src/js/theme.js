// Applies a stored light/dark override before paint, avoiding a flash; an
// external file keeps CSP strict. Without one, CSS follows the OS preference.
(function () {
  let stored;
  try {
    stored = localStorage.getItem("theme");
  } catch (_) {}
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
})();
