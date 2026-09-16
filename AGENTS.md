# Personal webpage portfolio

Personal academic/portfolio site for Sebastian Schenk (theoretical physicist), deployed as a GitHub Pages static site at schenkse.github.io.

## Tech stack
* Pure HTML/CSS/JS
* No build tools, no frameworks, no dependencies

## Project structure
```
src/css/        # all styles, CSS custom properties for theming
src/js/         # all client-side JavaScript
src/data/       # all data, such as publication lists as json files
```

## Design
Focus on simplicity and tasteful minimalism.
One column, system fonts, two colours and a link blue.
No navigation bar, no cards, no shadows, no web fonts.
The page fetches nothing but its own HTML, CSS, JS and three JSON files.
The single ornament is the interference plate across the top.

## Site content/sections
In page order.

* **Intro** — name, what I work on, availability, and the contact links
  (obfuscated email + Matrix handle, GitHub, INSPIRE-HEP, ORCID). There is no
  separate contact section; the links live here.
* **About** — short bio + career timeline
* **Publications** — the three most recent, with a link below to show all
* **Code** — list of software projects published on GitHub
* **Interests** — anything that may be useful in the tech world

## Key JS behaviors (main.js)
* **Theme** — dark/light toggle in the footer; reads OS preference; applied
  before render by `theme.js` to avoid a flash. The switch cross-fades the two
  palettes over a short view transition.
* **Interference plate** — two coherent sources drawn on a lattice in the page's
  own two inks. Follows the pointer, eases to a stop, and renders nothing
  further while idle; a still frame under `prefers-reduced-motion`.
* **Contact obfuscation** — email and Matrix addresses assembled at runtime to
  avoid crawler scraping
* **Publication filter** — recent = first 3 items, or all, swapped by the one
  link below the list. The view is mirrored in the URL (`?pub=all`) and read
  back on load.
* **Footer date** — read from `document.lastModified`, so it tracks the deploy
  rather than being bumped by hand. No build step is needed and no request is
  made. `404.html` has no date slot, so it renders nothing.

## Code conventions
* Use industry-standard, best practices for naming functions.
* The `main` branch is protected. Always work in feature branches.
