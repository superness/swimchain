/**
 * Zero-dependency line-based diff using LCS (longest common subsequence).
 * Produces a list of DiffLine entries with added/removed/unchanged status
 * and original line numbers.
 */

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Compute the longest common subsequence table for two string arrays.
 * Returns a 2D array where lcs[i][j] = length of LCS of oldLines[0..i-1] and newLines[0..j-1].
 */
function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const table: number[][] = [];

  for (let i = 0; i <= m; i++) {
    table[i] = new Array<number>(n + 1).fill(0);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const row = table[i];
      const prevRow = table[i - 1];
      if (!row || !prevRow) continue;
      if (oldLines[i - 1] === newLines[j - 1]) {
        row[j] = (prevRow[j - 1] ?? 0) + 1;
      } else {
        row[j] = Math.max(prevRow[j] ?? 0, row[j - 1] ?? 0);
      }
    }
  }

  return table;
}

/**
 * Backtrack through the LCS table to produce a diff.
 */
function backtrack(
  lcs: number[][],
  oldLines: string[],
  newLines: string[],
  startI: number,
  startJ: number
): DiffLine[] {
  const result: DiffLine[] = [];
  let i = startI;
  let j = startJ;

  // Iterative backtracking to avoid stack overflow on large files
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({
        type: 'unchanged',
        text: oldLines[i - 1] ?? '',
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || (lcs[i]?.[j - 1] ?? 0) >= (lcs[i - 1]?.[j] ?? 0))) {
      result.push({
        type: 'added',
        text: newLines[j - 1] ?? '',
        newLineNumber: j,
      });
      j--;
    } else {
      result.push({
        type: 'removed',
        text: oldLines[i - 1] ?? '',
        oldLineNumber: i,
      });
      i--;
    }
  }

  return result.reverse();
}

/**
 * Compute a line-based diff between two strings.
 * Returns an array of DiffLine objects with type (added/removed/unchanged),
 * the line text, and line numbers from the old and/or new versions.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const lcs = buildLcsTable(oldLines, newLines);
  return backtrack(lcs, oldLines, newLines, oldLines.length, newLines.length);
}
