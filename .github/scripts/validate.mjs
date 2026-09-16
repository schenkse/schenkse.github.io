#!/usr/bin/env node
// Validate content, local assets, and in-page links using Node built-ins.

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
  }
};

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isHttpsUrl = (v) => {
  if (!isStr(v) || !v.startsWith("https://") || /[\u0000-\u0020\u007f]/.test(v)) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

const pubs = readJSON("src/data/publications.json");
if (pubs !== undefined) {
  if (!Array.isArray(pubs)) fail("publications.json: expected an array");
  else
    pubs.forEach((p, i) => {
      if (!isObject(p)) return fail(`publications[${i}]: expected an object`);
      if (!isNum(p.year))
        fail(`publications[${i}] (${p.title ?? "?"}): "year" must be a number`);
      if (!isStr(p.title))
        fail(`publications[${i}]: "title" must be a non-empty string`);
      if (!isStr(p.authors))
        fail(`publications[${i}]: "authors" must be a non-empty string`);
      if (p.journal != null && !isStr(p.journal))
        fail(`publications[${i}]: "journal" must be a non-empty string or null`);
      for (const key of ["arxiv", "doi"]) {
        if (p[key] != null && !isHttpsUrl(p[key]))
          fail(`publications[${i}]: "${key}" must be a full HTTPS URL or null`);
      }
    });
}

const projects = readJSON("src/data/projects.json");
if (projects !== undefined) {
  if (!Array.isArray(projects)) fail("projects.json: expected an array");
  else
    projects.forEach((p, i) => {
      if (!isObject(p)) return fail(`projects[${i}]: expected an object`);
      if (!isStr(p.name))
        fail(`projects[${i}]: "name" must be a non-empty string`);
      if (!isStr(p.description))
        fail(`projects[${i}]: "description" must be a non-empty string`);
      if (!isHttpsUrl(p.url))
        fail(`projects[${i}] (${p.name ?? "?"}): "url" must be a full HTTPS URL`);
      if (!isNum(p.year))
        fail(`projects[${i}] (${p.name ?? "?"}): "year" must be a number`);
    });
}

const interests = readJSON("src/data/interests.json");
if (interests !== undefined) {
  if (!isObject(interests))
    fail("interests.json: expected an object of { label: string[] }");
  else
    Object.entries(interests).forEach(([label, items]) => {
      if (!isStr(label) || !Array.isArray(items) || items.some((t) => !isStr(t)))
        fail(`interests.json: expected a non-empty group name and an array of strings`);
    });
}

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

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("✓ All checks passed");
