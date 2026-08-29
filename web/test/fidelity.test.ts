/**
 * Fidelity test: run the TS engine over every asm_code/*.s sample and compare
 * its per-instruction timing table (Issue / ExeStart-ExeEnd / WriteBack) and
 * total cycle count against the Java HeadlessTest golden output.
 *
 * We compare TIMINGS only. Numeric register/memory values are not reproducible
 * because the Java engine random-inits memory.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { MainLogic } from '../src/engine/mainLogic.ts';
import { parseFile } from '../src/engine/parseFile.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const asmDir = join(__dirname, '..', 'public', 'asm');
const goldenDir = join(__dirname, 'golden');

interface Row {
  inst: string;
  issue: number;
  exe: string;
  wb: number;
}

interface Golden {
  cycles: number;
  issued: number;
  rows: Row[];
}

/** Parse a HeadlessTest golden .txt into a structured form. */
function parseGolden(txt: string): Golden {
  const lines = txt.split(/\r?\n/);
  let cycles = -1;
  let issued = -1;
  const rows: Row[] = [];
  let inTable = false;

  for (const line of lines) {
    const finM = line.match(/cycles=(\d+).*issuedInstr=(\d+)/);
    if (finM) {
      cycles = parseInt(finM[1], 10);
      issued = parseInt(finM[2], 10);
    }
    if (line.startsWith('Instruction')) {
      inTable = true;
      continue;
    }
    if (inTable) {
      if (line.trim() === '' || line.startsWith('RESULT')) {
        inTable = false;
        continue;
      }
      // Columns are right-aligned: "<inst padded> <issue> <exe> <wb>"
      // The last 3 whitespace-separated tokens are issue, exe, wb.
      const m = line.match(/^(.*?)\s+(\d+)\s+(\S+)\s+(\d+)\s*$/);
      if (m) {
        rows.push({
          inst: m[1].trim(),
          issue: parseInt(m[2], 10),
          exe: m[3],
          wb: parseInt(m[4], 10),
        });
      }
    }
  }
  return { cycles, issued, rows };
}

/** Run the TS engine to completion and produce the same table shape. */
function runTs(content: string): Golden {
  const { textLines } = parseFile(content);
  const logic = new MainLogic(textLines);
  logic.initLabelMap();
  logic.CycleNumCur = 0;

  let guard = 0;
  const maxCycles = 300;
  while (guard < maxCycles) {
    logic.parseStep();
    guard++;
    if (logic.isEnd && logic.allEnded()) break;
  }

  const rows: Row[] = logic.OperationInfoStation.map((ii) => ({
    inst: ii.inst,
    issue: ii.issue,
    exe: ii.exeStart === 0 && ii.exeEnd === 0 ? '-' : `${ii.exeStart}-${ii.exeEnd}`,
    wb: ii.writeBack,
  }));

  return { cycles: logic.CycleNumCur, issued: logic.totalInstructionNum, rows };
}

function compare(_name: string, java: Golden, ts: Golden): string[] {
  const errs: string[] = [];
  if (java.cycles !== ts.cycles) {
    errs.push(`  cycle count: java=${java.cycles} ts=${ts.cycles}`);
  }
  if (java.issued !== ts.issued) {
    errs.push(`  issued count: java=${java.issued} ts=${ts.issued}`);
  }
  if (java.rows.length !== ts.rows.length) {
    errs.push(`  row count: java=${java.rows.length} ts=${ts.rows.length}`);
  }
  const n = Math.min(java.rows.length, ts.rows.length);
  for (let i = 0; i < n; i++) {
    const j = java.rows[i];
    const t = ts.rows[i];
    if (j.issue !== t.issue || j.exe !== t.exe || j.wb !== t.wb || j.inst !== t.inst) {
      errs.push(
        `  row ${i}: java[${j.inst} | ${j.issue} ${j.exe} ${j.wb}] ts[${t.inst} | ${t.issue} ${t.exe} ${t.wb}]`
      );
    }
  }
  return errs;
}

let failures = 0;
const samples = readdirSync(asmDir).filter((f) => f.endsWith('.s'));
for (const s of samples) {
  const name = basename(s, '.s');
  const content = readFileSync(join(asmDir, s), 'utf8');
  const golden = parseGolden(readFileSync(join(goldenDir, `${name}.txt`), 'utf8'));
  const ts = runTs(content);
  const errs = compare(name, golden, ts);
  if (errs.length === 0) {
    console.log(`PASS  ${name}  (cycles=${ts.cycles}, issued=${ts.issued}, rows=${ts.rows.length})`);
  } else {
    failures++;
    console.log(`FAIL  ${name}`);
    for (const e of errs) console.log(e);
  }
}

console.log(`\n${samples.length - failures}/${samples.length} samples match the Java golden output.`);
if (failures > 0) process.exit(1);
