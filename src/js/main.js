(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function initThemeToggle() {
    const btn = $(".theme-toggle");
    if (!btn) return;
    let chosen = false;

    const sync = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      const themeColor = $('meta[name="theme-color"]');
      if (themeColor) {
        themeColor.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      }
    };
    sync();

    const toggle = () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      chosen = true;
      try {
        localStorage.setItem("theme", next);
      } catch (_) {}
      sync();
    };

    // Cross-fade the two palettes where supported and motion is welcome.
    btn.addEventListener("click", () => {
      if (reducedMotion.matches || !document.startViewTransition) toggle();
      else document.startViewTransition(toggle);
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

  function initInterferencePlate() {
    const band = $("[data-field]");
    const canvas = band && $("canvas", band);
    const ctx = canvas && canvas.getContext("2d");
    if (!ctx) return;

    const STEP = 13;       // lattice spacing, px
    const K = 0.052;       // wavenumber; sets the fringe spacing
    const REACH = 135;     // how far the pointer can drag a source, px

    let w = 1;
    let h = 1;
    let dpr = 0;
    let palette;
    let frame = 0;
    let resizeFrame = 0;
    let lastTime = 0;
    let sources = [0, 0, 0, 0];  // [x1, y1, x2, y2], current
    let targetSources = [0, 0, 0, 0];  // [x1, y1, x2, y2], eased toward

    const home = () => [w * 0.34, h * 0.44, w * 0.68, h * 0.52];

    const readPalette = () => {
      const cs = getComputedStyle(canvas);
      palette = {
        bright: cs.getPropertyValue("--accent").trim(),
        dim: cs.getPropertyValue("--text").trim(),
        bg: cs.getPropertyValue("--bg").trim(),
      };
    };

    const resize = () => {
      const width = Math.max(1, canvas.offsetWidth);
      const height = Math.max(1, canvas.offsetHeight);
      const scale = Math.min(2, window.devicePixelRatio || 1);
      if (w === width && h === height && dpr === scale) return false;
      w = width;
      h = height;
      dpr = scale;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };

    const draw = () => {
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, w, h);
      for (let y = STEP / 2; y < h; y += STEP) {
        for (let x = STEP / 2; x < w; x += STEP) {
          const amplitude =
            Math.cos(K * Math.hypot(x - sources[0], y - sources[1])) +
            Math.cos(K * Math.hypot(x - sources[2], y - sources[3]));
          const intensity = (amplitude * amplitude) / 4;
          if (intensity < 0.02) continue;
          const size = Math.max(1, intensity * (STEP - 4));
          ctx.globalAlpha = 0.05 + intensity * 0.34;
          ctx.fillStyle = amplitude > 0 ? palette.bright : palette.dim;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (time) => {
      // Keep the original 60 Hz easing, independent of the display's refresh rate.
      const elapsed = Math.max(0, Math.min(64, time - lastTime));
      const ease = 1 - Math.pow(0.91, elapsed / (1000 / 60));
      lastTime = time;
      let far = 0;
      for (let i = 0; i < 4; i++) {
        sources[i] += (targetSources[i] - sources[i]) * ease;
        far = Math.max(far, Math.abs(targetSources[i] - sources[i]));
      }
      draw();
      frame = far > 0.4 ? requestAnimationFrame(tick) : 0;
    };

    const kick = () => {
      if (frame || reducedMotion.matches) return;
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      sources = home();
      targetSources = home();
      draw();
    };

    readPalette();
    resize();
    reset();
    window.addEventListener("resize", () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        if (resize()) reset();
      });
    });
    reducedMotion.addEventListener("change", reset);
    // At rest there is no next frame to pick up new token values, so a theme
    // change has to repaint the plate explicitly.
    new MutationObserver(() => {
      readPalette();
      draw();
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    band.addEventListener("pointermove", (e) => {
      if (reducedMotion.matches) return;
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      const at = home();
      targetSources = [
        at[0] + nx * REACH,
        at[1] + ny * (REACH * 0.63),
        at[2] - nx * REACH,
        at[3] - ny * (REACH * 0.63),
      ];
      kick();
    });
    band.addEventListener("pointerleave", () => {
      targetSources = home();
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

    document.querySelectorAll("[data-email]").forEach((el) => {
      el.setAttribute("href", "mailto:" + email);
      el.setAttribute("rel", "me");
    });

    document.querySelectorAll("[data-matrix]").forEach((el) => {
      el.setAttribute("href", "https://matrix.to/#/" + encodeURIComponent(matrixHandle));
      el.setAttribute("rel", "me");
    });
  }

  // The publication list is rendered at build time; `?pub=all` opens the full list.
  function initPublications() {
    const more = $("[data-pub-more]");
    if (more && new URLSearchParams(location.search).get("pub") === "all") more.open = true;
  }

  initThemeToggle();
  initInterferencePlate();
  initContact();
  initPublications();
})();
