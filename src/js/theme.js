// Runs before paint to avoid a theme flash; an external file keeps CSP strict.
(function () {
  let stored;
  try {
    stored = localStorage.getItem("theme");
  } catch (_) {}
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = stored === "light" || stored === "dark"
    ? stored
    : prefersDark ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
})();
