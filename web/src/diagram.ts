/**
 * Canvas renderer for the Tomasulo state: draws the instruction queue with the
 * current pipeline stage of each instruction (Issue / EXE / ExeEnd / WB / End).
 *
 * The canvas is aria-hidden; the accessible equivalent is the timing table and
 * the registers list in the DOM (see web-a11y-review skill).
 */
import type { MainLogic } from './engine/mainLogic.ts';

const STAGE_COLORS: Record<string, string> = {
  Issue: '#8ecae6',
  EXE: '#ffb703',
  ExeEnd: '#fb8500',
  WB: '#90be6d',
  End: '#adb5bd',
};

const STAGE_LABEL: Record<string, string> = {
  Issue: 'Issue',
  EXE: 'Execute',
  ExeEnd: 'Exe end',
  WB: 'Write back',
  End: 'Done',
};

export function drawDiagram(canvas: HTMLCanvasElement, logic: MainLogic): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1d2433';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#e9ecef';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`Ciclo actual: ${logic.CycleNumCur}`, 16, 24);

  // Legend
  const stages = ['Issue', 'EXE', 'ExeEnd', 'WB', 'End'];
  let lx = 200;
  for (const s of stages) {
    ctx.fillStyle = STAGE_COLORS[s];
    ctx.fillRect(lx, 12, 14, 14);
    ctx.fillStyle = '#e9ecef';
    ctx.fillText(STAGE_LABEL[s], lx + 20, 24);
    lx += 130;
  }

  // Instruction rows: OperationInfoStation is LIFO (newest first). Draw oldest
  // at the top for readability.
  const insts = logic.OperationInfoStation.slice().reverse();
  const rowH = 30;
  const top = 48;
  const maxRows = Math.floor((H - top - 10) / rowH);

  ctx.font = '13px ui-monospace, monospace';
  insts.slice(0, maxRows).forEach((ii, idx) => {
    const y = top + idx * rowH;
    const color = STAGE_COLORS[ii.state] ?? '#495057';

    ctx.fillStyle = '#2b3245';
    ctx.fillRect(12, y, W - 24, rowH - 4);

    // stage chip
    ctx.fillStyle = color;
    ctx.fillRect(16, y + 4, 12, rowH - 12);

    ctx.fillStyle = '#e9ecef';
    const inst = ii.inst.length > 40 ? ii.inst.slice(0, 39) + '…' : ii.inst;
    ctx.fillText(inst, 36, y + 19);

    ctx.fillStyle = '#ced4da';
    const timing = `I:${ii.issue}  E:${ii.exeStart}-${ii.exeEnd}  W:${ii.writeBack}  [${STAGE_LABEL[ii.state] ?? ii.state}]`;
    ctx.fillText(timing, W - 24 - ctx.measureText(timing).width, y + 19);
  });

  if (insts.length === 0) {
    ctx.fillStyle = '#adb5bd';
    ctx.fillText('Sin instrucciones emitidas todavía. Pulsá "Paso" para comenzar.', 36, top + 20);
  }
}
