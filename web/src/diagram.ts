/**
 * Canvas renderer that reproduces the "Tomasulo Dynamic Chart" of the original
 * Java Swing app (Diagram.java): OP Queue, Registers, LD/SD buffers, the four
 * reservation-station groups (IntegerFU, FPadder, FPmult, FPdiv) each shown as
 * rows of [op | src1 | src2], the functional-unit labels, the Common Data Bus,
 * and the connecting wires (OpQueue->RS op, Registers->RS src1/src2, FU->CDB,
 * CDB->Registers/SD).
 *
 * Data model mirrors Diagram.java: every clock cycle we classify each
 * instruction in OperationInfoStation (state Issue/EXE/ExeEnd) into its RS group
 * array; the OP Queue shows not-yet-issued instructions; Registers shows the
 * write-back list. Occupied cells are colored by instruction index (the same
 * palette keys the Cycles table).
 */
import type { MainLogic, InstructionInfo } from './engine/mainLogic.ts';

// Palette keyed by instruction absolute index (cycle-color scheme analog).
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
const OP_W = 34; // op box width
const OPERAND_W = 54; // operand box width

interface RSGroup {
  label: string;
  count: number;
  rows: (InstructionInfo | null)[];
  x: number; // left of the op box
}

/** Classify current in-flight instructions into RS group arrays (like Diagram.java). */
function buildGroups(logic: MainLogic): Record<string, RSGroup> {
  const num = logic.architectureNum; // {ld, sd, int, fpAdd, fpMul, fpDiv}
  const groups: Record<string, RSGroup> = {
    INT: { label: 'IntegerFU', count: num[2], rows: new Array(num[2]).fill(null), x: 0 },
    ADD: { label: 'FPadder', count: num[3], rows: new Array(num[3]).fill(null), x: 0 },
    MUL: { label: 'FPmult', count: num[4], rows: new Array(num[4]).fill(null), x: 0 },
    DIV: { label: 'FPdiv', count: num[5], rows: new Array(num[5]).fill(null), x: 0 },
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

function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill?: string) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x + 1, y + 1, w - 1, h - 1);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = INK) {
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function arrowLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // arrowhead at end
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 6 * Math.cos(ang - Math.PI / 6), y2 - 6 * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(x2 - 6 * Math.cos(ang + Math.PI / 6), y2 - 6 * Math.sin(ang + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
}

/** Return the raw instruction text for OP queue slot i (not-yet-issued). */
function opQueueEntries(logic: MainLogic): string[] {
  const out: string[] = [];
  const start = logic.instructionLineCur;
  for (let j = 0; j < logic.OpQueue; j++) {
    const k = start + j;
    if (logic.isEnd || k >= logic.InstructionFullList.length) {
      out.push('');
      continue;
    }
    let raw = logic.InstructionFullList[k];
    if (raw.split(':').length > 1) raw = raw.split(':')[1];
    out.push(raw.split(';')[0].trim());
  }
  return out;
}

export function drawDiagram(canvas: HTMLCanvasElement, logic: MainLogic): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const CH = canvas.height;
  ctx.clearRect(0, 0, W, CH);
  ctx.fillStyle = '#e6fbfb'; // light cyan like the original chart
  ctx.fillRect(0, 0, W, CH);
  ctx.textBaseline = 'alphabetic';

  const boldFont = 'bold 11px Arial, sans-serif';
  const normalFont = '10px Arial, sans-serif';

  // --- Layout anchors ---
  const opQueueX = 470;
  const registersX = 640;
  const topY = 70; // top of the queues
  const ldX = 60;
  const sdX = 860;
  const rsTopY = 250; // top of RS groups
  const cdbY = 360; // Common Data Bus line

  const groups = buildGroups(logic);
  const rsBaseX = [110, 320, 540, 760]; // IntegerFU, FPadder, FPmult, FPdiv op-box left
  groups.INT.x = rsBaseX[0];
  groups.ADD.x = rsBaseX[1];
  groups.MUL.x = rsBaseX[2];
  groups.DIV.x = rsBaseX[3];

  // --- Common Data Bus (drawn first, behind boxes) ---
  ctx.strokeStyle = WIRE_CDB;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ldX, cdbY);
  ctx.lineTo(sdX + 70, cdbY);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.font = boldFont;
  text(ctx, 'Common Data Bus', ldX, cdbY + 18);

  // Current cycle (big, center) like the original
  ctx.font = 'bold 14px Arial';
  text(ctx, String(logic.CycleNumCur), (opQueueX + registersX) / 2 + 20, rsTopY - 30);

  // --- OP Queue ---
  ctx.font = boldFont;
  text(ctx, 'OP Queue', opQueueX, topY - 8);
  const opEntries = opQueueEntries(logic);
  ctx.font = normalFont;
  for (let i = 0; i < logic.OpQueue; i++) {
    const y = topY + i * H;
    const entry = opEntries[i];
    drawBox(ctx, opQueueX, y, 120, H, entry ? colorFor(logic.instructionLineCur + i) : undefined);
    if (entry) text(ctx, entry, opQueueX + 4, y + 12);
  }

  // --- Registers (write-back list) ---
  ctx.font = boldFont;
  text(ctx, 'Registers', registersX, topY - 8);
  ctx.font = normalFont;
  const regCount = 10;
  for (let i = 0; i < regCount; i++) {
    const y = topY + i * H;
    const wb = logic.wbList[i];
    drawBox(ctx, registersX, y, 110, H, wb ? colorFor(wb.absoluteIndex) : undefined);
    if (wb) text(ctx, `${wb.operation}  ${wb.DestReg ?? ''}`, registersX + 4, y + 12);
  }

  // --- LD Buffer ---
  ctx.font = boldFont;
  text(ctx, 'LD Buffer (From Memory)', ldX, rsTopY - 90 - 8);
  ctx.font = normalFont;
  const ldCount = logic.architectureNum[0];
  const ldRows: (InstructionInfo | null)[] = new Array(ldCount).fill(null);
  for (const inst of logic.OperationInfoStation) {
    if (inst.op === 'LOAD' && (inst.state === 'Issue' || inst.state === 'EXE' || inst.state === 'ExeEnd')) {
      const s = ldRows.findIndex((r) => r === null);
      if (s !== -1) ldRows[s] = inst;
    }
  }
  for (let i = 0; i < ldCount; i++) {
    const y = rsTopY - 90 + i * H;
    const inst = ldRows[i];
    drawBox(ctx, ldX, y, 90, H, inst ? colorFor(inst.absoluteIndex) : undefined);
    if (inst) text(ctx, inst.operation, ldX + 4, y + 12);
  }

  // --- SD Buffer ---
  ctx.font = boldFont;
  text(ctx, 'SD Buffer (To Memory)', sdX - 20, rsTopY - 90 - 8);
  ctx.font = normalFont;
  const sdCount = logic.architectureNum[1];
  const sdRows: (InstructionInfo | null)[] = new Array(sdCount).fill(null);
  for (const inst of logic.OperationInfoStation) {
    if (inst.op === 'SAVE' && (inst.state === 'Issue' || inst.state === 'EXE' || inst.state === 'ExeEnd')) {
      const s = sdRows.findIndex((r) => r === null);
      if (s !== -1) sdRows[s] = inst;
    }
  }
  for (let i = 0; i < sdCount; i++) {
    const y = rsTopY - 90 + i * H;
    const inst = sdRows[i];
    drawBox(ctx, sdX, y, 90, H, inst ? colorFor(inst.absoluteIndex) : undefined);
    if (inst) text(ctx, inst.operation, sdX + 4, y + 12);
  }

  // --- Reservation station groups (op | src1 | src2) + FU label ---
  ctx.font = normalFont;
  for (const key of ['INT', 'ADD', 'MUL', 'DIV'] as const) {
    const g = groups[key];
    for (let r = 0; r < g.count; r++) {
      const y = rsTopY + r * H;
      const inst = g.rows[r];
      const fill = inst ? colorFor(inst.absoluteIndex) : undefined;
      drawBox(ctx, g.x, y, OP_W, H, fill); // op
      drawBox(ctx, g.x + OP_W, y, OPERAND_W, H, fill); // src1
      drawBox(ctx, g.x + OP_W + OPERAND_W, y, OPERAND_W, H, fill); // src2
      if (inst) {
        text(ctx, inst.operation, g.x + 3, y + 12);
        text(ctx, inst.s1 ?? '', g.x + OP_W + 3, y + 12);
        text(ctx, inst.s2 ?? '', g.x + OP_W + OPERAND_W + 3, y + 12);
      }
    }
    // FU label box under the group
    const fuY = rsTopY + g.count * H + 6;
    ctx.font = boldFont;
    drawBox(ctx, g.x, fuY, OP_W + 2 * OPERAND_W, H);
    text(ctx, g.label, g.x + 6, fuY + 12);
    ctx.font = normalFont;

    // Wire: FU -> CDB (down)
    const cx = g.x + (OP_W + 2 * OPERAND_W) / 2;
    arrowLine(ctx, cx, fuY + H, cx, cdbY, WIRE_CDB);
    // Wire: op from OP queue (green) into op box top
    arrowLine(ctx, g.x + OP_W / 2, rsTopY - 40, g.x + OP_W / 2, rsTopY, WIRE_OP);
    // Wire: src1 from registers (orange)
    arrowLine(ctx, g.x + OP_W + OPERAND_W / 2, rsTopY - 30, g.x + OP_W + OPERAND_W / 2, rsTopY, WIRE_SRC1);
    // Wire: src2 from registers (blue)
    arrowLine(ctx, g.x + OP_W + OPERAND_W + OPERAND_W / 2, rsTopY - 20, g.x + OP_W + OPERAND_W + OPERAND_W / 2, rsTopY, WIRE_SRC2);
  }

  // Horizontal feeders above the RS groups
  const leftCx = groups.INT.x + OP_W / 2;
  const rightCx = groups.DIV.x + OP_W / 2;
  ctx.strokeStyle = WIRE_OP;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(leftCx, rsTopY - 40); ctx.lineTo(rightCx, rsTopY - 40); ctx.stroke();
  // op feeder comes down from OP queue
  ctx.beginPath(); ctx.moveTo(opQueueX + 20, topY + logic.OpQueue * H); ctx.lineTo(opQueueX + 20, rsTopY - 40); ctx.stroke();

  const s1Left = groups.INT.x + OP_W + OPERAND_W / 2;
  const s1Right = groups.DIV.x + OP_W + OPERAND_W / 2;
  ctx.strokeStyle = WIRE_SRC1;
  ctx.beginPath(); ctx.moveTo(s1Left, rsTopY - 30); ctx.lineTo(s1Right, rsTopY - 30); ctx.stroke();

  const s2Left = groups.INT.x + OP_W + OPERAND_W + OPERAND_W / 2;
  const s2Right = groups.DIV.x + OP_W + OPERAND_W + OPERAND_W / 2;
  ctx.strokeStyle = WIRE_SRC2;
  ctx.beginPath(); ctx.moveTo(s2Left, rsTopY - 20); ctx.lineTo(s2Right, rsTopY - 20); ctx.stroke();
  // src feeders from registers block down
  ctx.beginPath(); ctx.moveTo(registersX + 10, topY + regCount * H); ctx.lineTo(registersX + 10, rsTopY - 20); ctx.stroke();
  ctx.lineWidth = 1;

  // CDB -> Registers and CDB -> SD (feedback up) in CDB color
  arrowLine(ctx, ldX + 45, rsTopY - 90 + ldCount * H, ldX + 45, cdbY, WIRE_CDB); // LD -> CDB
  arrowLine(ctx, sdX + 45, cdbY, sdX + 45, rsTopY - 90 + sdCount * H, WIRE_CDB); // CDB -> SD
  arrowLine(ctx, registersX + 100, cdbY, registersX + 100, topY + regCount * H, WIRE_CDB); // CDB -> Registers
}
