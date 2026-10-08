#!/usr/bin/env node
// Render the content lists from src/data/*.json into index.html and write the
// deployable site to _site/, using Node built-ins only. Data and design
// sources (src/data, og-image.svg) stay in the repo but aren't deployed.

import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "_site");
const RECENT = 3;

const readText = (rel) => readFileSync(join(root, rel), "utf8");
const readJSON = (rel) => JSON.parse(readText(rel));

const escape = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const link = (href, label) =>
  `<a href="${escape(href)}">${escape(label)}</a>`;

// arXiv IDs (YYMM.NNNNN) break ties within a year by recency, so "recent"
// stays correct regardless of the JSON's ordering.
const arxivKey = (p) => {
  const m = String(p.arxiv || "").match(/(\d{4}\.\d{4,5})/);
  return m ? m[1] : "";
};

const renderPublication = (p) => {
  const meta = [];
  if (p.journal) meta.push(escape(p.journal));
  if (p.arxiv) meta.push(link(p.arxiv, "arXiv"));
  if (p.doi) meta.push(link(p.doi, "DOI"));
  return [
    "<li>",
    `  <span class="gutter">${escape(p.year)}</span>`,
    "  <div>",
    `    <span class="pub__title">${escape(p.title)}</span>`,
    `    <span class="pub__authors">${escape(p.authors)}</span>`,
    `    <span class="pub__meta">${meta.join(" · ")}</span>`,
    "  </div>",
    "</li>",
  ];
};

const indent = (lines, by = "  ") => lines.map((l) => by + l);

const renderPublicationList = (pubs) => [
  '<ol class="pubs" role="list">',
  ...indent(pubs.flatMap(renderPublication)),
  "</ol>",
];

// The most recent papers, then the rest behind a native disclosure.
function renderPublications(pubs) {
  pubs = [...pubs].sort((a, b) => b.year - a.year || arxivKey(b).localeCompare(arxivKey(a)));
  const lines = renderPublicationList(pubs.slice(0, RECENT));
  if (pubs.length <= RECENT) return lines;
  return [
    ...lines,
    '<details class="pub-more" data-pub-more>',
    '  <summary><span class="when-closed">Show all</span><span class="when-open">Show fewer</span></summary>',
    ...indent(renderPublicationList(pubs.slice(RECENT))),
    "</details>",
  ];
}

const renderProjects = (projects) =>
  [...projects]
    .sort((a, b) => b.year - a.year || String(a.name).localeCompare(String(b.name)))
    .flatMap((p) => [
      "<li>",
      `  <span class="gutter">${link(p.url, p.name)}</span>`,
      `  <span>${escape(p.description)}</span>`,
      "</li>",
    ]);

const renderInterests = (interests) =>
  Object.entries(interests)
    .filter(([, items]) => items.length)
    .flatMap(([label, items]) => [
      "<li>",
      `  <span class="gutter">${escape(label)}</span>`,
      `  <span>${escape(items.join(", "))}</span>`,
      "</li>",
    ]);

// Replace a whole-line `<!-- build:name -->` marker, keeping its indentation.
function fill(html, name, lines) {
  const marker = new RegExp(`^([ \\t]*)<!-- build:${name} -->[ \\t]*$`, "m");
  const m = html.match(marker);
  if (!m) throw new Error(`index.html: marker <!-- build:${name} --> not found`);
  return html.replace(marker, () => lines.map((l) => m[1] + l).join("\n"));
}

let html = readText("index.html");
html = fill(html, "publications", renderPublications(readJSON("src/data/publications.json")));
html = fill(html, "projects", renderProjects(readJSON("src/data/projects.json")));
html = fill(html, "interests", renderInterests(readJSON("src/data/interests.json")));

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
writeFileSync(join(out, "index.html"), html);
for (const file of ["404.html", "robots.txt", "sitemap.xml"]) cpSync(join(root, file), join(out, file));
const skip = [join(root, "src", "data"), join(root, "src", "assets", "og-image.svg")];
cpSync(join(root, "src"), join(out, "src"), {
  recursive: true,
  filter: (src) => !skip.includes(src),
});

console.log("✓ Built _site/");
