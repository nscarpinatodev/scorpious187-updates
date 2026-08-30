/**
 * Minimal Markdown -> HTML for changelog bodies. No dependencies.
 *
 * Deliberately supports only the subset the notifier board renders inside a
 * card: paragraphs, headings (flattened to bold lead-ins), nested unordered
 * lists, bold/italic/code spans and links. Anything else (tables, images,
 * fenced code, raw HTML) is dropped rather than passed through, so a stray
 * block in a release body can never break the board's layout.
 */

/** Release-body boilerplate that is packaging chatter, not changelog content. */
const BOILERPLATE = [
  /^\s*\*\*full changelog\*\*:/i,
  /^\s*(##+\s*)?install(ation)?\b/i,
  /^\s*(to )?(manually )?install\b.*manifest/i,
  /^\s*manifest( url)?:/i,
  /^\s*(paste )?this manifest url/i,
  /^\s*in foundry, use\b/i,
  /^\s*🤖\s*generated with/i,
  /^\s*co-authored-by:/i,
  // Any line handing out a manifest URL is install instructions, wherever it
  // sits in the sentence.
  /https?:\/\/\S*module\.json/i,
];

/** Emphasis markers around a lead-in ("**Installation:**") hide boilerplate. */
const stripEmphasis = (line) => line.replace(/^\s*[*_]{1,3}\s*/, '');

/** Conventional-commit subjects leak in when a release body is a commit message. */
const CONVENTIONAL =
  /^(feat|fix|chore|docs|refactor|perf|test|build|ci|style|revert)(\([^)]*\))?!?:\s+/i;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ESC[c]);

/** Inline spans. Escapes first, so release text can never inject markup. */
function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_, c) => `<em>${c}</em>`);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label) => label);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>');
  // Shell-escaped apostrophes ("Scorpious187''s") survive into release bodies.
  out = out.replace(/''/g, "'");
  return out.replace(/\s+/g, ' ').trim();
}

const isBoilerplate = (line) =>
  BOILERPLATE.some((re) => re.test(line) || re.test(stripEmphasis(line)));

/**
 * @param {string} md
 * @param {object} [opts]
 * @param {number} [opts.maxChars] Soft cap; output is trimmed at a block
 *   boundary once it would exceed this, never mid-sentence.
 * @returns {string} HTML
 */
export function markdownToHtml(md, { maxChars = 1600 } = {}) {
  const src = String(md ?? '').replace(/\r\n?/g, '\n');

  // Pass 1: drop fenced code, boilerplate and horizontal rules.
  const kept = [];
  let inFence = false;
  for (const raw of src.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) continue;
    if (isBoilerplate(raw)) continue;
    kept.push(raw);
  }

  // Pass 2: group into blocks. A list item's indent gives its nesting depth.
  const blocks = [];
  let para = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };

  for (const raw of kept) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { flushPara(); continue; }

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      const text = heading[2].replace(/\s*#+\s*$/, '').trim();
      // A bare "Changelog" title carries no information inside a card.
      if (text && !/^change\s?log$/i.test(text)) blocks.push({ type: 'h', text });
      continue;
    }

    const item = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (item) {
      flushPara();
      const depth = Math.min(Math.floor(item[1].replace(/\t/g, '  ').length / 2), 2);
      blocks.push({ type: 'li', depth, text: item[2].trim() });
      continue;
    }

    // A continuation line indented under a list item belongs to that item.
    const last = blocks[blocks.length - 1];
    if (!para.length && last?.type === 'li' && /^\s{2,}/.test(line)) {
      last.text += ' ' + line.trim();
      continue;
    }
    para.push(line.trim());
  }
  flushPara();

  // A release cut straight from a commit opens with the commit subject.
  const first = blocks[0];
  if (first?.type === 'p' && CONVENTIONAL.test(first.text)) {
    first.text = first.text.replace(CONVENTIONAL, '');
    first.text = first.text.charAt(0).toUpperCase() + first.text.slice(1);
  }

  // Pass 3: render, closing any open list before a non-list block.
  const out = [];
  let openDepth = -1;
  let chars = 0;
  let truncated = false;

  // A nested <ul> must live inside its parent <li>, so opening a deeper level
  // reopens the item just closed, and closing that level closes it again.
  // A list that starts already indented has no parent item to reopen, so
  // whether a level owes a </li> is recorded when that level is opened.
  const owesLi = [];
  const closeTo = (depth) => {
    while (openDepth > depth) {
      out.push(owesLi[openDepth] ? '</ul></li>' : '</ul>');
      owesLi[openDepth] = false;
      openDepth--;
    }
  };

  for (const block of blocks) {
    if (chars > maxChars) { truncated = true; break; }

    if (block.type === 'li') {
      const html = inline(block.text);
      if (!html) continue;
      while (openDepth < block.depth) {
        const parent = openDepth >= 0 && out[out.length - 1]?.endsWith('</li>');
        if (parent) {
          out[out.length - 1] = out[out.length - 1].slice(0, -'</li>'.length);
        }
        out.push('<ul>');
        openDepth++;
        owesLi[openDepth] = parent;
      }
      closeTo(block.depth);
      out.push(`<li>${html}</li>`);
      chars += html.length;
      continue;
    }

    closeTo(-1);
    const html = inline(block.text);
    if (!html) continue;
    out.push(block.type === 'h' ? `<p><strong>${html}</strong></p>` : `<p>${html}</p>`);
    chars += html.length;
  }
  closeTo(-1);

  if (truncated) out.push('<p><em>Full details in the release notes.</em></p>');
  return out.join('');
}

/**
 * Pull one version's section out of a Keep-a-Changelog file.
 * Matches "## [1.3.0] - date", "## 1.3.0" and "## v1.3.0", with any dash.
 *
 * @returns {string|null} The section body, or null when absent.
 */
export function extractChangelogSection(markdown, version) {
  const src = String(markdown ?? '').replace(/\r\n?/g, '\n');
  // Semver uses only alphanumerics, ".", "-" and "+"; wrapping each
  // non-alphanumeric in a character class makes it literal without escapes.
  const esc = version.replace(/[^A-Za-z0-9]/g, (c) => `[${c}]`);
  // String.raw so the regex escapes survive the template literal.
  const heading = new RegExp(
    String.raw`^##\s*\[?v?${esc}\]?\s*(?:[-\u2014\u2013:]\s*.*)?$`, 'im');
  const start = src.search(heading);
  if (start === -1) return null;

  const after = src.slice(start);
  const body = after.slice(after.indexOf('\n') + 1);
  const next = body.search(/^##\s/m);
  const section = (next === -1 ? body : body.slice(0, next)).trim();
  return section || null;
}
