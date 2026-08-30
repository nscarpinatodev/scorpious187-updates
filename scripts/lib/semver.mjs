/** Bare semver X.Y.Z with optional -prerelease / +build, no leading "v". */
export const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;

/** The same shape, matched anywhere in a longer string. */
const SEMVER_ANYWHERE =
  /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?/;

export const isSemver = (v) => typeof v === 'string' && SEMVER.test(v);

/**
 * Reduce a release tag to the bare version the manifest carries.
 * Handles the tag styles used across the family: "v1.2.0", "1.2.0",
 * "release-14.0.0" and "module-v1.2.0".
 *
 * @returns {string|null} Bare semver, or null when the tag holds none.
 */
export function versionFromTag(tag) {
  const raw = String(tag ?? '').trim();
  const stripped = raw.replace(/^[A-Za-z][A-Za-z0-9]*[-_]?/, '').replace(/^v/i, '');
  for (const candidate of [stripped, raw.replace(/^v/i, ''), raw]) {
    if (isSemver(candidate)) return candidate;
  }
  const found = raw.match(SEMVER_ANYWHERE);
  return found ? found[0] : null;
}
