(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const loadJSON = async (path) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  };

  const makeLink = (href, label) => {
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    a.textContent = label;
    return a;
  };

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

  function initThemeToggle() {
    const btn = $(".theme-toggle");
    if (!btn) return;
    let chosen = false;

    const sync = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    };
    sync();

    btn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      const update = () => {
        document.documentElement.setAttribute("data-theme", next);
        chosen = true;
        try {
          localStorage.setItem("theme", next);
        } catch (_) {}
        sync();
      };
      withViewTransition(update, "theme");
    });

    // Follow OS theme changes mid-session, unless the user picked a theme.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", (e) => {
      let stored = null;
      try {
        stored = localStorage.getItem("theme");
      } catch (_) {}
      if (chosen || stored === "light" || stored === "dark") return;
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      sync();
    });
  }

  function initField() {
    const band = $("[data-field]");
    const cv = band && $("canvas", band);
    const ctx = cv && cv.getContext && cv.getContext("2d");
    if (!ctx) return;

    const STEP = 13;       // lattice spacing, px
    const K = 0.052;       // wavenumber; sets the fringe spacing
    const REACH = 135;     // how far the pointer can drag a source, px

    let w = 1;
    let h = 1;
    let frame = 0;
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
      frame = far > 0.4 ? requestAnimationFrame(tick) : 0;
    };

    const kick = () => {
      if (frame || reducedMotion.matches) return;
      frame = requestAnimationFrame(tick);
    };

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      resize();
      cur = home();
      tgt = home();
      draw();
    };

    reset();
    window.addEventListener("resize", reset);
    reducedMotion.addEventListener("change", reset);
    // At rest there is no next frame to pick up new token values, so a theme
    // change has to repaint the plate explicitly.
    new MutationObserver(draw).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    band.addEventListener("pointermove", (e) => {
      if (reducedMotion.matches) return;
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

  function renderPublications(items, list) {
    list.textContent = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = "No publications yet.";
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
      authors.textContent = p.authors;

      const parts = [];
      if (p.journal) parts.push(p.journal);
      if (p.arxiv) parts.push(makeLink(p.arxiv, "arXiv"));
      if (p.doi) parts.push(makeLink(p.doi, "DOI"));

      const meta = document.createElement("span");
      meta.className = "pub__meta";
      parts.forEach((part, i) => {
        if (i) meta.append(" · ");
        meta.append(part);
      });

      const body = document.createElement("div");
      body.append(title, authors, meta);

      li.append(year, body);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

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
      name.appendChild(makeLink(p.url, p.name));

      const description = document.createElement("span");
      description.textContent = p.description;

      li.append(name, description);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

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
      .filter(([, items]) => items.length)
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

  function initUpdated() {
    const el = $("[data-updated]");
    if (!el) return;

    const when = new Date(document.lastModified);
    if (Number.isNaN(when.getTime())) return;

    el.textContent =
      "Updated " + when.toLocaleDateString("en", { month: "long", year: "numeric" });
  }

  initThemeToggle();
  initField();
  initContact();
  initPublications();
  initProjects();
  initInterests();
  initUpdated();
})();
