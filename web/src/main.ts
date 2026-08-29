/**
 * Main UI controller: loads example programs into an editable code preview,
 * builds the engine from the editor content on demand, and renders the canvas
 * diagram, timing table, and register list.
 *
 * Flow: selecting an example (or a file) loads its source into the editor
 * WITHOUT running. The user can edit it, then presses "Cargar / Simular" to
 * build the simulation from whatever is in the editor.
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
const editor = $<HTMLTextAreaElement>('source-editor');
const btnLoad = $<HTMLButtonElement>('btn-load');
const editorStatus = $<HTMLSpanElement>('editor-status');
const btnStep = $<HTMLButtonElement>('btn-step');
const btnMulti = $<HTMLButtonElement>('btn-multi');
const btnRun = $<HTMLButtonElement>('btn-run');
const btnReset = $<HTMLButtonElement>('btn-reset');
const multiNum = $<HTMLInputElement>('multi-num');
const statusEl = $<HTMLParagraphElement>('status');
const canvas = $<HTMLCanvasElement>('diagram');
const timingBody = $<HTMLTableSectionElement>('timing-body');
const registersEl = $<HTMLDivElement>('registers');

let logic: MainLogic | null = null;
let loadedSource = ''; // source currently loaded into the simulation

function baseUrl(): string {
  return import.meta.env.BASE_URL;
}

function populateExamples(): void {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Elegí un ejemplo —';
  exampleSelect.appendChild(placeholder);
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option');
    opt.value = ex.file;
    opt.textContent = ex.label;
    opt.title = ex.description;
    exampleSelect.appendChild(opt);
  }
}

/** Fetch an example into the editor for preview/edit (does NOT run it). */
async function previewExample(file: string): Promise<void> {
  const url = `${baseUrl()}asm/${file}`;
  const res = await fetch(url);
  if (!res.ok) {
    setEditorStatus(`No se pudo cargar ${file} (HTTP ${res.status})`, true);
    return;
  }
  editor.value = await res.text();
  setEditorStatus('Código cargado en el editor. Editá y pulsá "Cargar / Simular".');
}

/** Build the simulation from whatever is currently in the editor. */
function loadFromEditor(): void {
  const source = editor.value;
  if (source.trim().length === 0) {
    setEditorStatus('El editor está vacío. Pegá o elegí un programa.', true);
    return;
  }
  loadedSource = source;
  const { textLines } = parseFile(source);
  if (textLines.length === 0) {
    setEditorStatus('No se encontraron instrucciones en la sección .text.', true);
    return;
  }
  buildEngine();
  setEditorStatus(`Simulación cargada: ${textLines.length} líneas de .text.`);
}

function buildEngine(): void {
  const { textLines } = parseFile(loadedSource);
  logic = new MainLogic(textLines);
  logic.initLabelMap();
  render();
}

function step(): void {
  if (!logic || (logic.isEnd && logic.allEnded())) return;
  logic.parseStep();
  render();
}

function multiStep(): void {
  if (!logic) return;
  const n = Math.max(1, parseInt(multiNum.value, 10) || 1);
  for (let i = 0; i < n; i++) {
    if (logic.isEnd && logic.allEnded()) break;
    logic.parseStep();
  }
  render();
}

function runAll(): void {
  if (!logic) return;
  let guard = 0;
  while (guard < MAX_CYCLES) {
    if (logic.isEnd && logic.allEnded()) break;
    logic.parseStep();
    guard++;
  }
  render();
}

/** Reset re-builds the engine from the last loaded source (from cycle 0). */
function resetSimulation(): void {
  if (loadedSource.trim().length === 0) return;
  buildEngine();
}

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function setEditorStatus(msg: string, isError = false): void {
  editorStatus.textContent = msg;
  editorStatus.classList.toggle('error', isError);
}

function setControlsEnabled(enabled: boolean): void {
  const done = enabled && logic ? logic.isEnd && logic.allEnded() : true;
  btnStep.disabled = !enabled || done;
  btnMulti.disabled = !enabled || done;
  btnRun.disabled = !enabled || done;
  btnReset.disabled = !enabled;
}

function render(): void {
  if (!logic) {
    setStatus('Sin simulación cargada.');
    setControlsEnabled(false);
    return;
  }
  drawDiagram(canvas, logic);
  renderTable();
  renderRegisters();
  const done = logic.isEnd && logic.allEnded();
  setStatus(
    `Ciclo ${logic.CycleNumCur} · instrucciones emitidas ${logic.totalInstructionNum}` +
      (done ? ' · finalizado' : '')
  );
  setControlsEnabled(true);
}

function renderTable(): void {
  if (!logic) return;
  timingBody.innerHTML = '';
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
  if (!logic) return;
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
  if (exampleSelect.value) void previewExample(exampleSelect.value);
});

fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  editor.value = await f.text();
  exampleSelect.value = '';
  setEditorStatus(`Archivo "${f.name}" cargado en el editor. Pulsá "Cargar / Simular".`);
});

btnLoad.addEventListener('click', loadFromEditor);
btnStep.addEventListener('click', step);
btnMulti.addEventListener('click', multiStep);
btnRun.addEventListener('click', runAll);
btnReset.addEventListener('click', resetSimulation);

// Startup: preview the first example in the editor (do not run yet).
setControlsEnabled(false);
setStatus('Sin simulación cargada. Elegí un ejemplo y pulsá "Cargar / Simular".');
void previewExample(EXAMPLES[0].file).then(() => {
  exampleSelect.value = EXAMPLES[0].file;
});
