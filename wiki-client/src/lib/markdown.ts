/**
 * Zero-dependency markdown to HTML renderer.
 * Handles: headers, bold, italic, code blocks, inline code, links, images,
 * ordered/unordered lists, blockquotes, horizontal rules, tables.
 */

/** Escape HTML entities to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert inline markdown (bold, italic, code, links, images) to HTML. */
function renderInline(text: string): string {
  let result = escapeHtml(text);

  // Inline code (must come before bold/italic to protect backtick contents)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Images: ![alt](src)
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" />'
  );

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ (but not inside words for underscores)
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');

  return result;
}

/** Parse a table block (lines starting with |). Returns HTML string. */
function renderTable(tableLines: string[]): string {
  if (tableLines.length < 2) return tableLines.map((l) => `<p>${renderInline(l)}</p>`).join('\n');

  const parseRow = (line: string): string[] =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const headerLine = tableLines[0] ?? '';
  const separatorLine = tableLines[1] ?? '';
  const separatorCells = parseRow(separatorLine);
  const isSeparator = separatorCells.every((c) => /^:?-+:?$/.test(c));
  if (!isSeparator) return tableLines.map((l) => `<p>${renderInline(l)}</p>`).join('\n');

  const alignments = separatorCells.map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });

  const headerCells = parseRow(headerLine);
  let html = '<table>\n<thead>\n<tr>';
  for (let i = 0; i < headerCells.length; i++) {
    const align = alignments[i] ?? 'left';
    const cell = headerCells[i] ?? '';
    html += `<th style="text-align:${align}">${renderInline(cell)}</th>`;
  }
  html += '</tr>\n</thead>\n<tbody>\n';

  for (let r = 2; r < tableLines.length; r++) {
    const rowLine = tableLines[r] ?? '';
    const cells = parseRow(rowLine);
    html += '<tr>';
    for (let ci = 0; ci < headerCells.length; ci++) {
      const align = alignments[ci] ?? 'left';
      const cellContent = cells[ci] ?? '';
      html += `<td style="text-align:${align}">${renderInline(cellContent)}</td>`;
    }
    html += '</tr>\n';
  }

  html += '</tbody>\n</table>';
  return html;
}

/**
 * Render a markdown string to HTML.
 * Supports: # headers, **bold**, *italic*, `code`, ```code blocks```,
 * [links](url), ![images](url), - unordered lists, 1. ordered lists,
 * > blockquotes, ---, tables.
 */
export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const output: string[] = [];
  let i = 0;

  const currentLine = (): string => lines[i] ?? '';

  while (i < lines.length) {
    const line = currentLine();

    // Fenced code blocks: ``` or ~~~
    if (/^(`{3,}|~{3,})/.test(line)) {
      const fence = line.match(/^(`{3,}|~{3,})/)?.[0] ?? '```';
      const lang = line.slice(fence.length).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !currentLine().startsWith(fence)) {
        codeLines.push(currentLine());
        i++;
      }
      i++; // skip closing fence
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      output.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (/^(\s{0,3})([-*_])(\s*\2){2,}\s*$/.test(line)) {
      output.push('<hr />');
      i++;
      continue;
    }

    // Headers: # through ######
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const hashes = headerMatch[1] ?? '#';
      const text = headerMatch[2] ?? '';
      const level = hashes.length;
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      output.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
      i++;
      continue;
    }

    // Blockquotes: > text (can be multi-line)
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(currentLine())) {
        quoteLines.push(currentLine().replace(/^>\s?/, ''));
        i++;
      }
      output.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Table: lines starting with |
    if (/^\|.+\|/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\|.+\|/.test(currentLine())) {
        tableLines.push(currentLine());
        i++;
      }
      output.push(renderTable(tableLines));
      continue;
    }

    // Unordered list: - item, * item, + item
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(currentLine())) {
        items.push(currentLine().replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      output.push('<ul>');
      for (const item of items) {
        output.push(`<li>${renderInline(item)}</li>`);
      }
      output.push('</ul>');
      continue;
    }

    // Ordered list: 1. item
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(currentLine())) {
        items.push(currentLine().replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      output.push('<ol>');
      for (const item of items) {
        output.push(`<li>${renderInline(item)}</li>`);
      }
      output.push('</ol>');
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (i < lines.length) {
      const pl = currentLine();
      if (
        pl.trim() === '' ||
        /^(#{1,6}\s|>\s?|`{3,}|~{3,}|\|.+\|)/.test(pl) ||
        /^\s*[-*+]\s+/.test(pl) ||
        /^\s*\d+\.\s+/.test(pl) ||
        /^(\s{0,3})([-*_])(\s*\2){2,}\s*$/.test(pl)
      ) {
        break;
      }
      paraLines.push(pl);
      i++;
    }
    if (paraLines.length > 0) {
      output.push(`<p>${renderInline(paraLines.join('\n'))}</p>`);
    }
  }

  return output.join('\n');
}
