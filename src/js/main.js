/**
 * Personal portfolio — single JS file, no dependencies, no build step.
 *
 * Loaded with `defer` from index.html and 404.html, so it runs after the HTML
 * is parsed. Everything is wrapped in an IIFE in strict mode; nothing leaks to
 * global scope.
 *
 * Behaviors (each `init*` no-ops when its root markup is absent):
 *   theme toggle · interference plate · contact obfuscation ·
 *   publication filter · projects · interests · footer date.
 *
 * Boot order is defined at the bottom of the file. The async features
 * (publications, projects, interests) fetch their content from src/data/*.json.
 *
 * Conventions for editing:
 *   - Stay vanilla: no dependencies, no framework, must run as-is in the browser.
 *   - Progressive enhancement: guard new browser APIs and honor reduced-motion.
 *   - Keep ARIA state (aria-pressed / aria-expanded) in sync with visual state.
 *   - Build all JSON-derived hrefs via safeUrl() so unsafe schemes are neutralized.
 *   - Build JSON-derived text with textContent, never innerHTML.
 *   - The initial theme is set by src/js/theme.js (pre-paint); this file only
 *     handles the toggle and live OS-change following.
 */
(function () {
  "use strict";

  /** querySelector shorthand; returns the first match or null. */
  const $ = (sel, root = document) => root.querySelector(sel);
  /** querySelectorAll shorthand; returns a real Array (so .map/.filter work). */
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /**
   * Fetch + parse a same-origin JSON file. Throws on a non-OK HTTP status;
   * callers render their own error UI. Must stay same-origin (the CSP in
   * index.html only allows same-origin connect-src). No cache-busting query:
   * GitHub Pages' short max-age means edited data reaches returning visitors
   * within minutes, so the browser cache can be used as-is.
   * @param {string} path - Same-origin path to a JSON file.
   * @returns {Promise<any>} Parsed JSON.
   */
  const loadJSON = async (path) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  };

  /**
   * Build a safe href from JSON-derived data. Returns "#" for empty values or
   * dangerous schemes (javascript:/data:/vbscript:); passes absolute http(s) URLs
   * through unchanged; otherwise prefixes `base` — an arXiv/DOI base or "https://"
   * for scheme-less project URLs, or "" to keep a relative PDF path.
   * @param {string} value - Raw value from a data file.
   * @param {string} [base] - Prefix applied to bare/relative values.
   * @returns {string} A safe href.
   */
  const safeUrl = (value, base = "") => {
    const v = String(value || "").trim();
    if (!v) return "#";
    if (/^(?:javascript|data|vbscript):/i.test(v)) return "#";
    if (/^https?:\/\//i.test(v)) return v;
    return base + v;
  };

  /**
   * Build an external link with a pre-vetted href.
   * @param {string} href - Pre-validated URL.
   * @param {string} label - Visible link text (e.g. "arXiv", "DOI", "PDF").
   * @returns {HTMLAnchorElement}
   */
  const makeLink = (href, label) => {
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    a.textContent = label;
    return a;
  };

  /**
   * Run a DOM update inside a same-document view transition when the API is
   * available and motion is allowed; otherwise apply it synchronously.
   * While the transition runs, `data-vt=<type>` is set on <html> so CSS can scope
   * per-transition styling (see the "View transitions" section in main.css).
   * Reads prefers-reduced-motion live (not a load-time snapshot) so a mid-session
   * OS change is honored.
   * @param {() => void} update - Mutates the DOM.
   * @param {string} [type] - Optional transition label, mirrored to <html data-vt>.
   * @returns {ViewTransition|null} The transition, or null when applied directly.
   */
  function withViewTransition(update, type) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof document.startViewTransition !== "function") {
      update();
      return null;
    }
    const root = document.documentElement;
    if (type) root.dataset.vt = type;
    const vt = document.startViewTransition(update);
    if (type) vt.finished.finally(() => delete root.dataset.vt);
    return vt;
  }

  /* ----------------------------------------------------------
   *  Theme toggle
   * ---------------------------------------------------------- */
  /**
   * Wire up the dark/light toggle in the footer.
   * - The button's icon shows the theme it switches *to*; CSS does that swap off
   *   data-theme, so only aria-pressed and aria-label are set here.
   * - On click, flips data-theme and persists the choice to localStorage["theme"]
   *   (try/catch guards private-mode failures). The swap runs inside a view
   *   transition, so the two palettes cross-fade instead of snapping.
   * - Follows OS prefers-color-scheme changes mid-session, but only while the user
   *   has made no explicit choice (nothing stored).
   * The first paint's theme is set by src/js/theme.js, not here.
   */
  function initThemeToggle() {
    const btn = $(".theme-toggle");
    if (!btn) return;

    const sync = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    };
    sync();

    btn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      withViewTransition(() => {
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem("theme", next);
        } catch (_) {}
        sync();
      }, "theme");
    });

    // Follow OS theme changes mid-session, unless the user picked a theme.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", (e) => {
      let stored = null;
      try {
        stored = localStorage.getItem("theme");
      } catch (_) {}
      if (stored) return;
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      sync();
    });
  }

  /* ----------------------------------------------------------
   *  Interference plate
   * ---------------------------------------------------------- */
  /**
   * Draw the page's one ornament: two coherent point sources interfering on a
   * lattice of cells. Cell brightness is the squared sum of the two amplitudes,
   * and the sign of that sum picks which of the page's two inks it is drawn in.
   *
   * The pattern answers the pointer rather than running on a clock. Moving the
   * cursor across the plate sets a target position for the sources; they ease
   * toward it, the lattice re-renders while they travel, and the loop stops as
   * soon as they arrive — so an idle page costs nothing and sits on a still
   * frame, which is also what a screenshot and a reduced-motion visitor get.
   */
  function initField() {
    const band = $("[data-field]");
    const cv = band && $("canvas", band);
    const ctx = cv && cv.getContext && cv.getContext("2d");
    if (!ctx) return;

    const STEP = 13;       // lattice spacing, px
    const K = 0.052;       // wavenumber; sets the fringe spacing
    const REACH = 135;     // how far the pointer can drag a source, px
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 1;
    let h = 1;
    let running = false;
    let cur = [0, 0, 0, 0];  // [x1, y1, x2, y2], current
    let tgt = [0, 0, 0, 0];  // [x1, y1, x2, y2], eased toward

    const home = () => [w * 0.34, h * 0.44, w * 0.68, h * 0.52];

    const resize = () => {
      w = Math.max(1, cv.offsetWidth);
      h = Math.max(1, cv.offsetHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const cs = getComputedStyle(cv);
      const bright = cs.getPropertyValue("--accent").trim();
      const dim = cs.getPropertyValue("--text").trim();
      ctx.fillStyle = cs.getPropertyValue("--bg").trim();
      ctx.fillRect(0, 0, w, h);
      for (let y = STEP / 2; y < h; y += STEP) {
        for (let x = STEP / 2; x < w; x += STEP) {
          const amplitude =
            Math.cos(K * Math.hypot(x - cur[0], y - cur[1])) +
            Math.cos(K * Math.hypot(x - cur[2], y - cur[3]));
          const intensity = (amplitude * amplitude) / 4;
          if (intensity < 0.02) continue;
          const size = Math.max(1, intensity * (STEP - 4));
          ctx.globalAlpha = 0.05 + intensity * 0.34;
          ctx.fillStyle = amplitude > 0 ? bright : dim;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = () => {
      let far = 0;
      for (let i = 0; i < 4; i++) {
        cur[i] += (tgt[i] - cur[i]) * 0.09;
        far = Math.max(far, Math.abs(tgt[i] - cur[i]));
      }
      draw();
      if (far > 0.4) requestAnimationFrame(tick);
      else running = false;
    };

    const kick = () => {
      if (running || still) return;
      running = true;
      requestAnimationFrame(tick);
    };

    const reset = () => {
      resize();
      cur = home();
      tgt = home();
      draw();
    };

    reset();
    window.addEventListener("resize", reset);
    // At rest there is no next frame to pick up new token values, so a theme
    // change has to repaint the plate explicitly.
    new MutationObserver(draw).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    if (still) return;

    band.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      const at = home();
      tgt = [
        at[0] + nx * REACH,
        at[1] + ny * (REACH * 0.63),
        at[2] - nx * REACH,
        at[3] - ny * (REACH * 0.63),
      ];
      kick();
    });
    band.addEventListener("pointerleave", () => {
      tgt = home();
      kick();
    });
  }

  /* ----------------------------------------------------------
   *  Contact
   * ---------------------------------------------------------- */
  /**
   * Assemble the email and Matrix handle at runtime from split string parts so
   * simple scrapers can't lift them from the static HTML.
   * - [data-email] gets a mailto: href + rel="me noopener"; its text is set to the
   *   address unless data-email="href" (link-only, keeps existing label).
   * - [data-matrix] gets a https://matrix.to/#/... href (handle URL-encoded), with
   *   the same data-matrix="href" opt-out for the text.
   */
  function initContact() {
    // Email parts (split to avoid simple scraper regex).
    const emailUser = "hello";
    const emailDomain = ["sschenk", "simplelogin", "com"].join(".");
    const email = emailUser + "@" + emailDomain;

    const matrixUser = "itsschenk";
    const matrixServer = "matrix.org";
    const matrixHandle = "@" + matrixUser + ":" + matrixServer;

    $$("[data-email]").forEach((el) => {
      if (el.dataset.email !== "href") el.textContent = email;
      el.setAttribute("href", "mailto:" + email);
      el.setAttribute("rel", "me noopener");
    });

    $$("[data-matrix]").forEach((el) => {
      if (el.dataset.matrix !== "href") el.textContent = matrixHandle;
      el.setAttribute("href", "https://matrix.to/#/" + encodeURIComponent(matrixHandle));
      el.setAttribute("rel", "me noopener");
    });
  }

  /* ----------------------------------------------------------
   *  Publications
   *
   *  JSON: src/data/publications.json — array of objects with fields:
   *    year    {number}            required; drives sorting/filtering
   *    title   {string}
   *    authors {string|string[]}   string is comma-separated
   *    venue / journal {string}    either key works; venue wins if both present
   *    arxiv   {string}            bare ID (2506.10188) or full URL
   *    doi     {string}            bare DOI or full URL
   *    pdf     {string}            URL or relative path; unsafe schemes neutralized
   * ---------------------------------------------------------- */
  /**
   * Render a list of publications into `list`: the year in the shared left
   * gutter, then title, authors and a meta line of venue and links.
   * arxiv/doi accept bare IDs (expanded to canonical URLs) or full URLs; every
   * href is built via safeUrl(), which neutralizes javascript:/data:/vbscript:.
   * @param {object[]} items - Publications to render.
   * @param {HTMLElement} list - The <ol> to fill.
   */
  function renderPublications(items, list) {
    list.textContent = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = "No publications match this filter.";
      list.appendChild(li);
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((p, idx) => {
      const li = document.createElement("li");
      // Stable, unique custom-ident so a paper shown by two filters morphs to its
      // new position across a view transition instead of cross-fading. arXiv ids are
      // unique; fall back to DOI, then the list index.
      li.style.viewTransitionName =
        "pub-" + (String(p.arxiv || p.doi || idx).replace(/[^\w-]/g, "") || idx);

      const year = document.createElement("span");
      year.className = "gutter";
      year.textContent = String(p.year);

      const title = document.createElement("span");
      title.className = "pub__title";
      title.textContent = p.title;

      const authors = document.createElement("span");
      authors.className = "pub__authors";
      const authorList = Array.isArray(p.authors)
        ? p.authors
        : String(p.authors || "").split(/,\s*/);
      authors.textContent = authorList.join(", ");

      // Several entries have no journal, so the parts are collected first and
      // joined — appending a separator per part would leave a stray one.
      const parts = [];
      const venueText = p.venue || p.journal;
      if (venueText) parts.push(venueText);
      if (p.arxiv) parts.push(makeLink(safeUrl(p.arxiv, "https://arxiv.org/abs/"), "arXiv"));
      if (p.doi) parts.push(makeLink(safeUrl(p.doi, "https://doi.org/"), "DOI"));
      // No base, so absolute http(s) URLs and relative in-repo PDF paths both pass.
      if (p.pdf) parts.push(makeLink(safeUrl(p.pdf), "PDF"));

      const meta = document.createElement("span");
      meta.className = "pub__meta";
      parts.forEach((part, i) => {
        if (i) meta.append(" · ");
        meta.append(part);
      });

      // One wrapper, so the entry is two grid children like every other list.
      const body = document.createElement("div");
      body.append(title, authors, meta);

      li.append(year, body);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  /**
   * Load and wire up the publication list.
   *
   * Sorting: by year descending, ties broken by arXiv ID (YYMM.NNNNN) descending,
   * so "recent" is correct regardless of the JSON's order.
   *
   * Views: "recent" (first 3, default) and "all", swapped by the single link
   * below the list. The view is mirrored in the URL query and read back on
   * load: ?pub=all, else recent. writeUrl() uses history.replaceState and keeps
   * the #publications hash.
   */
  async function initPublications() {
    const list = $("[data-pub-list]");
    const toggle = $("[data-pub-toggle]");
    if (!list || !toggle) return;

    let data;
    try {
      data = await loadJSON("src/data/publications.json");
    } catch (err) {
      console.error("Failed to load publications:", err);
      list.textContent = "";
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent =
        "Publications couldn't load. If you opened this file directly, run a local server.";
      list.appendChild(li);
      return;
    }

    // arXiv IDs (YYMM.NNNNN) break ties within a year by recency, so "recent"
    // stays correct regardless of the JSON's ordering.
    const arxivKey = (p) => {
      const m = String(p.arxiv || "").match(/(\d{4}\.\d{4,5})/);
      return m ? m[1] : "";
    };
    data.sort((a, b) => b.year - a.year || arxivKey(b).localeCompare(arxivKey(a)));

    const readUrl = () =>
      new URLSearchParams(location.search).get("pub") === "all" ? "all" : "recent";

    const writeUrl = () => {
      const q = mode === "all" ? "?pub=all" : "";
      history.replaceState(null, "", location.pathname + q + "#publications");
    };

    let mode = readUrl();

    const applyFilter = () => {
      const all = mode === "all";
      renderPublications(all ? data : data.slice(0, 3), list);
      toggle.textContent = all ? "Show fewer" : "Show all";
      toggle.setAttribute("aria-expanded", String(all));
    };

    toggle.addEventListener("click", () => {
      mode = mode === "all" ? "recent" : "all";
      writeUrl();
      withViewTransition(applyFilter, "pub");
    });

    // With three or fewer papers the list is never truncated, so nothing to open.
    if (data.length <= 3) toggle.parentElement.hidden = true;

    applyFilter();
  }

  /* ----------------------------------------------------------
   *  Projects
   *
   *  JSON: src/data/projects.json — array of objects with fields:
   *    name {string} · description {string} · tags {string[]} ·
   *    url {string} (scheme-less values get https:// prefixed) · year {number}
   * ---------------------------------------------------------- */
  /**
   * Load src/data/projects.json and render it newest first: the linked name in
   * the shared left gutter, the description beside it.
   *
   * Here the gutter key is the project's own name rather than a category — it
   * is what a reader scans this list by, so it takes the column that every
   * other list gives to its key, and the entries need no " — " to separate the
   * two halves. `year` sorts the list; `tags` is not rendered.
   */
  async function initProjects() {
    const list = $("[data-project-list]");
    if (!list) return;

    let data;
    try {
      data = await loadJSON("src/data/projects.json");
    } catch (err) {
      console.error("Failed to load projects:", err);
      list.textContent = "";
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = "Projects couldn't load.";
      list.appendChild(li);
      return;
    }

    data.sort((a, b) => b.year - a.year || String(a.name).localeCompare(String(b.name)));

    list.textContent = "";
    const frag = document.createDocumentFragment();
    data.forEach((p) => {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.className = "gutter";
      const link = document.createElement("a");
      link.href = safeUrl(p.url, "https://");
      link.rel = "noopener";
      link.textContent = p.name;
      name.appendChild(link);

      const description = document.createElement("span");
      description.textContent = p.description;

      li.append(name, description);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  /* ----------------------------------------------------------
   *  Interests
   *
   *  JSON: src/data/skills.json — an object of { group: string[] }.
   * ---------------------------------------------------------- */
  /**
   * Load src/data/skills.json and render one line per group: the group name in
   * the shared left gutter, then its items as a comma-separated list. Empty
   * groups are skipped.
   */
  async function initInterests() {
    const list = $("[data-skills]");
    if (!list) return;

    let data;
    try {
      data = await loadJSON("src/data/skills.json");
    } catch (err) {
      console.error("Failed to load interests:", err);
      list.textContent = "";
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = "Interests couldn't load.";
      list.appendChild(li);
      return;
    }

    list.textContent = "";
    const frag = document.createDocumentFragment();
    Object.entries(data)
      .filter(([, items]) => Array.isArray(items) && items.length)
      .forEach(([label, items]) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.className = "gutter";
        name.textContent = label;
        const values = document.createElement("span");
        values.textContent = items.join(", ");
        li.append(name, values);
        frag.appendChild(li);
      });
    list.appendChild(frag);
  }

  /* ----------------------------------------------------------
   *  Footer date
   * ---------------------------------------------------------- */
  /**
   * Stamp the footer with the page's own Last-Modified date, read from
   * document.lastModified. With no build step there is nothing to inject a
   * date at deploy time, and a hand-written one silently goes false; this
   * needs no fetch, no extra request and no maintenance, and it tracks the
   * deploy, which is what "updated" means for a static page.
   *
   * Served over file:// there is no Last-Modified header and the browser
   * substitutes the current time. That is left alone: guarding against it
   * costs a real date whenever a visitor's clock runs ahead of the server's.
   */
  function initUpdated() {
    const el = $("[data-updated]");
    if (!el) return;

    const when = new Date(document.lastModified);
    if (Number.isNaN(when.getTime())) return;

    el.textContent =
      "Updated " + when.toLocaleDateString("en", { month: "long", year: "numeric" });
  }

  /* ----------------------------------------------------------
   *  Boot — run each feature once. Order is intentional but loose: the sync
   *  features run first, then the three async (JSON-fetching) ones kick off.
   *  Every init* no-ops when its root markup is missing.
   * ---------------------------------------------------------- */
  initThemeToggle();
  initField();
  initContact();
  initPublications();
  initProjects();
  initInterests();
  initUpdated();
})();
