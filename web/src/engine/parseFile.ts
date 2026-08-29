/**
 * Port of ParseFile.java.
 *
 * Splits a MIPS-style *.s file into .data / .text sections and returns the
 * list of .text instruction lines (stripped) that the engine will run.
 *
 * Fidelity notes:
 * - Lines starting with ';' or blank are skipped.
 * - '.data' / '.text' toggle the current section.
 * - Only .text lines feed the engine (matches MainLogic.InstructionFullList).
 * - .data parsing is a TODO stub in Java (memory is random-initialized), so we
 *   deliberately do NOT parse .data into memory here either.
 */
export interface ParsedFile {
  textLines: string[];
  dataLines: string[];
}

export function parseFile(content: string): ParsedFile {
  const dataLines: string[] = [];
  const textLines: string[] = [];
  let section: 'data' | 'text' = 'data';

  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const str = raw;
    if (str.startsWith(';') || str.trim().length === 0) {
      continue;
    }
    const stripped = str.trim();
    if (stripped === '.data') {
      section = 'data';
    } else if (stripped === '.text') {
      section = 'text';
    } else if (section === 'text') {
      textLines.push(stripped);
    } else {
      dataLines.push(stripped);
    }
  }
  return { textLines, dataLines };
}
