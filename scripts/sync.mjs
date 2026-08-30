#!/usr/bin/env node
/**
 * Regenerates every *-update.json from what each module repo publishes on
 * GitHub, so the feed is never hand-maintained and never drifts behind a
 * release.
 *
 * For each {moduleId}-update.json in the repo root:
 *   - finds the newest published release of nscarpinatodev/{moduleId}
 *   - takes latestVersion from its tag (v1.2.0, 1.2.0, release-14.0.0, ...)
 *   - takes notes from that version's CHANGELOG.md section when the repo keeps
 *     one, else from the release body, converted to the board's HTML subset
 *   - points notesUrl at the release
 *
 * Author-controlled fields (critical, forceResetId, announcement) are carried
 * over untouched: they are editorial decisions, not release data.
 *
 * Usage:
 *   node scripts/sync.mjs                 rewrite manifests that changed
 *   node scripts/sync.mjs --check         report drift, write nothing, exit 1
 *   node scripts/sync.mjs --only <id>     limit to one module
 *
 * Set GITHUB_TOKEN to lift the unauthenticated rate limit. No dependencies.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { markdownToHtml, extractChangelogSection } from './lib/markdown.mjs';
import { versionFromTag } from './lib/semver.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = 'nscarpinatodev';
const API = 'https://api.github.com';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const ONLY = (() => {
  const i = argv.indexOf('--only');
  return i !== -1 ? argv[i + 1] : null;
})();

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'scorpious187-updates-sync',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

/** @returns {Promise<any|null>} Parsed body, or null for 404 / rate-limit. */
async function api(path) {
  const res = await fetch(`${API}${path}`, { headers });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-remaining') === '0';
    throw new Error(reset
      ? 'GitHub rate limit reached — set GITHUB_TOKEN and retry.'
      : `GitHub refused ${path} (${res.status}).`);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.json();
}

/** Newest published, non-draft release. Prereleases count; /latest skips them. */
async function newestRelease(moduleId) {
  const releases = await api(`/repos/${OWNER}/${moduleId}/releases?per_page=100`);
  if (!Array.isArray(releases)) return null;
  const published = releases
    .filter((r) => !r.draft && r.published_at)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  return published[0] ?? null;
}

/** The repo's CHANGELOG.md, or null when it keeps none. */
async function changelog(moduleId) {
  for (const path of ['CHANGELOG.md', 'changelog.md', 'docs/CHANGELOG.md']) {
    const file = await api(`/repos/${OWNER}/${moduleId}/contents/${path}`);
    if (file?.content) return Buffer.from(file.content, 'base64').toString('utf8');
  }
  return null;
}

/**
 * Notes for one release: the CHANGELOG section for that version when the repo
 * keeps one, else the release body.
 */
async function buildNotes(moduleId, version, release) {
  const md = await changelog(moduleId);
  const section = md ? extractChangelogSection(md, version) : null;
  const source = section ?? release.body ?? '';
  return { html: markdownToHtml(source), from: section ? 'CHANGELOG.md' : 'release body' };
}

const moduleIds = readdirSync(root)
  .filter((f) => f.endsWith('-update.json'))
  .map((f) => f.slice(0, -'-update.json'.length))
  .filter((id) => !ONLY || id === ONLY)
  .sort();

if (moduleIds.length === 0) {
  console.error(ONLY ? `No manifest for "${ONLY}".` : 'No *-update.json files found.');
  process.exit(1);
}

const changed = [];
const skipped = [];
let failed = 0;

for (const moduleId of moduleIds) {
  const file = join(root, `${moduleId}-update.json`);
  const current = JSON.parse(readFileSync(file, 'utf8'));

  let release;
  try {
    release = await newestRelease(moduleId);
  } catch (err) {
    console.error(`✗ ${moduleId}: ${err.message}`);
    failed++;
    continue;
  }

  if (!release) { skipped.push(`${moduleId} (no published release)`); continue; }

  const version = versionFromTag(release.tag_name);
  if (!version) {
    skipped.push(`${moduleId} (tag "${release.tag_name}" holds no semver)`);
    continue;
  }

  const { html, from } = await buildNotes(moduleId, version, release);

  const next = {
    latestVersion: version,
    // An empty release body must never blank a hand-written changelog.
    notes: html || current.notes || '',
    notesUrl: release.html_url,
    critical: current.critical === true,
    forceResetId: current.forceResetId ?? '',
    announcement: {
      show: current.announcement?.show === true,
      id: current.announcement?.id ?? '',
      title: current.announcement?.title ?? '',
      content: current.announcement?.content ?? '',
    },
  };

  const before = JSON.stringify(current);
  const after = JSON.stringify(next);
  if (before === after) continue;

  const bump = current.latestVersion !== version
    ? `${current.latestVersion} → ${version}`
    : `${version} (notes from ${from})`;
  changed.push(`${moduleId}: ${bump}`);
  if (!CHECK) writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

for (const s of skipped) console.log(`· skipped ${s}`);
for (const c of changed) console.log(`${CHECK ? '≠' : '✓'} ${c}`);

if (failed > 0) {
  console.error(`\n✗ ${failed} module(s) could not be read from GitHub.`);
  process.exit(1);
}

if (CHECK && changed.length > 0) {
  console.error(`\n✗ ${changed.length} manifest(s) are behind GitHub. Run: node scripts/sync.mjs`);
  process.exit(1);
}

console.log(`\n${changed.length === 0 ? 'Already in sync' : `${changed.length} manifest(s) updated`} (${moduleIds.length} checked).`);
