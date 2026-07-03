/**
 * Wikitext -> swimchain wiki markdown converter.
 *
 * Targets exactly the dialect wiki-client renders (wiki-client/src/lib/markdown.ts
 * + wikilinks.ts): #-headings, -/1. lists, [text](url) links, **bold**, *italic*,
 * `code`, fenced code blocks, > blockquotes, --- rules, and [[wikilinks]].
 *
 * Deliberately lossy (readable over perfect):
 *  - {{templates}} and infoboxes are stripped (they cannot render)
 *  - {| wikitables |} are stripped (wikitext table syntax is not markdown)
 *  - <ref> citations, galleries, math markup are stripped
 *  - [[File:]]/[[Image:]]/[[Category:]] links are dropped
 *
 * Internal wiki links become swimchain [[wikilinks]] when the target is part
 * of the same import batch; otherwise they become external markdown links
 * back to the source wiki.
 */

/** Normalize a wiki title for matching (first letter case-insensitive, _ = space). */
export function normalizeTitle(title) {
  const t = title.replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
  if (t.length === 0) return t;
  return (t[0].toUpperCase() + t.slice(1)).toLowerCase();
}

/** Strip nested {{...}} template invocations. */
function stripTemplates(text) {
  let prev;
  do {
    prev = text;
    text = text.replace(/\{\{[^{}]*\}\}/gs, '');
  } while (text !== prev);
  return text;
}

/** Strip {| ... |} wikitables (handles nesting by innermost-first). */
function stripTables(text) {
  let prev;
  do {
    prev = text;
    text = text.replace(/^\{\|(?:(?!^\{\|)[\s\S])*?^\|\}\s*$/m, '');
  } while (text !== prev);
  return text;
}

/**
 * Remove [[Namespace:...]] links (File, Image, Category, ...) including
 * nested [[...]] inside image captions. Balanced-bracket scan.
 */
function stripNamespacedLinks(text) {
  const dropPrefix = /^\s*(file|image|category|media|commons|wikt|wiktionary|template|help|portal|special|[a-z]{2,3}(-[a-z]+)?):/i;
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('[[', i)) {
      // find matching ]] accounting for nesting
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text.startsWith('[[', j)) {
          depth++;
          j += 2;
        } else if (text.startsWith(']]', j)) {
          depth--;
          j += 2;
        } else {
          j++;
        }
      }
      const inner = text.slice(i + 2, j - 2);
      const target = inner.split('|')[0];
      if (dropPrefix.test(target)) {
        // Interlanguage links like [[fr:Page]] and files/categories: drop whole link
        i = j;
        continue;
      }
      out += text.slice(i, j);
      i = j;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** Decode the handful of HTML entities that show up in article prose. */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&thinsp;/g, ' ')
    .replace(/&times;/g, '×')
    .replace(/&minus;/g, '−')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Convert one page of wikitext to swimchain markdown.
 *
 * @param {string} wikitext
 * @param {object} ctx
 * @param {Map<string,string>} ctx.importedTitles - normalizeTitle(title) -> canonical title
 *        for every page in this import batch (targets that become [[wikilinks]])
 * @param {(title: string) => string} ctx.externalUrl - source-wiki URL for a title
 * @returns {string} markdown
 */
export function wikitextToMarkdown(wikitext, ctx) {
  const { importedTitles, externalUrl } = ctx;
  let text = wikitext.replace(/\r\n/g, '\n');
  const protectedBlocks = [];
  const protect = (block) => {
    protectedBlocks.push(block);
    return `@@WIKIPROT${protectedBlocks.length - 1}@@`;
  };

  // 1. HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Code-ish blocks -> protected markdown equivalents (before any other pass)
  text = text.replace(
    /<(syntaxhighlight|source)([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_m, _tag, attrs, code) => {
      const lang = /lang\s*=\s*["']?([\w+-]+)/i.exec(attrs)?.[1] ?? '';
      return protect(`\n\`\`\`${lang}\n${code.replace(/^\n+|\n+$/g, '')}\n\`\`\`\n`);
    },
  );
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, code) =>
    protect(`\n\`\`\`\n${code.replace(/^\n+|\n+$/g, '')}\n\`\`\`\n`),
  );
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, code) =>
    protect(`\`${code.replace(/\n/g, ' ').trim()}\``),
  );
  text = text.replace(/<nowiki\s*\/>/gi, '');
  text = text.replace(/<nowiki[^>]*>([\s\S]*?)<\/nowiki>/gi, (_m, inner) => protect(inner));

  // 3. References, math, galleries, magic words — stripped (lossy by design)
  text = text.replace(/<ref[^>]*\/>/gi, '');
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  text = text.replace(/<references[^>]*\/?>([\s\S]*?<\/references>)?/gi, '');
  text = text.replace(/<math[^>]*>([\s\S]*?)<\/math>/gi, (_m, inner) =>
    protect(`\`${inner.replace(/\s+/g, ' ').trim()}\``),
  );
  text = text.replace(/<(gallery|imagemap|timeline|score|hiero)[^>]*>[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/__[A-Z]+__/g, '');

  // 4. Templates and tables
  text = stripTemplates(text);
  text = stripTables(text);

  // 5. Namespaced links (files, images, categories, interlanguage)
  text = stripNamespacedLinks(text);

  // 6. Internal wiki links
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, rawTarget, rawDisplay) => {
    const targetFull = rawTarget.trim();
    const [pageOnly, section] = targetFull.split('#');
    const pageTitle = pageOnly.replace(/_/g, ' ').trim();
    let display = rawDisplay !== undefined ? rawDisplay.trim() : targetFull.replace(/_/g, ' ');
    if (display === '') {
      // "pipe trick": [[Foo (bar)|]] displays "Foo"
      display = pageTitle.replace(/\s*\(.*\)$/, '').replace(/^.*?:/, '');
    }
    if (pageTitle === '' && section) {
      // same-page section link — plain text
      return display;
    }
    const canonical = importedTitles.get(normalizeTitle(pageTitle));
    if (canonical) {
      // Target is part of this import: swimchain wikilink
      return canonical === display ? `[[${canonical}]]` : `[[${canonical}|${display}]]`;
    }
    // Not imported: external markdown link back to the source wiki
    return `[${display}](${externalUrl(pageTitle)})`;
  });

  // 7. External links: [url text] and [url]
  text = text.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, '[$2]($1)');
  text = text.replace(/\[(https?:\/\/[^\s\]]+)\]/g, '[$1]($1)');

  // 8. Lists FIRST (before headings/bold create their own *,# line starts).
  //    Nested */# become indented -/1. items; ; terms become bold; : indent dropped.
  //    [ \t]* (not \s*) so a bare "*" bullet cannot swallow the newline.
  text = text.replace(/^([*#]+)[ \t]*/gm, (_m, markers) => {
    const indent = '  '.repeat(markers.length - 1);
    return markers[markers.length - 1] === '#' ? `${indent}1. ` : `${indent}- `;
  });
  text = text.replace(/^;[ \t]*(.+)$/gm, '**$1**');
  text = text.replace(/^:+[ \t]*/gm, '');

  // 9. Headings: == Title == (level n) -> markdown #{n}
  text = text.replace(/^(={1,6})[ \t]*(.+?)[ \t]*\1[ \t]*$/gm, (_m, eqs, title) => {
    return `${'#'.repeat(Math.min(eqs.length, 6))} ${title.trim()}`;
  });

  // 10. Bold / italic (5-quote before 3-quote before 2-quote; never across lines)
  text = text.replace(/'''''(.+?)'''''/g, '***$1***');
  text = text.replace(/'''(.+?)'''/g, '**$1**');
  text = text.replace(/''(.+?)''/g, '*$1*');

  // 11. Horizontal rules
  text = text.replace(/^-{4,}\s*$/gm, '---');

  // 12. Leftover HTML: <br> to newline, <blockquote> to >, strip the rest
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => {
    const quoted = inner
      .trim()
      .split('\n')
      .map((l) => `> ${l.trim()}`)
      .join('\n');
    return `\n${quoted}\n`;
  });
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // 13. Entities, then restore protected blocks
  text = decodeEntities(text);
  text = text.replace(/@@WIKIPROT(\d+)@@/g, (_m, idx) => protectedBlocks[Number(idx)]);

  // 14. Cleanup: empty list items (stripped citation templates leave bare
  //     bullets), trailing whitespace, excess blank lines.
  text = text.replace(/^[ \t]*(?:-|1\.)[ \t]*$/gm, '');
  text = text
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Mandatory CC BY-SA attribution footer. NO FOOTER, NO IMPORT.
 *
 * @param {object} p
 * @param {string} p.title - source page title
 * @param {string} p.sourceUrl - canonical source page URL
 * @param {string} p.sitename - source wiki name
 * @param {{text: string, url: string}} p.license - license declared by the source wiki's API
 * @param {string} p.importDate - YYYY-MM-DD (passed via CLI --date)
 */
export function attributionFooter({ title, sourceUrl, sitename, license, importDate }) {
  const licenseText = license.text || 'CC BY-SA';
  const licenseLink = license.url ? `[${licenseText}](${license.url})` : licenseText;
  return [
    '',
    '---',
    '',
    `*Imported from [${title}](${sourceUrl}) on ${sitename}. ` +
      `Content available under ${licenseLink}. Imported ${importDate}.*`,
    '',
  ].join('\n');
}
