#!/usr/bin/env node
// Validates every *-update.json manifest in the repo root:
//   - parses as JSON
//   - has exactly the expected shape and types
//   - latestVersion is bare semver (no leading "v")
//   - if announcement.show is true, id/title/content are non-empty
// Exits non-zero (listing every problem) if anything fails. No dependencies.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { SEMVER } from "./lib/semver.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const errors = [];
const files = readdirSync(root).filter((f) => f.endsWith("-update.json"));

if (files.length === 0) {
  console.error("No *-update.json files found — nothing to validate.");
  process.exit(1);
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

for (const file of files.sort()) {
  const fail = (msg) => errors.push(`${file}: ${msg}`);
  let data;
  try {
    data = JSON.parse(readFileSync(join(root, file), "utf8"));
  } catch (e) {
    fail(`invalid JSON — ${e.message}`);
    continue;
  }

  if (!isPlainObject(data)) {
    fail("top level must be an object");
    continue;
  }

  const allowed = new Set([
    "latestVersion",
    "notes",
    "notesUrl",
    "critical",
    "forceResetId",
    "announcement",
  ]);
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) fail(`unexpected key "${key}"`);
  }

  if (typeof data.latestVersion !== "string" || !SEMVER.test(data.latestVersion)) {
    fail(`latestVersion must be bare semver like "1.2.0" (got ${JSON.stringify(data.latestVersion)})`);
  }
  if (typeof data.notes !== "string") fail("notes must be a string");
  if (typeof data.notesUrl !== "string" || !/^https?:\/\//.test(data.notesUrl)) {
    fail(`notesUrl must be an http(s) URL (got ${JSON.stringify(data.notesUrl)})`);
  }
  if (typeof data.critical !== "boolean") fail("critical must be a boolean");
  if (typeof data.forceResetId !== "string") fail("forceResetId must be a string");

  const a = data.announcement;
  if (!isPlainObject(a)) {
    fail("announcement must be an object");
  } else {
    for (const key of Object.keys(a)) {
      if (!["show", "id", "title", "content"].includes(key)) {
        fail(`unexpected announcement key "${key}"`);
      }
    }
    if (typeof a.show !== "boolean") fail("announcement.show must be a boolean");
    for (const k of ["id", "title", "content"]) {
      if (typeof a[k] !== "string") fail(`announcement.${k} must be a string`);
    }
    if (a.show === true) {
      for (const k of ["id", "title", "content"]) {
        if (typeof a[k] === "string" && a[k].trim() === "") {
          fail(`announcement.${k} must be non-empty when announcement.show is true`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`✗ Validation failed (${errors.length} problem(s)):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✓ ${files.length} manifest(s) valid.`);
