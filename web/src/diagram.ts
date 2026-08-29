/**
 * Canvas renderer that reproduces the "Tomasulo Dynamic Chart" of the original
 * Java Swing app (Diagram.java) AND makes operand dependencies explicit.
 *
 * Each reservation-station row shows, per source operand, whether the value is
 * READY (Vj — the source register value is available) or WAITING on a producing
 * instruction (Qj → "#N", i.e. it needs instruction N to write back first).
 * Waiting operands are drawn amber; ready ones green — so you can watch
 * dependencies get satisfied cycle by cycle without extra connector clutter.
 *
 * The LD and SD buffers show, per entry, the operation and its Dir (address
 * expression); the SD buffer also shows the Q dependency (the producer of the
 * value being stored, or the ready register).
 *
 * Dependency data comes straight from the engine: on issue, each operand is
 * either resolved to a value (ValueRegN) or tagged with the producer's
 * absoluteIndex (waiForIndexRegN). judgeExeStart fills ValueRegN once the
 * producer reaches End — exactly the moment the dependency is satisfied.
 */
import type { MainLogic, InstructionInfo } from './engine/mainLogic.ts';

const CYCLE_COLORS = [
  '#f4a6b0', '#b9a6e0', '#a6d8a6', '#8ecae6', '#ffd6a5',
  '#c7f9cc', '#ffc6ff', '#bdb2ff', '#a0c4ff', '#fdffb6',
];
const colorFor = (idx: number) => CYCLE_COLORS[((idx % CYCLE_COLORS.length) + CYCLE_COLORS.length) % CYCLE_COLORS.length];

const INK = '#1d2433';
const WIRE_OP = '#6aa84f';
const WIRE_SRC1 = '#e69138';
const WIRE_SRC2 = '#3d85c6';
const WIRE_CDB = '#e06c9f';
const READY = '#2e7d32';       // ready operand (green)
const WAIT = '#e67e22';        // waiting operand (amber)
const WAIT_FILL = '#fff3e0';
const READY_FILL = '#e8f5e9';

const H = 16;                  // queue/buffer cell height
const RS_H = 28;               // reservation-station row height (two lines)
const OP_W = 40;
const OPERAND_W = 80;
const RS_W = OP_W + 2 * OPERAND_W;

interface RSGroup {
  key: 'INT' | 'ADD' | 'MUL' | 'DIV';
  label: string;
  count: number;
  rows: (InstructionInfo | null)[];
  x: number;
}

/** Per-operand dependency status. */
type OperandStatus =
  | { kind: 'none' }                       // no register source (immediate / unused)
  | { kind: 'ready'; reg: string }         // value available (Vj)
  | { kind: 'wait'; reg: string; on: number }; // waiting on producer instruction #on (Qj)

function operandStatus(inst: InstructionInfo, which: 1 | 2): OperandStatus {
  const reg = which === 1 ? inst.SourceReg1 : inst.SourceReg2;
  const wait = which === 1 ? inst.waiForIndexReg1 : inst.waiForIndexReg2;
  const val = which === 1 ? inst.ValueReg1 : inst.ValueReg2;
  if (reg == null) return { kind: 'none' };
  if (wait != null && val == null) return { kind: 'wait', reg, on: wait };
  return { kind: 'ready', reg };
}

/**
 * Reconstruct a load/store address expression "offset(baseReg)" from the engine
 * fields. The parser stores the offset in ValueReg1 and the base register in
 * SourceReg2 (or a literal in ValueReg2). s1/s2 are intentionally left unset for
 * LOAD/SAVE to match the Java engine, so we rebuild the display string here.
 */
function storeDir(inst: InstructionInfo): string {
  const offset = inst.ValueReg1 ?? 0;
  const base = inst.SourceReg2 ?? (inst.ValueReg2 != null ? String(inst.ValueReg2) : '');
  if (base) return `${offset}(${base})`;
  return String(offset);
}

function buildGroups(logic: MainLogic): Record<string, RSGroup> {
  const num = logic.architectureNum;
  const groups: Record<string, RSGroup> = {
    INT: { key: 'INT', label: 'IntegerFU', count: num[2], rows: new Array(num[2]).fill(null), x: 0 },
    ADD: { key: 'ADD', label: 'FPadder', count: num[3], rows: new Array(num[3]).fill(null), x: 0 },
    MUL: { key: 'MUL', label: 'FPmult', count: num[4], rows: new Array(num[4]).fill(null), x: 0 },
    DIV: { key: 'DIV', label: 'FPdiv', count: num[5], rows: new Array(num[5]).fill(null), x: 0 },
  };
  for (const inst of logic.OperationInfoStation) {
    if (inst.state === 'Issue' || inst.state === 'EXE' || inst.state === 'ExeEnd') {
      const g = groups[inst.op];
      if (g) {
        const slot = g.rows.findIndex((r) => r === null);
        if (slot !== -1) g.rows[slot] = inst;
      }
    }
  }
  return groups;
}

function collectBuffer(logic: MainLogic, op: 'LOAD' | 'SAVE', count: number): (InstructionInfo | null)[] {
  const rows: (InstructionInfo | null)[] = new Array(count).fill(null);
  for (const inst of logic.OperationInfoStation) {
    if (inst.op === op && (inst.state === 'Issue' || inst.state === 'EXE' || inst.state === 'ExeEnd')) {
      const s = rows.findIndex((r) => r === null);
      if (s !== -1) rows[s] = inst;
    }
  }
  return rows;
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill?: string, stroke = INK) {
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 1, h - 1); }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function clippedText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, h: number, color = INK) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 2, y - h, w + 2, h + 4);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function hline(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
}

function vline(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, color: string) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
}

function opQueueEntries(logic: MainLogic): string[] {
  const out: string[] = [];
  const start = logic.instructionLineCur;
  for (let j = 0; j < logic.OpQueue; j++) {
    const k = start + j;
    if (logic.isEnd || k >= logic.InstructionFullList.length) { out.push(''); continue; }
    let raw = logic.InstructionFullList[k];
    raw = raw.split(';')[0];
    if (raw.split(':').length > 1) raw = raw.split(':').slice(1).join(':');
    out.push(raw.trim());
  }
  return out;
}

export function drawDiagram(canvas: HTMLCanvasElement, logic: MainLogic): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const CH = canvas.height;
  ctx.clearRect(0, 0, W, CH);
  ctx.fillStyle = '#e6fbfb';
  ctx.fillRect(0, 0, W, CH);
  ctx.textBaseline = 'alphabetic';

  const bold = 'bold 11px Arial, sans-serif';
  const normal = '10px Arial, sans-serif';
  const small = '9px Arial, sans-serif';

  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText(`Ciclo ${logic.CycleNumCur}`, W - 90, 20);

  // Legend
  ctx.font = small;
  const legY = 20;
  ctx.fillStyle = READY; ctx.fillRect(20, legY - 9, 10, 10);
  ctx.fillStyle = INK; ctx.fillText('operando listo (Vj)', 34, legY);
  ctx.fillStyle = WAIT; ctx.fillRect(150, legY - 9, 10, 10);
  ctx.fillStyle = INK; ctx.fillText('esperando #N (Qj)', 164, legY);

  // --- Layout ---
  const topY = 60;
  const opQueueX = 470;
  const opQueueW = 150;
  const registersX = 660;
  const registersW = 120;
  const bufTopY = 150;
  const ldX = 40;
  const sdX = 872;
  const ldOpW = 54;
  const ldDirW = 66;
  const ldW = ldOpW + ldDirW;
  const sdOpW = 54;
  const sdDirW = 66;
  const sdW = sdOpW + sdDirW;

  const busOpY = 296;
  const busS1Y = 316;
  const busS2Y = 336;
  const rsTopY = 372;
  const cdbY = 524;

  const groups = buildGroups(logic);
  const rsBaseX = [110, 320, 545, 775];
  groups.INT.x = rsBaseX[0];
  groups.ADD.x = rsBaseX[1];
  groups.MUL.x = rsBaseX[2];
  groups.DIV.x = rsBaseX[3];
  const order: RSGroup[] = [groups.INT, groups.ADD, groups.MUL, groups.DIV];

  // ---- OP Queue ----
  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText('OP Queue', opQueueX, topY - 8);
  const opEntries = opQueueEntries(logic);
  ctx.font = normal;
  for (let i = 0; i < logic.OpQueue; i++) {
    const rowFromBottom = logic.OpQueue - 1 - i;
    const y = topY + rowFromBottom * H;
    const entry = opEntries[i];
    box(ctx, opQueueX, y, opQueueW, H, entry ? colorFor(logic.instructionLineCur + i) : undefined);
    if (entry) clippedText(ctx, entry, opQueueX + 4, y + 12, opQueueW - 6, H);
  }

  // ---- Registers (write-back list) ----
  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText('Registers', registersX, topY - 8);
  ctx.font = normal;
  const regCount = 10;
  for (let i = 0; i < regCount; i++) {
    const y = topY + i * H;
    const wb = logic.wbList[i];
    box(ctx, registersX, y, registersW, H, wb ? colorFor(wb.absoluteIndex) : undefined);
    if (wb) clippedText(ctx, `${wb.operation}  ${wb.DestReg ?? ''}`, registersX + 4, y + 12, registersW - 6, H);
  }

  // ---- LD Buffer (shows the destination op and Dir = address) ----
  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText('LD Buffer (From Memory)', ldX, bufTopY - 8);
  // column headers
  ctx.font = small; ctx.fillStyle = '#555';
  ctx.fillText('Op', ldX + 4, bufTopY - 1 + H);
  ctx.fillText('Dir', ldX + ldOpW + 4, bufTopY - 1 + H);
  const ldHdrY = bufTopY + H;
  ctx.font = normal;
  const ldCount = logic.architectureNum[0];
  const ldRows = collectBuffer(logic, 'LOAD', ldCount);
  for (let i = 0; i < ldCount; i++) {
    const y = ldHdrY + i * RS_H;
    const inst = ldRows[i];
    const fill = inst ? colorFor(inst.absoluteIndex) : undefined;
    // Op cell (operation + destination register)
    box(ctx, ldX, y, ldOpW, RS_H, fill);
    // Dir cell
    box(ctx, ldX + ldOpW, y, ldDirW, RS_H, fill);
    if (inst) {
      ctx.font = normal;
      clippedText(ctx, inst.operation, ldX + 4, y + 12, ldOpW - 6, RS_H);
      ctx.font = small;
      clippedText(ctx, inst.DestReg ?? '', ldX + 4, y + 24, ldOpW - 6, RS_H, '#555');
      ctx.font = normal;
      clippedText(ctx, storeDir(inst), ldX + ldOpW + 4, y + 18, ldDirW - 6, RS_H, INK);
    }
  }
  const ldBottom = ldHdrY + ldCount * RS_H;

  // ---- SD Buffer (shows Q = dependency being waited on, and Dir = address) ----
  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText('SD Buffer (To Memory)', sdX, bufTopY - 8);
  // column headers
  ctx.font = small; ctx.fillStyle = '#555';
  ctx.fillText('Op / Q', sdX + 4, bufTopY - 1 + H);
  ctx.fillText('Dir', sdX + sdOpW + 4, bufTopY - 1 + H);
  const sdHdrY = bufTopY + H;
  ctx.font = normal;
  const sdCount = logic.architectureNum[1];
  const sdRows = collectBuffer(logic, 'SAVE', sdCount);
  for (let i = 0; i < sdCount; i++) {
    const y = sdHdrY + i * RS_H;
    const inst = sdRows[i];
    const fill = inst ? colorFor(inst.absoluteIndex) : undefined;
    // Op / Q cell
    box(ctx, sdX, y, sdOpW, RS_H, fill);
    // Dir cell
    box(ctx, sdX + sdOpW, y, sdDirW, RS_H, fill);
    if (inst) {
      ctx.font = normal;
      clippedText(ctx, inst.operation, sdX + 4, y + 12, sdOpW - 6, RS_H);
      // Q: for a store the value comes from DestReg; it waits on waiForIndexDest
      ctx.font = small;
      if (inst.waiForIndexDest != null && inst.ValueDest == null) {
        clippedText(ctx, `Q #${inst.waiForIndexDest}`, sdX + 4, y + 24, sdOpW - 6, RS_H, WAIT);
      } else {
        clippedText(ctx, `Q ${inst.DestReg ?? '—'}`, sdX + 4, y + 24, sdOpW - 6, RS_H, READY);
      }
      // Dir: the address expression, reconstructed as offset(baseReg)
      ctx.font = normal;
      clippedText(ctx, storeDir(inst), sdX + sdOpW + 4, y + 18, sdDirW - 6, RS_H, INK);
    }
  }
  const sdBottom = sdHdrY + sdCount * RS_H;

  // ---- RS groups: op | src1 | src2 with per-operand READY/WAIT status ----
  const rsGroupBottom = (g: RSGroup) => rsTopY + g.count * RS_H;
  for (const g of order) {
    for (let r = 0; r < g.count; r++) {
      const y = rsTopY + r * RS_H;
      const inst = g.rows[r];
      const baseFill = inst ? colorFor(inst.absoluteIndex) : undefined;

      // op cell
      box(ctx, g.x, y, OP_W, RS_H, baseFill);
      if (inst) {
        ctx.font = bold;
        clippedText(ctx, inst.operation, g.x + 3, y + 12, OP_W - 4, RS_H);
        ctx.font = small;
        clippedText(ctx, `#${inst.absoluteIndex} ${inst.state}`, g.x + 3, y + 24, OP_W - 4, RS_H, '#555');
      }

      // operand cells
      for (const which of [1, 2] as const) {
        const ox = g.x + OP_W + (which - 1) * OPERAND_W;
        const st = inst ? operandStatus(inst, which) : { kind: 'none' as const };
        let fill = baseFill;
        let strokeCol = INK;
        if (st.kind === 'wait') { fill = WAIT_FILL; strokeCol = WAIT; }
        else if (st.kind === 'ready') { fill = READY_FILL; strokeCol = READY; }
        box(ctx, ox, y, OPERAND_W, RS_H, fill, strokeCol);
        if (inst) {
          if (st.kind === 'wait') {
            ctx.font = normal;
            clippedText(ctx, st.reg, ox + 4, y + 12, OPERAND_W - 6, RS_H, INK);
            ctx.font = small;
            clippedText(ctx, `espera #${st.on}`, ox + 4, y + 24, OPERAND_W - 6, RS_H, WAIT);
          } else if (st.kind === 'ready') {
            ctx.font = normal;
            clippedText(ctx, st.reg, ox + 4, y + 12, OPERAND_W - 6, RS_H, INK);
            ctx.font = small;
            clippedText(ctx, 'listo', ox + 4, y + 24, OPERAND_W - 6, RS_H, READY);
          } else {
            // immediate / no reg source: show stored value operand text if any
            const raw = which === 1 ? inst.s1 : inst.s2;
            if (raw) { ctx.font = normal; clippedText(ctx, raw, ox + 4, y + 14, OPERAND_W - 6, RS_H, '#555'); }
          }
        }
      }
    }
    // FU label
    const fuY = rsGroupBottom(g) + 6;
    ctx.font = bold;
    box(ctx, g.x, fuY, RS_W, H);
    clippedText(ctx, g.label, g.x + 6, fuY + 12, RS_W - 8, H);
    ctx.font = normal;
  }
  const rsFuBottom = (g: RSGroup) => rsGroupBottom(g) + 6 + H;

  // ================= WIRING =================
  const opColX = (g: RSGroup) => g.x + OP_W / 2;
  const s1ColX = (g: RSGroup) => g.x + OP_W + OPERAND_W / 2;
  const s2ColX = (g: RSGroup) => g.x + OP_W + OPERAND_W + OPERAND_W / 2;

  // Each of the three feeder buses spans only from the first RS column it feeds
  // to the last, plus its own source tap — no full-width horizontals that run
  // under unrelated boxes.
  const opCols = order.map(opColX);
  const s1Cols = order.map(s1ColX);
  const s2Cols = order.map(s2ColX);

  // OP bus: fed from the OP queue.
  const opSourceX = opQueueX + 20;
  vline(ctx, opSourceX, topY + logic.OpQueue * H, busOpY, WIRE_OP);
  hline(ctx, Math.min(opSourceX, ...opCols), Math.max(opSourceX, ...opCols), busOpY, WIRE_OP);
  for (const cx of opCols) vline(ctx, cx, busOpY, rsTopY, WIRE_OP);

  // Src1 bus: fed from the register file (left tap).
  const regSrcX = registersX + 15;
  vline(ctx, regSrcX, topY + regCount * H, busS1Y, WIRE_SRC1);
  hline(ctx, Math.min(regSrcX, ...s1Cols), Math.max(regSrcX, ...s1Cols), busS1Y, WIRE_SRC1);
  for (const cx of s1Cols) vline(ctx, cx, busS1Y, rsTopY, WIRE_SRC1);

  // Src2 bus: fed from the register file (right tap).
  const regSrc2X = registersX + registersW - 15;
  vline(ctx, regSrc2X, topY + regCount * H, busS2Y, WIRE_SRC2);
  hline(ctx, Math.min(regSrc2X, ...s2Cols), Math.max(regSrc2X, ...s2Cols), busS2Y, WIRE_SRC2);
  for (const cx of s2Cols) vline(ctx, cx, busS2Y, rsTopY, WIRE_SRC2);

  // --- Common Data Bus ---
  hline(ctx, ldX, sdX + sdW, cdbY, WIRE_CDB);
  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText('Common Data Bus', ldX, cdbY + 18);
  ctx.font = normal;

  for (const g of order) {
    const cx = g.x + RS_W / 2;
    vline(ctx, cx, rsFuBottom(g), cdbY, WIRE_CDB);
  }
  vline(ctx, ldX + ldW / 2, ldBottom, cdbY, WIRE_CDB);
  vline(ctx, sdX + sdW / 2, cdbY, sdBottom, WIRE_CDB);
  // CDB return to the register file, routed down the right margin so it does
  // not cross the feeder buses.
  const cdbToRegX = sdX + sdW + 6;
  vline(ctx, cdbToRegX, cdbY, topY + regCount * H - 8, WIRE_CDB);
  hline(ctx, registersX + registersW, cdbToRegX, topY + regCount * H - 8, WIRE_CDB);
}
