/**
 * Main UI controller: loads example programs, drives the engine one cycle at a
 * time, and renders the canvas diagram, timing table, and register list.
 */
import './style.css';
import { MainLogic } from './engine/mainLogic.ts';
import { parseFile } from './engine/parseFile.ts';
import { drawDiagram } from './diagram.ts';
import { EXAMPLES } from './examples.ts';

const MAX_CYCLES = 500;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const exampleSelect = $<HTMLSelectElement>('example-select');
const fileInput = $<HTMLInputElement>('file-input');
const btnStep = $<HTMLButtonElement>('btn-step');
const btnMulti = $<HTMLButtonElement>('btn-multi');
const btnRun = $<HTMLButtonElement>('btn-run');
const btnReset = $<HTMLButtonElement>('btn-reset');
const multiNum = $<HTMLInputElement>('multi-num');
const statusEl = $<HTMLParagraphElement>('status');
const canvas = $<HTMLCanvasElement>('diagram');
const timingBody = $<HTMLTableSectionElement>('timing-body');
const registersEl = $<HTMLDivElement>('registers');

let logic: MainLogic;
let currentSource = '';

function baseUrl(): string {
  // Vite injects BASE_URL at build time; ensures assets resolve under the
  // GitHub Pages project base path.
  return import.meta.env.BASE_URL;
}

function populateExamples(): void {
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option');
    opt.value = ex.file;
    opt.textContent = ex.label;
    opt.title = ex.description;
    exampleSelect.appendChild(opt);
  }
}

async function loadExample(file: string): Promise<void> {
  const url = `${baseUrl()}asm/${file}`;
  const res = await fetch(url);
  if (!res.ok) {
    setStatus(`No se pudo cargar ${file} (HTTP ${res.status})`);
    return;
  }
  currentSource = await res.text();
  reset();
}

function reset(): void {
  const { textLines } = parseFile(currentSource);
  logic = new MainLogic(textLines);
  logic.initLabelMap();
  render();
}

function step(): void {
  if (!logic) return;
  if (logic.isEnd && logic.allEnded()) return;
  logic.parseStep();
  render();
}

function multiStep(): void {
  const n = Math.max(1, parseInt(multiNum.value, 10) || 1);
  for (let i = 0; i < n; i++) {
    if (logic.isEnd && logic.allEnded()) break;
    logic.parseStep();
  }
  render();
}

function runAll(): void {
  let guard = 0;
  while (guard < MAX_CYCLES) {
    if (logic.isEnd && logic.allEnded()) break;
    logic.parseStep();
    guard++;
  }
  render();
}

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function render(): void {
  drawDiagram(canvas, logic);
  renderTable();
  renderRegisters();
  const done = logic.isEnd && logic.allEnded();
  setStatus(
    `Ciclo ${logic.CycleNumCur} · instrucciones emitidas ${logic.totalInstructionNum}` +
      (done ? ' · finalizado' : '')
  );
  btnStep.disabled = done;
  btnMulti.disabled = done;
  btnRun.disabled = done;
}

function renderTable(): void {
  timingBody.innerHTML = '';
  // Show oldest instruction first (station is LIFO / newest-first).
  const insts = logic.OperationInfoStation.slice().reverse();
  insts.forEach((ii, idx) => {
    const tr = document.createElement('tr');
    const exe = ii.exeStart === 0 && ii.exeEnd === 0 ? '—' : `${ii.exeStart}–${ii.exeEnd}`;
    const cells = [
      String(idx + 1),
      ii.inst,
      ii.issue ? String(ii.issue) : '—',
      exe,
      ii.writeBack ? String(ii.writeBack) : '—',
      ii.state || '—',
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    timingBody.appendChild(tr);
  });
}

function renderRegisters(): void {
  registersEl.innerHTML = '';
  const add = (name: string, r: { ready: boolean; occupyInstId: number }) => {
    const chip = document.createElement('span');
    chip.className = 'reg-chip' + (r.ready ? '' : ' busy');
    chip.textContent = r.ready ? `${name}: libre` : `${name}: ocupado por #${r.occupyInstId}`;
    registersEl.appendChild(chip);
  };
  let any = false;
  logic.IntRegs.forEach((r, i) => {
    if (!r.ready) { add(`R${i}`, r); any = true; }
  });
  logic.FloatRegs.forEach((r, i) => {
    if (!r.ready) { add(`F${i}`, r); any = true; }
  });
  if (!any) {
    const chip = document.createElement('span');
    chip.className = 'reg-chip';
    chip.textContent = 'Ningún registro ocupado';
    registersEl.appendChild(chip);
  }
}

// --- Wire events ---
populateExamples();

exampleSelect.addEventListener('change', () => {
  void loadExample(exampleSelect.value);
});

fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  currentSource = await f.text();
  exampleSelect.selectedIndex = -1;
  reset();
});

btnStep.addEventListener('click', step);
btnMulti.addEventListener('click', multiStep);
btnRun.addEventListener('click', runAll);
btnReset.addEventListener('click', reset);

// Load the first example on startup.
void loadExample(EXAMPLES[0].file);
