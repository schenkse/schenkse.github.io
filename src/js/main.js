/**
 * Personal portfolio — single JS file, no dependencies, no build step.
 *
 * Loaded with `defer` from index.html, so it runs after the HTML is parsed.
 * Everything is wrapped in an IIFE in strict mode; nothing leaks to global scope.
 *
 * Behaviors (most `init*` no-op when their root markup is absent):
 *   theme toggle · scroll reveal · contact obfuscation · publication filter ·
 *   hamburger menu · active-section highlight · projects gallery · skills ·
 *   hero motif canvas.
 *
 * Boot order is defined at the bottom of the file. The async features
 * (publications, projects, skills) fetch their content from src/data/*.json.
 *
 * Conventions for editing:
 *   - Stay vanilla: no dependencies, no framework, must run as-is in the browser.
 *   - Progressive enhancement: guard new browser APIs and honor reduced-motion.
 *   - Keep ARIA state (aria-expanded / aria-pressed / aria-current) in sync with
 *     visual state.
 *   - Build all JSON-derived hrefs via safeUrl() so unsafe schemes are neutralized.
 *   - The initial theme is set by an inline <head> script in index.html (pre-paint
 *     to avoid a flash); this file only wires up the toggle and live OS changes.
 *   - Bump the `?v=` query on the <script> tag in index.html when changing this
 *     file, to bust the browser cache.
 */
(() => {
  "use strict";

  /** querySelector shorthand; returns the first match or null. */
  const $ = (sel, root = document) => root.querySelector(sel);
  /** querySelectorAll shorthand; returns a real Array (so .map/.filter work). */
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  /** Snapshot of the reduced-motion media query; gates all animation. */
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /** Lazily-created shared IntersectionObserver for scroll reveals. */
  let revealObserver = null;

  /**
   * Fetch + parse a same-origin JSON file. Throws on a non-OK HTTP status;
   * callers render their own error UI. Must stay same-origin (the CSP in
   * index.html only allows same-origin connect-src). Freshness is handled by the
   * `?v=` query on the caller's path (bump it when the data changes), so the
   * browser cache can be used without a revalidation round-trip on every load.
   * @param {string} path - Same-origin path to a JSON file.
   * @returns {Promise<any>} Parsed JSON.
   */
  const loadJSON = async (path) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  };

  /**
   * Build a publication link chip (<a class="pub-list__link" rel="noopener">).
   * The caller passes an already-vetted href.
   * @param {string} href - Pre-validated URL.
   * @param {string} label - Visible link text (e.g. "arXiv", "DOI", "PDF").
   * @returns {HTMLAnchorElement}
   */
  const makeLink = (href, label) => {
    const a = document.createElement("a");
    a.className = "pub-list__link";
    a.href = href;
    a.rel = "noopener";
    a.textContent = label;
    return a;
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

  /* ----------------------------------------------------------
   *  Theme toggle
   * ---------------------------------------------------------- */
  /**
   * Wire up the dark/light toggle button.
   * - Syncs aria-pressed / aria-label to the current data-theme on <html>.
   * - On click, flips data-theme and persists the choice to localStorage["theme"]
   *   (try/catch guards private-mode failures).
   * - Follows OS prefers-color-scheme changes mid-session, but only while the user
   *   has made no explicit choice (nothing stored).
   * The first paint's theme is set by an inline <head> script in index.html, not here.
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
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (_) {}
      sync();
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
   *  Scroll reveal
   * ---------------------------------------------------------- */
  /**
   * Reveal one element (add class `is-visible`) when it scrolls into view, using
   * a single shared IntersectionObserver; each element is unobserved after its
   * first reveal. Falls back to revealing immediately when reduced-motion is
   * preferred or IntersectionObserver is unsupported.
   * Also called directly by initSkills() for dynamically created groups.
   * @param {Element} el
   */
  function observeReveal(el) {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      el.classList.add("is-visible");
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-visible");
              revealObserver.unobserve(e.target);
            }
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
      );
    }
    revealObserver.observe(el);
  }

  /** Register every static [data-reveal] element for scroll reveal. */
  function initScrollReveal() {
    $$("[data-reveal]").forEach(observeReveal);
  }

  /* ----------------------------------------------------------
   *  Hamburger / mobile nav
   * ---------------------------------------------------------- */
  /**
   * Wire up the mobile menu (.nav-toggle + #primary-nav). Open/closed state lives
   * in the toggle's aria-expanded attribute and the nav's `is-open` class.
   * - Click toggles; clicking a nav link closes (no focus restore).
   * - Escape closes and restores focus to the toggle.
   * - While open, Tab / Shift+Tab are trapped within the visible focusable items
   *   (focusables() filters hidden elements via offsetParent !== null).
   */
  function initNavToggle() {
    const toggle = $(".nav-toggle");
    const nav = $("#primary-nav");
    if (!toggle || !nav) return;

    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    const focusables = () =>
      $$('a[href], button:not([disabled])', nav).filter(
        (el) => el.offsetParent !== null
      );

    const close = (restoreFocus) => {
      if (!isOpen()) return;
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
      if (restoreFocus) toggle.focus();
    };
    const open = () => {
      toggle.setAttribute("aria-expanded", "true");
      nav.classList.add("is-open");
      const items = focusables();
      if (items.length) items[0].focus();
    };

    toggle.addEventListener("click", () => {
      isOpen() ? close(true) : open();
    });

    nav.addEventListener("click", (e) => {
      if (e.target instanceof HTMLAnchorElement) close(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) close(true);
    });

    // Trap focus within the open mobile menu.
    nav.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !isOpen()) return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* ----------------------------------------------------------
   *  Header shadow on scroll + active section in nav
   * ---------------------------------------------------------- */
  /**
   * Two scroll behaviors:
   *  1. Toggle `is-scrolled` on .site-header once scrolled past 8px (passive listener).
   *  2. Mark the most-visible section's nav link with aria-current="section", via an
   *     IntersectionObserver whose rootMargin (-40% / -50%) makes the "active" band
   *     roughly the middle of the viewport. Sections are those targeted by
   *     .primary-nav a[href^="#"] links.
   */
  function initActiveSection() {
    const header = $(".site-header");
    const navLinks = $$('.primary-nav a[href^="#"]');
    const sections = navLinks
      .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
      .filter(Boolean);

    const clearActive = () =>
      navLinks.forEach((a) => a.removeAttribute("aria-current"));

    if (header) {
      const onScroll = () => {
        header.classList.toggle("is-scrolled", window.scrollY > 8);
        // The observer only sets — never clears — the highlight, so the first
        // link stays stuck active when scrolling back up into the hero. Clear it
        // only while above the first section. The threshold matches the active
        // band's lower edge (50% of the viewport, the bottom of the -40%/-50%
        // rootMargin) so this never fires while that section is intersecting —
        // using the upper edge (40%) would clear it during its first entry.
        if (
          sections.length &&
          window.scrollY + window.innerHeight * 0.5 < sections[0].offsetTop
        ) {
          clearActive();
        }
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    if (!sections.length || !("IntersectionObserver" in window)) return;

    const setActive = (id) => {
      navLinks.forEach((a) => {
        if (a.getAttribute("href") === "#" + id) {
          a.setAttribute("aria-current", "section");
        } else {
          a.removeAttribute("aria-current");
        }
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((s) => io.observe(s));
  }

  /* ----------------------------------------------------------
   *  Contact obfuscation — emails and Matrix assembled at runtime
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
    const emailUser = "hello"
    const emailDomain = ["sschenk", "simplelogin", "com"].join(".");
    const email = emailUser + "@" + emailDomain;

    const matrixUser = "itsschenk";
    const matrixServer = "matrix.org";
    const matrixHandle = "@" + matrixUser + ":" + matrixServer;

    const emailEls = $$("[data-email]");
    emailEls.forEach((el) => {
      if (el.dataset.email !== "href") el.textContent = email;
      el.setAttribute("href", "mailto:" + email);
      el.setAttribute("rel", "me noopener");
    });

    const matrixEls = $$("[data-matrix]");
    matrixEls.forEach((el) => {
      if (el.dataset.matrix !== "href") el.textContent = matrixHandle;
      el.setAttribute(
        "href",
        "https://matrix.to/#/" + encodeURIComponent(matrixHandle)
      );
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
   * Render a list of publications into `list`, updating the `count` label.
   * Shows an empty-state row when there are none. arxiv/doi accept bare IDs (expanded
   * to canonical URLs) or full URLs; every href is built via safeUrl(), which
   * neutralizes javascript:/data:/vbscript: schemes to "#".
   * @param {object[]} items - Publications to render.
   * @param {HTMLElement} list - The <ul> to fill.
   * @param {HTMLElement} count - Element receiving the "N publications" label.
   */
  function renderPublications(items, list, count) {
    list.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "pub-list__empty";
      li.textContent = "No publications match this filter.";
      list.appendChild(li);
      count.textContent = "";
      return;
    }
    count.textContent = items.length + " publication" + (items.length > 1 ? "s" : "");

    const frag = document.createDocumentFragment();
    items.forEach((p) => {
      const li = document.createElement("li");
      li.className = "pub-list__item";

      const year = document.createElement("span");
      year.className = "pub-list__year";
      year.textContent = String(p.year);

      const main = document.createElement("div");
      const title = document.createElement("p");
      title.className = "pub-list__title";
      title.textContent = p.title;
      const authors = document.createElement("p");
      authors.className = "pub-list__authors";
      const authorList = Array.isArray(p.authors)
        ? p.authors
        : String(p.authors || "").split(/,\s*/);
      authors.textContent = authorList.join(", ");
      main.append(title, authors);
      const venueText = p.venue || p.journal;
      if (venueText) {
        const venue = document.createElement("p");
        venue.className = "pub-list__venue";
        venue.textContent = venueText;
        main.appendChild(venue);
      }

      const links = document.createElement("div");
      links.className = "pub-list__links";
      if (p.arxiv) {
        links.appendChild(makeLink(safeUrl(p.arxiv, "https://arxiv.org/abs/"), "arXiv"));
      }
      if (p.doi) {
        links.appendChild(makeLink(safeUrl(p.doi, "https://doi.org/"), "DOI"));
      }
      if (p.pdf) {
        // No base, so absolute http(s) URLs and relative in-repo PDF paths both pass.
        links.appendChild(makeLink(safeUrl(p.pdf), "PDF"));
      }

      li.append(year, main, links);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  /**
   * Load and wire up the filterable publication list.
   *
   * Sorting: by year descending, ties broken by arXiv ID (YYMM.NNNNN) descending,
   * so "Recent" is correct regardless of the JSON's order.
   *
   * Filter modes (state.mode): "recent" (first 3, default), "all", "year" (one year
   * from the dropdown). The active filter is mirrored in the URL query and read back
   * on load: ?pub=all, ?pub=<year> (only if that year exists), else recent.
   * writeUrl() uses history.replaceState and keeps the #publications hash. The year
   * dropdown closes on outside click or Escape.
   */
  async function initPublications() {
    const list = $('[data-pub-list]');
    const count = $('[data-pub-count]');
    if (!list) return;

    let data;
    try {
      data = await loadJSON("src/data/publications.json?v=1");
    } catch (err) {
      console.error("Failed to load publications:", err);
      list.innerHTML =
        '<li class="pub-list__empty">Publications couldn\'t load. ' +
        "If you opened this file directly, run a local server.</li>";
      return;
    }

    // arXiv IDs (YYMM.NNNNN) break ties within a year by recency, so "Recent"
    // stays correct regardless of the JSON's ordering.
    const arxivKey = (p) => {
      const m = String(p.arxiv || "").match(/(\d{4}\.\d{4,5})/);
      return m ? m[1] : "";
    };
    data.sort((a, b) => b.year - a.year || arxivKey(b).localeCompare(arxivKey(a)));

    const filters = $$(".pub-filter");
    const yearToggle = $(".pub-year__toggle");
    const yearMenu = $(".pub-year__menu");
    const yearLabel = $(".pub-year__label");

    const years = Array.from(new Set(data.map((p) => p.year))).sort((a, b) => b - a);
    yearMenu.innerHTML = "";
    years.forEach((y) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pub-year__option";
      btn.textContent = String(y);
      btn.dataset.year = String(y);
      li.appendChild(btn);
      yearMenu.appendChild(li);
    });

    const readUrl = () => {
      const pub = new URLSearchParams(location.search).get("pub");
      if (pub === "all") return { mode: "all", year: null };
      if (pub && /^\d{4}$/.test(pub) && years.includes(Number(pub))) {
        return { mode: "year", year: Number(pub) };
      }
      return { mode: "recent", year: null };
    };

    const writeUrl = () => {
      const q =
        state.mode === "all"
          ? "?pub=all"
          : state.mode === "year"
          ? "?pub=" + state.year
          : "";
      history.replaceState(null, "", location.pathname + q + "#publications");
    };

    let state = readUrl();

    const applyFilter = () => {
      let items = data;
      if (state.mode === "recent") items = data.slice(0, 3);
      else if (state.mode === "year" && state.year != null) {
        items = data.filter((p) => p.year === state.year);
      }
      renderPublications(items, list, count);

      filters.forEach((b) => {
        const active = b.dataset.filter === state.mode;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      yearLabel.textContent = state.mode === "year" ? String(state.year) : "Year";
    };

    filters.forEach((b) => {
      b.addEventListener("click", () => {
        state = { mode: b.dataset.filter, year: null };
        writeUrl();
        applyFilter();
      });
    });

    const closeYearMenu = (restoreFocus) => {
      yearMenu.hidden = true;
      yearToggle.setAttribute("aria-expanded", "false");
      if (restoreFocus) yearToggle.focus();
    };
    const openYearMenu = () => {
      yearMenu.hidden = false;
      yearToggle.setAttribute("aria-expanded", "true");
      const first = $(".pub-year__option", yearMenu);
      if (first) first.focus();
    };

    yearToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      yearMenu.hidden ? openYearMenu() : closeYearMenu(false);
    });
    yearMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-year]");
      if (!btn) return;
      state = { mode: "year", year: Number(btn.dataset.year) };
      writeUrl();
      closeYearMenu(true);
      applyFilter();
    });
    document.addEventListener("click", (e) => {
      if (!yearMenu.hidden && !e.target.closest(".pub-year")) closeYearMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !yearMenu.hidden) closeYearMenu(true);
    });

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
   * Load src/data/projects.json and render a horizontally-scrolling card gallery
   * (sorted by year descending). Each card's link is a stretched/"covering" link
   * given a concise aria-label so screen readers don't announce the whole card.
   * After render, attaches the gallery controls and drag-scroll helpers.
   */
  async function initProjects() {
    const grid = $('[data-project-grid]');
    if (!grid) return;

    let data;
    try {
      data = await loadJSON("src/data/projects.json?v=1");
    } catch (err) {
      console.error("Failed to load projects:", err);
      grid.innerHTML =
        '<li class="empty-state">Projects couldn\'t load.</li>';
      return;
    }

    grid.innerHTML = "";
    data.sort((a, b) => (b.year || 0) - (a.year || 0));
    const frag = document.createDocumentFragment();
    data.forEach((p) => {
      const li = document.createElement("li");
      li.className = "project-card";

      const head = document.createElement("div");
      head.className = "project-card__head";
      const name = document.createElement("span");
      name.className = "project-card__name";
      name.textContent = p.name;
      const year = document.createElement("span");
      year.className = "project-card__year";
      year.textContent = p.year ? String(p.year) : "";
      head.append(name, year);

      const desc = document.createElement("p");
      desc.className = "project-card__desc";
      desc.textContent = p.description;

      const tags = document.createElement("div");
      tags.className = "project-card__tags";
      (p.tags || []).forEach((t) => {
        const span = document.createElement("span");
        span.className = "project-card__tag";
        span.textContent = t;
        tags.appendChild(span);
      });

      const link = document.createElement("a");
      link.className = "project-card__link";
      link.href = safeUrl(p.url, "https://");
      link.rel = "noopener";
      link.textContent = "View on GitHub";
      // The stretched link covers the whole card, so give it a concise name
      // instead of letting screen readers announce all the card text.
      link.setAttribute("aria-label", p.name + " — View on GitHub");

      li.append(head, desc, tags, link);
      frag.appendChild(li);
    });
    grid.appendChild(frag);

    setupGalleryControls(grid);
    enableDragScroll(grid);
  }

  /**
   * Attach prev/next gallery buttons ([data-gallery-prev] / [data-gallery-next]).
   * Each click scrolls the track by one card width (card width + column gap).
   * Buttons disable at the ends; the whole [data-gallery-nav] control hides when
   * there's no overflow. Honors reduced-motion (auto vs smooth scroll).
   * @param {HTMLElement} track - The scrollable gallery container.
   */
  function setupGalleryControls(track) {
    const prev = $("[data-gallery-prev]");
    const next = $("[data-gallery-next]");
    const nav = $("[data-gallery-nav]");
    if (!prev || !next) return;

    const stepSize = () => {
      const card = track.querySelector(".project-card");
      if (!card) return track.clientWidth;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card.offsetWidth + gap;
    };

    const update = () => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = track.scrollLeft >= maxScroll - 1;
      if (nav) nav.hidden = maxScroll <= 1;
    };

    const step = (dir) => {
      track.scrollBy({
        left: dir * stepSize(),
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    };

    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /**
   * Click-and-drag scrolling for mouse pointers only; touch keeps native momentum.
   * Disables scroll-snap mid-drag and re-enables it on release to settle on the
   * nearest card. A drag of more than 6px swallows the trailing click (capture
   * phase) so dragging never opens a card's link.
   * @param {HTMLElement} track - The scrollable gallery container.
   */
  function enableDragScroll(track) {
    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;

    track.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      down = true;
      moved = false;
      startX = e.clientX;
      startLeft = track.scrollLeft;
      // Disable snap mid-drag so scrolling tracks the cursor smoothly.
      track.style.scrollSnapType = "none";
      track.classList.add("is-grabbing");
    });

    track.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 6) moved = true;
      track.scrollLeft = startLeft - dx;
    });

    const end = () => {
      if (!down) return;
      down = false;
      // Re-engaging mandatory snap settles the track to the nearest card.
      track.style.scrollSnapType = "";
      track.classList.remove("is-grabbing");
    };
    track.addEventListener("pointerup", end);
    track.addEventListener("pointerleave", end);

    // A drag must never open a card's link, so swallow the trailing click.
    track.addEventListener(
      "click",
      (e) => {
        if (moved) {
          e.preventDefault();
          e.stopPropagation();
          moved = false;
        }
      },
      true
    );
  }

  /* ----------------------------------------------------------
   *  Skills
   *
   *  JSON: src/data/skills.json — an OBJECT of { "Group label": ["item", ...] }.
   * ---------------------------------------------------------- */
  /**
   * Load src/data/skills.json and render each non-empty group as a .skill-group of
   * chips. Groups are created with [data-reveal] and registered via observeReveal()
   * so they animate in like static content.
   */
  async function initSkills() {
    const root = $('[data-skills]');
    if (!root) return;

    let data;
    try {
      data = await loadJSON("src/data/skills.json?v=1");
    } catch (err) {
      console.error("Failed to load skills:", err);
      root.innerHTML = '<p class="empty-state">Skills couldn\'t load.</p>';
      return;
    }

    root.innerHTML = "";
    const frag = document.createDocumentFragment();
    Object.entries(data)
      .filter(([, items]) => Array.isArray(items) && items.length)
      .forEach(([label, items]) => {
      const group = document.createElement("div");
      group.className = "skill-group";
      group.setAttribute("data-reveal", "");
      observeReveal(group);
      const h = document.createElement("p");
      h.className = "skill-group__label";
      h.textContent = "· · " + label.toLowerCase();
      const chips = document.createElement("div");
      chips.className = "skill-group__chips";
      items.forEach((t) => {
        const span = document.createElement("span");
        span.className = "skill-chip";
        span.textContent = t;
        chips.appendChild(span);
      });
      group.append(h, chips);
      frag.appendChild(group);
    });
    root.appendChild(frag);
  }

  /* ----------------------------------------------------------
   *  Hero motif — soft animated sine wave on a small canvas
   * ---------------------------------------------------------- */
  /**
   * Draw a soft animated "wave" motif on the .hero__motif <canvas> (concentric arcs
   * plus a faint sine wave), colored from the CSS --accent custom property.
   * - Reduced motion: renders a single static frame instead of animating.
   * - HiDPI: resize() scales the backing store by devicePixelRatio (capped at 2).
   * - Performance: pauses the rAF loop while the tab is hidden (visibilitychange).
   * - Theme reactivity: a MutationObserver on <html> data-theme re-renders the static
   *   frame so the accent color updates on theme change.
   */
  function initHeroMotif() {
    const canvas = $(".hero__motif");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let raf = null;
    let running = !prefersReducedMotion;
    let w = canvas.width;
    let h = canvas.height;
    let dpr = 1;

    const readAccent = () =>
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
      "#00a3ad";
    // getComputedStyle forces a style flush, so cache the accent and refresh it
    // only on theme change (see the MutationObserver below) rather than per frame.
    let accentColor = readAccent();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawFrame = (t) => {
      ctx.clearRect(0, 0, w, h);
      const color = accentColor;
      const cx = w / 2;
      const cy = h / 2;

      // Concentric arcs — a quiet "wave" motif behind the portrait.
      ctx.lineWidth = 1;
      const baseR = Math.min(w, h) * 0.18;
      for (let i = 0; i < 5; i++) {
        const r = baseR + i * 18 + Math.sin(t / 1400 + i) * 4;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.18 - i * 0.025;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // A faint sine wave running through the middle.
      ctx.beginPath();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      const amp = 10;
      const k = (Math.PI * 2) / (w * 0.55);
      const phase = t / 700;
      for (let x = 0; x <= w; x += 2) {
        const y = cy + Math.sin(x * k + phase) * amp;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const loop = (t) => {
      if (!running) return;
      drawFrame(t);
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (raf || !running) return;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    };

    resize();
    if (running) {
      start();
    } else {
      // Render one static frame for reduced-motion users.
      drawFrame(0);
    }

    window.addEventListener("resize", () => {
      resize();
      if (!running) drawFrame(0);
    });
    document.addEventListener("visibilitychange", () => {
      document.hidden ? stop() : start();
    });

    // Refresh the cached accent and re-render on theme change.
    const mo = new MutationObserver(() => {
      accentColor = readAccent();
      if (!running) drawFrame(0);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  /* ----------------------------------------------------------
   *  Footer — last-updated date
   * ---------------------------------------------------------- */
  /**
   * Fill [data-updated] with the document's last-modified month/year so the
   * footer reflects the latest deploy instead of a hand-edited string. No-ops if
   * the element is missing or the date is unparseable, leaving the static
   * fallback text in the HTML.
   */
  function initFooterDate() {
    const el = $("[data-updated]");
    if (!el) return;
    const d = new Date(document.lastModified);
    if (isNaN(d.getTime())) return;
    el.textContent =
      "updated " + d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  /* ----------------------------------------------------------
   *  Boot — run each feature once. Order is intentional but loose: the sync
   *  features run first, then the three async (JSON-fetching) ones kick off.
   *  Most init* functions no-op when their root markup is missing.
   * ---------------------------------------------------------- */
  initThemeToggle();
  initNavToggle();
  initContact();
  initHeroMotif();
  initScrollReveal();
  initActiveSection();
  initFooterDate();
  initPublications();
  initProjects();
  initSkills();
})();
