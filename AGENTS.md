# Personal webpage portfolio

Personal academic/portfolio site for Sebastian Schenk (theoretical physicist), deployed as a GitHub Pages static site at schenkse.github.io.

## Tech stack
* Pure HTML/CSS/JS
* No frameworks, no dependencies
* One build step: `.github/scripts/build.mjs` (Node built-ins only) renders the
  JSON lists into `index.html` and writes the site to `_site/`. The Pages
  workflow runs it on every push to `main`; `_site/` is not committed.

## Project structure
```
src/css/        # all styles, CSS custom properties for theming
src/js/         # all client-side JavaScript
src/data/       # all data, such as publication lists as json files (rendered at build time, not deployed)
```

## Design
Focus on simplicity and tasteful minimalism.
One column, system fonts, two colours and a link blue.
No navigation bar, no cards, no shadows, no web fonts.
The page fetches nothing but its own HTML, CSS and JS.
The single ornament is the interference plate across the top.

## Site content/sections
In page order.

* **Intro** — name, what I work on, availability, and the contact links
  (obfuscated email + Matrix handle, GitHub, INSPIRE-HEP, ORCID). There is no
  separate contact section; the links live here.
* **About** — short bio + career timeline
* **Publications** — the three most recent, with the rest behind a
  "Show all" disclosure
* **Code** — list of software projects published on GitHub
* **Interests** — anything that may be useful in the tech world

## Key JS behaviors (main.js)
* **Theme** — CSS follows the OS preference. The footer switch stores a
  light/dark override only while it differs from the OS, so toggling back
  returns to System. `theme.js` applies a stored override before paint to
  avoid a flash. The switch stays hidden until `main.js` has wired it, and
  cross-fades the two palettes over a short view transition.
* **Interference plate** — two coherent sources drawn on a lattice in the page's
  own two inks. Follows the pointer, eases to a stop, and renders nothing
  further while idle; responds to live `prefers-reduced-motion` changes.
* **Contact obfuscation** — email and Matrix addresses assembled at runtime to
  avoid crawler scraping
* **Publications** — the full list is a native `<details>` rendered at build
  time and works without JS; `?pub=all` opens it on load.

## Code conventions
* Use industry-standard, best practices for naming functions.
* Update the footer date in `index.html` manually when site content changes,
  keeping the visible month/year and the `<time datetime>` value in sync.
* Keep publications, projects, and interests in `src/data/*.json`. Run
  `node .github/scripts/validate.mjs` and `node .github/scripts/build.mjs`
  after editing data or HTML. Preview from `_site/`
  (`python3 -m http.server -d _site`); the source `index.html` only holds
  `<!-- build:… -->` markers where the lists go.
* Data links must be full HTTPS URLs, checked by CI. Escape all data text with
  `escape()` in `build.mjs`, and keep publication authors as a string and the
  venue in `journal`.
* The `main` branch is protected. Always work in feature branches.
