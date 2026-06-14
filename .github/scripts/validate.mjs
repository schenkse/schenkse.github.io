#!/usr/bin/env node
// CI validator for the static portfolio site. Pure Node built-ins — no deps,
// nothing shipped to the page (.github/ is excluded from GitHub Pages).
// Run by .github/workflows/ci.yml.
//
// Checks:
//   1. Every JSON file in src/data/ parses.
//   2. Data files match the shape src/js/main.js depends on.
//   3. Every in-page anchor (href="#id") in the HTML resolves to an id.
//   4. Every local asset referenced by index.html / 404.html exists on disk.
//
// Prints "✓ All checks passed" and exits 0, or lists each problem and exits 1.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const errors = [];
const fail = (msg) => errors.push(msg);

const readText = (rel) => readFileSync(join(root, rel), "utf8");
const readJSON = (rel) => {
  try {
    return JSON.parse(readText(rel));
  } catch (e) {
    fail(`${rel}: invalid JSON — ${e.message}`);
    return null;
  }
};

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 1 + 2: data file shapes --------------------------------------------------
const pubs = readJSON("src/data/publications.json");
if (pubs !== null) {
  if (!Array.isArray(pubs)) fail("publications.json: expected an array");
  else
    pubs.forEach((p, i) => {
      if (!isNum(p.year))
        fail(`publications[${i}] (${p.title ?? "?"}): "year" must be a number`);
      if (!isStr(p.title))
        fail(`publications[${i}]: "title" must be a non-empty string`);
    });
}

const projects = readJSON("src/data/projects.json");
if (projects !== null) {
  if (!Array.isArray(projects)) fail("projects.json: expected an array");
  else
    projects.forEach((p, i) => {
      if (!isStr(p.name))
        fail(`projects[${i}]: "name" must be a non-empty string`);
      if (!isStr(p.url))
        fail(`projects[${i}] (${p.name ?? "?"}): "url" must be a non-empty string`);
      if (!isNum(p.year))
        fail(`projects[${i}] (${p.name ?? "?"}): "year" must be a number`);
      if (
        p.tags !== undefined &&
        (!Array.isArray(p.tags) || p.tags.some((t) => !isStr(t)))
      )
        fail(`projects[${i}] (${p.name ?? "?"}): "tags" must be an array of strings`);
    });
}

const skills = readJSON("src/data/skills.json");
if (skills !== null) {
  if (typeof skills !== "object" || Array.isArray(skills) || skills === null)
    fail("skills.json: expected an object of { label: string[] }");
  else
    Object.entries(skills).forEach(([label, items]) => {
      if (!Array.isArray(items) || items.some((t) => !isStr(t)))
        fail(`skills.json: group "${label}" must be an array of strings`);
    });
}

// 3 + 4: HTML anchors + local assets --------------------------------------
const checkHtml = (rel) => {
  let html;
  try {
    html = readText(rel);
  } catch {
    fail(`${rel}: file missing`);
    return;
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(m[1])) fail(`${rel}: in-page link "#${m[1]}" has no matching id`);
  }
  for (const m of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
    const ref = m[1];
    if (
      /^(?:https?:)?\/\//.test(ref) ||
      ref.startsWith("mailto:") ||
      ref.startsWith("data:")
    )
      continue;
    const path = ref.replace(/^\//, "").split(/[?#]/)[0];
    if (path && !existsSync(join(root, path)))
      fail(`${rel}: referenced asset "${ref}" does not exist`);
  }
};

checkHtml("index.html");
checkHtml("404.html");

// Report -------------------------------------------------------------------
if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("✓ All checks passed");
