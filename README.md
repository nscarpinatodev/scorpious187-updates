# scorpious187-updates

Update-notification content for the Scorpious187 Foundry VTT module family.
[scorpious187s-lib](https://github.com/nscarpinatodev/scorpious187s-lib) fetches
`{moduleId}-update.json` from this repo's `main` branch at world load (GM only)
and shows a board when `latestVersion` is newer than the installed version.

## Release checklist

When you publish a module release, edit that module's JSON here:

1. Set `latestVersion` to the new version (no leading `v`).
2. Put a short HTML changelog in `notes` (rendered inside the board card).
3. Point `notesUrl` at the GitHub release (button on the card).
4. Set `critical: true` only for must-update releases (highlighted border, sorted first).

## Out-of-band messages

- **Announcement** (no release needed): set `announcement.show` to `true`, give it a
  **new unique `id`** (e.g. `"2026-07-sale"`), a `title`, and HTML `content`. Users
  see it once; dismissing stores the id.
- **Force re-notify**: users who clicked "Skip This Version" are skipped until the
  next version — unless you change `forceResetId` to any new token, which clears
  their skip locally.

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

Modules are auto-discovered by author metadata — adding a new module needs no
code change, just a new `{moduleId}-update.json` file here.
