# scorpious187-updates

Update-notification content for the Scorpious187 Foundry VTT module family.
[scorpious187s-lib](https://github.com/nscarpinatodev/scorpious187s-lib) fetches
`{moduleId}-update.json` from this repo's `main` branch at world load (GM only)
and shows a board when `latestVersion` is newer than the installed version.

## The content is generated, not hand-written

`latestVersion`, `notes` and `notesUrl` are synced from what each module repo
publishes on GitHub. For every manifest here, [`scripts/sync.mjs`](scripts/sync.mjs):

1. finds the newest **published release** of `nscarpinatodev/{moduleId}`,
2. takes `latestVersion` from its tag (`v1.2.0`, `1.2.0` and `release-14.0.0`
   all normalise to bare semver),
3. takes `notes` from that version's **`CHANGELOG.md` section** when the repo
   keeps one, otherwise from the **release body**, converted to the small HTML
   subset the board renders,
4. points `notesUrl` at the release.

So the release notes *are* the changelog. To change what a card says, edit the
release on GitHub (or the module's `CHANGELOG.md`) and re-run the sync — don't
edit `notes` here, the next sync overwrites it.

[`.github/workflows/sync.yml`](.github/workflows/sync.yml) runs hourly and on
demand (**Actions → Sync update manifests → Run workflow**, optionally for a
single module id) and commits anything that changed. Locally:

```sh
node scripts/sync.mjs             # rewrite manifests that are behind GitHub
node scripts/sync.mjs --check     # report drift, write nothing, exit 1
node scripts/sync.mjs --only scorpious187s-pip-boy
```

Set `GITHUB_TOKEN` (e.g. `export GITHUB_TOKEN=$(gh auth token)`) to lift the
unauthenticated API rate limit.

A module with **no published release** is skipped and its manifest left as-is,
so a seeded placeholder survives until the first real release.

## What you still edit by hand

Sync preserves these — they are editorial decisions, not release data:

- **`critical`** — set `true` only for must-update releases (highlighted
  border, sorted first).
- **`announcement`** (no release needed) — set `announcement.show` to `true`,
  give it a **new unique `id`** (e.g. `"2026-07-sale"`), a `title`, and HTML
  `content`. Users see it once; dismissing stores the id.
- **`forceResetId`** — users who clicked "Skip This Version" stay skipped until
  the next version, unless you change this to any new token, which clears their
  skip locally.

## A module only gets notified if all three are true

This is the part that silently fails. For `{moduleId}-update.json` to ever
reach a user, the module must:

1. **Load the library** — `relationships.requires` includes `scorpious187s-lib`.
   Nothing runs the notifier otherwise.
2. **Pass discovery** — one of its `authors[]` entries has a `name`, `url`,
   `discord` or `email` matching `/scorpious187|nscarpinatodev/i`, or its id is
   in `EXPLICIT_MODULE_IDS` in the library's `constants.js`. An author of just
   `"Nick"` does not match.
3. **Have a manifest here** named exactly `{moduleId}-update.json`, matching the
   `id` in the module's `module.json` — not its repo or folder name.

All failures are silent by design (a dead feed must never break world load), so
a module that misses any of these looks identical to one with no update.

## Schema

```json
{
  "latestVersion": "1.2.0",
  "notes": "<p><strong>New:</strong> the thing.</p><ul><li>Fix A</li></ul>",
  "notesUrl": "https://github.com/nscarpinatodev/<module>/releases/tag/v1.2.0",
  "critical": false,
  "forceResetId": "",
  "announcement": { "show": false, "id": "", "title": "", "content": "" }
}
```

`latestVersion` is bare semver — no leading `v`.

## Adding a new module

Create `{moduleId}-update.json` with the schema above (any placeholder version),
then run `node scripts/sync.mjs --only {moduleId}` to fill it from the module's
latest release. Check the three conditions above on the module side.

## Validation

Every `*-update.json` is checked on push and PR by
[`.github/workflows/validate.yml`](.github/workflows/validate.yml): valid JSON,
the expected keys/types, bare-semver `latestVersion`, and non-empty
`announcement` fields when `announcement.show` is `true`.

```sh
node scripts/validate.mjs
```
