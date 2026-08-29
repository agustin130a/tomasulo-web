/**
 * Canvas renderer that reproduces the "Tomasulo Dynamic Chart" of the original
 * Java Swing app (Diagram.java): OP Queue, Registers, LD/SD buffers, the four
 * reservation-station groups (IntegerFU, FPadder, FPmult, FPdiv) each shown as
 * rows of [op | src1 | src2], the functional-unit labels, the Common Data Bus,
 * and the connecting buses.
 *
 * Wiring is drawn as clean orthogonal buses on separate vertical levels so the
 * op / src1 / src2 feeders never overlap each other or the boxes. All cell text
 * is clipped to its box width. Cells are colored by instruction index (the same
 * palette keys the Cycles table).
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

const H = 16; // cell height
const OP_W = 34;
const OPERAND_W = 54;
const RS_W = OP_W + 2 * OPERAND_W;

interface RSGroup {
  key: 'INT' | 'ADD' | 'MUL' | 'DIV';
  label: string;
  count: number;
  rows: (InstructionInfo | null)[];
  x: number;
}

function buildGroups(logic: MainLogic): Record<string, RSGroup> {
  const num = logic.architectureNum; // {ld, sd, int, fpAdd, fpMul, fpDiv}
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

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill?: string) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x + 1, y + 1, w - 1, h - 1);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

/** Draw text clipped to a box so it never overflows. */
function clippedText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, color = INK) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 2, y - H, w + 2, H + 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

function hline(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

function vline(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, color: string, arrow = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
  if (arrow) {
    const dir = y2 > y1 ? 1 : -1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y2);
    ctx.lineTo(x - 4, y2 - dir * 6);
    ctx.lineTo(x + 4, y2 - dir * 6);
    ctx.closePath();
    ctx.fill();
  }
}

function opQueueEntries(logic: MainLogic): string[] {
  const out: string[] = [];
  const start = logic.instructionLineCur;
  for (let j = 0; j < logic.OpQueue; j++) {
    const k = start + j;
    if (logic.isEnd || k >= logic.InstructionFullList.length) { out.push(''); continue; }
    let raw = logic.InstructionFullList[k];
    // Strip the comment FIRST (a comment like "; S3: MULT ..." can contain ':').
    raw = raw.split(';')[0];
    // Then drop a leading label ("main: l.d ...").
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

  // Cycle counter, top-right corner (out of the way)
  ctx.font = bold;
  ctx.fillStyle = INK;
  ctx.fillText(`Ciclo ${logic.CycleNumCur}`, W - 90, 20);

  // --- Layout ---
  const topY = 60;              // top row of OP Queue / Registers boxes
  const opQueueX = 470;
  const opQueueW = 150;
  const registersX = 660;
  const registersW = 120;
  const bufTopY = 150;          // LD/SD buffers top
  const ldX = 40;
  const sdX = 900;
  const bufW = 90;

  // Three feeder bus levels (well separated) between the queues and the RS row
  const busOpY = 300;
  const busS1Y = 315;
  const busS2Y = 330;
  const rsTopY = 360;           // RS groups top
  const cdbY = 470;             // Common Data Bus

  const groups = buildGroups(logic);
  const rsBaseX = [120, 330, 560, 790];
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
  // Original layout: the next-to-issue instruction sits at the BOTTOM row and
  // pending instructions stack upward (Diagram.java draws with originY - h*q).
  for (let i = 0; i < logic.OpQueue; i++) {
    const rowFromBottom = logic.OpQueue - 1 - i;
    const y = topY + rowFromBottom * H;
    const entry = opEntries[i];
    box(ctx, opQueueX, y, opQueueW, H, entry ? colorFor(logic.instructionLineCur + i) : undefined);
    if (entry) clippedText(ctx, entry, opQueueX + 4, y + 12, opQueueW - 6);
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
    if (wb) clippedText(ctx, `${wb.operation}  ${wb.DestReg ?? ''}`, registersX + 4, y + 12, registersW - 6);
  }

  // ---- LD Buffer ----
  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText('LD Buffer (From Memory)', ldX, bufTopY - 8);
  ctx.font = normal;
  const ldCount = logic.architectureNum[0];
  const ldRows = collectBuffer(logic, 'LOAD', ldCount);
  for (let i = 0; i < ldCount; i++) {
    const y = bufTopY + i * H;
    box(ctx, ldX, y, bufW, H, ldRows[i] ? colorFor(ldRows[i]!.absoluteIndex) : undefined);
    if (ldRows[i]) clippedText(ctx, ldRows[i]!.operation, ldX + 4, y + 12, bufW - 6);
  }
  const ldBottom = bufTopY + ldCount * H;

  // ---- SD Buffer ----
  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText('SD Buffer (To Memory)', sdX - 24, bufTopY - 8);
  ctx.font = normal;
  const sdCount = logic.architectureNum[1];
  const sdRows = collectBuffer(logic, 'SAVE', sdCount);
  for (let i = 0; i < sdCount; i++) {
    const y = bufTopY + i * H;
    box(ctx, sdX, y, bufW, H, sdRows[i] ? colorFor(sdRows[i]!.absoluteIndex) : undefined);
    if (sdRows[i]) clippedText(ctx, sdRows[i]!.operation, sdX + 4, y + 12, bufW - 6);
  }
  const sdBottom = bufTopY + sdCount * H;

  // ---- RS groups + FU labels ----
  ctx.font = normal;
  for (const g of order) {
    for (let r = 0; r < g.count; r++) {
      const y = rsTopY + r * H;
      const inst = g.rows[r];
      const fill = inst ? colorFor(inst.absoluteIndex) : undefined;
      box(ctx, g.x, y, OP_W, H, fill);
      box(ctx, g.x + OP_W, y, OPERAND_W, H, fill);
      box(ctx, g.x + OP_W + OPERAND_W, y, OPERAND_W, H, fill);
      if (inst) {
        clippedText(ctx, inst.operation, g.x + 3, y + 12, OP_W - 4);
        clippedText(ctx, inst.s1 ?? '', g.x + OP_W + 3, y + 12, OPERAND_W - 4);
        clippedText(ctx, inst.s2 ?? '', g.x + OP_W + OPERAND_W + 3, y + 12, OPERAND_W - 4);
      }
    }
    const fuY = rsTopY + g.count * H + 6;
    ctx.font = bold;
    box(ctx, g.x, fuY, RS_W, H);
    clippedText(ctx, g.label, g.x + 6, fuY + 12, RS_W - 8);
    ctx.font = normal;
  }
  const rsFuBottom = (g: RSGroup) => rsTopY + g.count * H + 6 + H;

  // ================= WIRING =================
  const opColX = (g: RSGroup) => g.x + OP_W / 2;
  const s1ColX = (g: RSGroup) => g.x + OP_W + OPERAND_W / 2;
  const s2ColX = (g: RSGroup) => g.x + OP_W + OPERAND_W + OPERAND_W / 2;

  const leftMost = order[0].x;
  const rightMost = order[order.length - 1].x + RS_W;

  // --- OP bus (green): OP queue -> horizontal bus -> down into each op box ---
  const opSourceX = opQueueX + 20;
  vline(ctx, opSourceX, topY + logic.OpQueue * H, busOpY, WIRE_OP);
  hline(ctx, leftMost, Math.max(rightMost, opSourceX), busOpY, WIRE_OP);
  for (const g of order) vline(ctx, opColX(g), busOpY, rsTopY, WIRE_OP, true);

  // --- src1 bus (orange): Registers -> bus -> down into each src1 box ---
  const regSrcX = registersX + 15;
  vline(ctx, regSrcX, topY + regCount * H, busS1Y, WIRE_SRC1);
  hline(ctx, leftMost, Math.max(rightMost, regSrcX), busS1Y, WIRE_SRC1);
  for (const g of order) vline(ctx, s1ColX(g), busS1Y, rsTopY, WIRE_SRC1, true);

  // --- src2 bus (blue): Registers -> bus -> down into each src2 box ---
  const regSrc2X = registersX + registersW - 15;
  vline(ctx, regSrc2X, topY + regCount * H, busS2Y, WIRE_SRC2);
  hline(ctx, leftMost, Math.max(rightMost, regSrc2X), busS2Y, WIRE_SRC2);
  for (const g of order) vline(ctx, s2ColX(g), busS2Y, rsTopY, WIRE_SRC2, true);

  // --- Common Data Bus (pink) ---
  hline(ctx, ldX, sdX + bufW, cdbY, WIRE_CDB);
  ctx.font = bold; ctx.fillStyle = INK;
  ctx.fillText('Common Data Bus', ldX, cdbY + 18);
  ctx.font = normal;

  // FU -> CDB (each group center down to the bus)
  for (const g of order) {
    const cx = g.x + RS_W / 2;
    vline(ctx, cx, rsFuBottom(g), cdbY, WIRE_CDB, true);
  }
  // LD buffer -> CDB (down)
  vline(ctx, ldX + bufW / 2, ldBottom, cdbY, WIRE_CDB, true);
  // CDB -> SD buffer (up)
  vline(ctx, sdX + bufW / 2, cdbY, sdBottom, WIRE_CDB, true);
  // CDB -> Registers (up along the right edge, clear of the buses)
  const cdbToRegX = registersX + registersW + 24;
  vline(ctx, cdbToRegX, cdbY, topY + regCount * H, WIRE_CDB);
  hline(ctx, registersX + registersW, cdbToRegX, topY + regCount * H - 8, WIRE_CDB);
  vline(ctx, registersX + registersW + 4, topY + regCount * H - 8, topY + regCount * H - 8, WIRE_CDB, true);
}
