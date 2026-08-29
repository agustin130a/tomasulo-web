/**
 * Port of com.miracleyoo.Logic.MainLogic (the Tomasulo simulation engine).
 *
 * The engine is driven one clock cycle per parseStep() call, exactly like the
 * Java original. Method names and control flow mirror MainLogic.java so the
 * port can be diffed against the reference. See the port-tomasulo-engine skill
 * for the invariants (notably the ExeEnd -> WB fall-through).
 *
 * Fidelity target: the Issue / ExeStart-ExeEnd / WriteBack timing table and the
 * total cycle count must match HeadlessTest for every asm_code/*.s sample.
 * Numeric register/memory VALUES are not reproducible (Java random-inits
 * memory) and must not be asserted.
 */

// Config arrays, order {ld, sd, int, fpAdd, fpMul, fpDiv}
export const DEFAULT_ARCHITECTURE_NUM = [6, 6, 5, 4, 4, 3];
export const DEFAULT_ARCHITECTURE_CYCLE = [2, 2, 1, 2, 10, 40];

const InstructionState = ['Issue', 'EXE', 'ExeEnd', 'WB', 'End'] as const;

const AddOps = ['ADD', 'DADD', 'DADDU', 'ADDD', 'ADDDS', 'SUB', 'SUBS', 'SUBD', 'DSUB', 'DSUBU', 'SUBPS', 'SLT', 'SLTU', 'AND', 'OR', 'XOR', 'CVTDL'];
const MulOps = ['MUL', 'DMUL', 'DMULU', 'MULS', 'MULD', 'MULPS'];
const DivOps = ['DIV', 'DDIV', 'DDIVU', 'DIVS', 'DIVD', 'DIVPS'];
const IntOps = ['DADDI', 'DADDIU', 'SLTI', 'ANDI', 'ORI', 'XORI', 'DSLL', 'DSRL', 'DSRA', 'DSLLV', 'DSRLV', 'DSRAV'];
const SaveOps = ['SB', 'SH', 'SW', 'SD', 'SS', 'MTC0', 'MTC1', 'MFC0', 'MFC1'];
const LoadOps = ['LB', 'LH', 'LW', 'LD', 'LS', 'LBU', 'LHU', 'LWU'];
const BranchOps = ['BEQZ', 'BNEZ', 'BEQ', 'BNE', 'J', 'JR', 'JAL', 'JALR'];

export class InstructionInfo {
  operation = '';
  inst = '';
  op = '';
  state = '';

  s1 = '';
  s2 = '';

  issue = 0;
  exeStart = 0;
  exeEnd = 0;
  writeBack = 0;
  currentStageCycleNum = 1;
  absoluteIndex = 0;

  label: string | null = null;
  jumpLabel: string | null = null;
  DestReg: string | null = null;

  SourceReg1: string | null = null;
  SourceReg2: string | null = null;

  waiForIndexReg1: number | null = null;
  waiForIndexReg2: number | null = null;
  waiForIndexDest: number | null = null;

  ValueReg1: number | null = null;
  ValueReg2: number | null = null;
  ValueDest: number | null = null;
}

export class RegTemplate {
  value = 0;
  ready = true;
  occupyInstId = 0;
}

export class FUTemplate {
  busy = false;
  occupyInstId = 0;
}

function contains(arr: string[], v: string): boolean {
  return arr.indexOf(v) !== -1;
}

export interface EngineOptions {
  architectureNum?: number[];
  architectureCycle?: number[];
  /** Fill memory with this value (deterministic). Java uses random 1..100. */
  memoryFill?: number;
}

export class MainLogic {
  architectureNum: number[];
  architectureCycle: number[];
  multiStepNum = 3;
  OpQueue = 10;
  Memory: number[] = new Array(100);

  isEnd = false;
  CycleNumCur = 0;
  instructionLineCur = 0;
  totalInstructionNum = 0;
  statisticsInfo: number[] = new Array(9).fill(0);

  InstructionFullList: string[];

  private Type2FUsMap: Map<string, FUTemplate[]> = new Map();
  IntRegs: RegTemplate[] = [];
  FloatRegs: RegTemplate[] = [];
  // LIFO: newest instruction at index 0 (addFirst). Timing table read newest-first.
  OperationInfoStation: InstructionInfo[] = [];
  OperationInfoStationActualSize = 0;
  wbList: InstructionInfo[] = [];

  private tempOperationInfo: InstructionInfo = new InstructionInfo();
  private OperationMapper: Map<string, string> = new Map();
  private label2index: Map<string, number> = new Map();

  private LoadFUs: FUTemplate[];
  private SaveFUs: FUTemplate[];
  private IntFUs: FUTemplate[];
  private AddFUs: FUTemplate[];
  private MulFUs: FUTemplate[];
  private DivFUs: FUTemplate[];

  constructor(instructionFullList: string[], opts: EngineOptions = {}) {
    this.InstructionFullList = instructionFullList;
    this.architectureNum = (opts.architectureNum ?? DEFAULT_ARCHITECTURE_NUM).slice();
    this.architectureCycle = (opts.architectureCycle ?? DEFAULT_ARCHITECTURE_CYCLE).slice();

    this.mapListItems(AddOps, 'ADD');
    this.mapListItems(MulOps, 'MUL');
    this.mapListItems(DivOps, 'DIV');
    this.mapListItems(IntOps, 'INT');
    this.mapListItems(SaveOps, 'SAVE');
    this.mapListItems(LoadOps, 'LOAD');
    this.mapListItems(BranchOps, 'BRA');
    this.mapListItems(['NOP'], 'NOP');
    this.mapListItems(['HALT'], 'HALT');

    for (let i = 0; i < 32; i++) this.IntRegs.push(new RegTemplate());
    for (let i = 0; i < 32; i++) this.FloatRegs.push(new RegTemplate());

    this.LoadFUs = this.makeFUs(this.architectureNum[0]);
    this.SaveFUs = this.makeFUs(this.architectureNum[1]);
    this.IntFUs = this.makeFUs(this.architectureNum[2]);
    this.AddFUs = this.makeFUs(this.architectureNum[3]);
    this.MulFUs = this.makeFUs(this.architectureNum[4]);
    this.DivFUs = this.makeFUs(this.architectureNum[5]);

    this.Type2FUsMap.set('ADD', this.AddFUs);
    this.Type2FUsMap.set('MUL', this.MulFUs);
    this.Type2FUsMap.set('DIV', this.DivFUs);
    this.Type2FUsMap.set('SAVE', this.SaveFUs);
    this.Type2FUsMap.set('LOAD', this.LoadFUs);
    this.Type2FUsMap.set('INT', this.IntFUs);

    // Java random-inits memory 1..100. For deterministic web runs we fill with a
    // constant (default 1). This affects VALUES only, never the timing table.
    const fill = opts.memoryFill ?? 1;
    for (let i = 0; i < 100; i++) this.Memory[i] = fill;
  }

  private makeFUs(n: number): FUTemplate[] {
    const a: FUTemplate[] = [];
    for (let i = 0; i < n; i++) a.push(new FUTemplate());
    return a;
  }

  private mapListItems(inputList: string[], listName: string): void {
    for (const operand of inputList) this.OperationMapper.set(operand, listName);
  }

  initLabelMap(): void {
    for (let i = 0; i < this.InstructionFullList.length; i++) {
      const operandLine = this.InstructionFullList[i].split(';')[0].trim();
      if (operandLine.split(':').length > 1) {
        this.label2index.set(operandLine.split(':')[0].trim(), i);
      }
    }
  }

  private judgeIssue(): boolean {
    let flag = false;
    const type_ = this.OperationMapper.get(this.tempOperationInfo.operation)!;

    if (type_ === 'HALT') {
      this.instructionLineCur++;
      this.isEnd = true;
      return false;
    }
    if (type_ === 'NOP') {
      this.instructionLineCur++;
      return false;
    }
    if (type_ === 'BRA') {
      flag = true;
    } else {
      for (const FUs of this.Type2FUsMap.get(type_)!) {
        if (!FUs.busy) {
          flag = true;
          break;
        }
      }
    }

    if (!flag) return false;

    if (this.OperationInfoStationActualSize < this.OpQueue) {
      return true;
    } else if (this.OperationInfoStation[this.OperationInfoStationActualSize - 1].state === 'End') {
      return true;
    } else {
      return false;
    }
  }

  private judgeExeStart(i: number): boolean {
    let tempIndex = 0;
    const tempOperation = this.OperationInfoStation[i];
    if (tempOperation.waiForIndexReg1 !== null) {
      tempIndex = tempOperation.waiForIndexReg1;
      if (this.OperationInfoStation[this.OperationInfoStation.length - 1 - tempIndex].state === InstructionState[4]) {
        tempOperation.ValueReg1 = this.getReg(this.OperationInfoStation.length - 1 - tempIndex, 'Dest').value;
      }
    }
    if (tempOperation.waiForIndexReg2 !== null) {
      tempIndex = tempOperation.waiForIndexReg2;
      if (this.OperationInfoStation[this.OperationInfoStation.length - 1 - tempIndex].state === InstructionState[4]) {
        tempOperation.ValueReg2 = this.getReg(this.OperationInfoStation.length - 1 - tempIndex, 'Dest').value;
      }
    }
    if (tempOperation.waiForIndexDest !== null) {
      tempIndex = tempOperation.waiForIndexDest;
      if (this.OperationInfoStation[this.OperationInfoStation.length - 1 - tempIndex].state === InstructionState[4]) {
        tempOperation.ValueDest = this.getReg(this.OperationInfoStation.length - 1 - tempIndex, 'Dest').value;
      }
    }
    if (
      (tempOperation.ValueReg1 !== null || tempOperation.waiForIndexReg1 === null) &&
      (tempOperation.ValueReg2 !== null || tempOperation.waiForIndexReg2 === null) &&
      (tempOperation.ValueDest !== null || tempOperation.waiForIndexDest === null)
    ) {
      return true;
    }
    return false;
  }

  private judgeExeEnd(i: number): boolean {
    let flag = true;
    for (let j = i; j < this.OperationInfoStationActualSize; j++) {
      if (this.OperationInfoStation[j].exeEnd === this.CycleNumCur) {
        flag = false;
        break;
      }
    }
    return flag;
  }

  private judgeWB(start: number): boolean {
    let flag = true;
    for (let i = start; i < this.OperationInfoStationActualSize; i++) {
      if (this.OperationInfoStation[i].writeBack === this.CycleNumCur) {
        flag = false;
        break;
      }
    }
    return flag;
  }

  private parseInstruction(operandLineIn: string): void {
    this.tempOperationInfo = new InstructionInfo();
    let operandLine = operandLineIn.split(';')[0].trim();
    this.tempOperationInfo.inst = operandLine;

    operandLine = operandLine.replace(/[$]/g, '');
    if (operandLine.split(':').length > 1) {
      this.tempOperationInfo.label = operandLine.split(':')[0];
      operandLine = operandLine.split(':')[1].trim();
    }

    const separateEmpty = operandLine.split(/\s+/);
    const operand = separateEmpty[0].replace(/\./g, '').toUpperCase().trim();
    const operandType = this.OperationMapper.get(operand)!;
    this.tempOperationInfo.op = operandType;
    this.tempOperationInfo.operation = operand;
    if (separateEmpty.length <= 1) {
      return; // HALT, NOP
    }

    if (operandType === 'BRA') {
      this.tempOperationInfo.jumpLabel = separateEmpty[1].trim();
      return;
    }

    const srcTemp = separateEmpty[1].toUpperCase().trim();
    const regParts = srcTemp.split(',');
    this.tempOperationInfo.DestReg = regParts[0];

    if (regParts[0].toUpperCase().startsWith('R') || regParts[0].toUpperCase().startsWith('F')) {
      this.tempOperationInfo.DestReg = regParts[0].trim().toUpperCase();
    } else {
      throw new Error('Destination Register wrong');
    }

    if (contains(['LOAD', 'SAVE'], operandType)) {
      const address_ = regParts[1].split('(');
      address_[1] = address_[1].replace(/\)/g, '');

      if (address_[0].replace(/\d+/g, '').length === 0) {
        if (address_[0].length === 0) {
          this.tempOperationInfo.ValueReg1 = 0;
        } else {
          this.tempOperationInfo.ValueReg1 = parseInt(address_[0], 10);
        }
      } else {
        this.tempOperationInfo.ValueReg1 = 0;
      }
      if (address_[1].toUpperCase().startsWith('R') || address_[1].toUpperCase().startsWith('F')) {
        this.tempOperationInfo.SourceReg2 = address_[1];
      } else if (address_[1].trim().replace(/\d+/g, '').length === 0) {
        this.tempOperationInfo.ValueReg2 = parseInt(address_[1], 10);
      } else {
        this.tempOperationInfo.ValueReg2 = 0;
      }
      return;
    }

    if (regParts[1].toUpperCase().startsWith('R') || regParts[1].toUpperCase().startsWith('F')) {
      this.tempOperationInfo.SourceReg1 = regParts[1];
    } else if (regParts[1].trim().replace(/\d+/g, '').length === 0) {
      this.tempOperationInfo.ValueReg1 = parseInt(regParts[1], 10);
    } else {
      this.tempOperationInfo.ValueReg1 = 0;
    }

    if (regParts[2].toUpperCase().startsWith('R') || regParts[2].toUpperCase().startsWith('F')) {
      this.tempOperationInfo.SourceReg2 = regParts[2];
    } else if (regParts[2].trim().replace(/\d+/g, '').length === 0) {
      this.tempOperationInfo.ValueReg2 = parseInt(regParts[2], 10);
    } else {
      this.tempOperationInfo.ValueReg2 = 0;
    }
    this.tempOperationInfo.s1 = regParts[1];
    this.tempOperationInfo.s2 = regParts[2];
  }

  private updateInstructionInfoWhenIssue(): void {
    if (this.OperationInfoStationActualSize >= this.OpQueue) {
      this.OperationInfoStationActualSize--;
    }
    this.OperationInfoStation.unshift(this.tempOperationInfo); // addFirst
    const fistOperation = this.OperationInfoStation[0];
    fistOperation.issue = this.CycleNumCur;
    fistOperation.state = InstructionState[0];
    fistOperation.absoluteIndex = this.totalInstructionNum;
    fistOperation.currentStageCycleNum = 1;
    if (fistOperation.SourceReg1 !== null) {
      if (this.getReg(0, 'Src1').ready) {
        fistOperation.ValueReg1 = this.getReg(0, 'Src1').value;
      } else {
        fistOperation.waiForIndexReg1 = this.getReg(0, 'Src1').occupyInstId;
      }
    }
    if (fistOperation.SourceReg2 !== null) {
      if (this.getReg(0, 'Src2').ready) {
        fistOperation.ValueReg2 = this.getReg(0, 'Src2').value;
      } else {
        fistOperation.waiForIndexReg2 = this.getReg(0, 'Src2').occupyInstId;
      }
    }
    if (fistOperation.DestReg !== null) {
      if (this.OperationMapper.get(fistOperation.operation) !== 'SAVE') {
        this.getReg(0, 'Dest').ready = false;
        this.getReg(0, 'Dest').occupyInstId = fistOperation.absoluteIndex;
      } else {
        if (this.getReg(0, 'Dest').ready) {
          fistOperation.ValueDest = this.getReg(0, 'Dest').value;
        } else {
          fistOperation.waiForIndexDest = this.getReg(0, 'Dest').occupyInstId;
        }
      }
    }
  }

  private checkAllInstructionMember(): void {
    for (let i = this.OperationInfoStationActualSize - 1; i >= 0; i--) {
      const inst = this.OperationInfoStation[i];
      switch (inst.state) {
        case 'Issue':
          if (this.CycleNumCur - inst.issue >= inst.currentStageCycleNum) {
            if (this.judgeExeStart(i)) {
              inst.state = InstructionState[1];
              inst.exeStart = this.CycleNumCur;
              this.SetExeOpsNum(i);
            }
          }
          break;
        case 'EXE':
          if (this.CycleNumCur - inst.exeStart >= inst.currentStageCycleNum) {
            if (this.judgeExeEnd(i)) {
              inst.state = InstructionState[2];
              inst.exeEnd = this.CycleNumCur;
              this.ExeOps(i);
              inst.currentStageCycleNum = 1;
            }
          }
          break;
        case 'ExeEnd':
          if (this.CycleNumCur - inst.exeEnd >= inst.currentStageCycleNum) {
            if (this.judgeWB(i)) {
              inst.state = InstructionState[3];
              inst.writeBack = this.CycleNumCur;
              inst.currentStageCycleNum = 1;
              if (inst.op !== 'BRA' && inst.op !== 'SAVE') {
                this.wbList.unshift(inst);
              }
            }
          }
        // FALL THROUGH into WB (no break) — matches MainLogic.java exactly.
        case 'WB':
          if (this.CycleNumCur - inst.writeBack >= inst.currentStageCycleNum) {
            inst.state = InstructionState[4];
          }
          this.WBOps(i);
          break;
        case 'End':
          break;
      }
    }
  }

  private SetExeOpsNum(operandInfoIndex: number): void {
    const operandType = this.OperationMapper.get(this.OperationInfoStation[operandInfoIndex].operation)!;
    const inst = this.OperationInfoStation[operandInfoIndex];
    switch (operandType) {
      case 'DIV':
        inst.currentStageCycleNum = this.architectureCycle[5];
        break;
      case 'MUL':
        inst.currentStageCycleNum = this.architectureCycle[4];
        break;
      case 'LOAD':
        inst.currentStageCycleNum = this.architectureCycle[0];
        break;
      case 'SAVE':
        inst.currentStageCycleNum = this.architectureCycle[1];
        break;
      case 'BRA':
        inst.currentStageCycleNum = 1;
        break;
      default:
        if (operandType === 'ADD') {
          inst.currentStageCycleNum = this.architectureCycle[3];
        } else {
          inst.currentStageCycleNum = this.architectureCycle[2];
        }
    }
  }

  private ExeOps(operandInfoIndex: number): void {
    const operandType = this.OperationMapper.get(this.OperationInfoStation[operandInfoIndex].operation)!;
    switch (operandType) {
      case 'DIV':
        this.OpsDIV(operandInfoIndex);
        break;
      case 'MUL':
        this.OpsMUL(operandInfoIndex);
        break;
      case 'LOAD':
        this.OpsLOAD(operandInfoIndex);
        break;
      case 'SAVE':
        this.OpsSAVE(operandInfoIndex);
        break;
      case 'BRA':
        this.OpsBRANCH(operandInfoIndex);
        break;
      default:
        if (operandType.includes('ADD')) {
          this.OpsADD(operandInfoIndex);
        } else if (operandType.includes('SUB')) {
          this.OpsSUB(operandInfoIndex);
        } else if (operandType.includes('SLT')) {
          this.OpsSLT(operandInfoIndex);
        } else if (operandType.includes('CVT')) {
          this.OpsCVT(operandInfoIndex);
        } else if (operandType.includes('AND') || operandType.includes('OR')) {
          this.OpsLogic(operandInfoIndex);
        }
    }
  }

  private WBOps(i: number): void {
    const inst = this.OperationInfoStation[i];
    if (inst.DestReg !== null && this.getReg(i, 'Dest').occupyInstId === inst.absoluteIndex) {
      this.getReg(i, 'Dest').ready = true;
    }
    if (inst.SourceReg1 !== null && this.getReg(i, 'Src1').occupyInstId === inst.absoluteIndex) {
      this.getReg(i, 'Src1').ready = true;
    }
    if (inst.SourceReg2 !== null && this.getReg(i, 'Src2').occupyInstId === inst.absoluteIndex) {
      this.getReg(i, 'Src2').ready = true;
    }
  }

  private OpsADD(i: number): void {
    this.getReg(i, 'Dest').value = (this.OperationInfoStation[i].ValueReg1 ?? 0) + (this.OperationInfoStation[i].ValueReg2 ?? 0);
    this.getReg(i, 'Dest').ready = true;
  }

  private OpsSUB(i: number): void {
    this.getReg(i, 'Dest').value = (this.OperationInfoStation[i].ValueReg1 ?? 0) - (this.OperationInfoStation[i].ValueReg2 ?? 0);
    this.getReg(i, 'Dest').ready = true;
  }

  private OpsSLT(_i: number): void {
    // empty stub, matches Java
  }

  private OpsLogic(_i: number): void {
    // AND, OR, XOR — empty stub, matches Java
  }

  private OpsCVT(_i: number): void {
    // empty stub, matches Java
  }

  private OpsMUL(i: number): void {
    this.getReg(i, 'Dest').value = (this.OperationInfoStation[i].ValueReg1 ?? 0) * (this.OperationInfoStation[i].ValueReg2 ?? 0);
    this.getReg(i, 'Dest').ready = true;
  }

  private OpsDIV(i: number): void {
    this.getReg(i, 'Dest').value = (this.OperationInfoStation[i].ValueReg1 ?? 0) / (this.OperationInfoStation[i].ValueReg2 ?? 0);
    this.getReg(i, 'Dest').ready = true;
  }

  private OpsBRANCH(i: number): void {
    const target = this.label2index.get(this.OperationInfoStation[i].jumpLabel ?? '');
    if (target === undefined) {
      this.isEnd = true;
    } else {
      this.instructionLineCur = target;
    }
  }

  private OpsLOAD(i: number): void {
    const inst = this.OperationInfoStation[i];
    const addr = Math.trunc((inst.ValueReg1 ?? 0) + (inst.ValueReg2 ?? 0)) % 100;
    this.setRegValue(i, 'Dest', this.Memory[addr]);
  }

  private OpsSAVE(i: number): void {
    const inst = this.OperationInfoStation[i];
    const addr = Math.trunc((inst.ValueReg1 ?? 0) + (inst.ValueReg2 ?? 0)) % 100;
    this.Memory[addr] = inst.ValueDest ?? 0;
  }

  private getReg(i: number, type: 'Dest' | 'Src1' | 'Src2'): RegTemplate {
    let regName: string;
    if (type === 'Dest') regName = this.OperationInfoStation[i].DestReg!;
    else if (type === 'Src1') regName = this.OperationInfoStation[i].SourceReg1!;
    else regName = this.OperationInfoStation[i].SourceReg2!;

    const index_ = parseInt(regName.replace(/\D+/g, ''), 10);
    if (regName.toUpperCase().startsWith('R')) return this.IntRegs[index_];
    if (regName.toUpperCase().startsWith('F')) return this.FloatRegs[index_];
    throw new Error('getRegValue Type Error');
  }

  private setRegValue(i: number, type: 'Dest' | 'Src1' | 'Src2', value: number): void {
    let regName: string;
    if (type === 'Dest') regName = this.OperationInfoStation[i].DestReg!;
    else if (type === 'Src1') regName = this.OperationInfoStation[i].SourceReg1!;
    else regName = this.OperationInfoStation[i].SourceReg2!;

    const index_ = parseInt(regName.replace(/\D+/g, ''), 10);
    if (regName.toUpperCase().startsWith('R')) {
      this.IntRegs[index_].value = value;
      this.IntRegs[index_].ready = true;
    } else if (regName.toUpperCase().startsWith('F')) {
      this.FloatRegs[index_].value = value;
      this.FloatRegs[index_].ready = true;
    } else {
      throw new Error('getRegValue Type Error');
    }
  }

  /** The core logic. Called once per clock cycle. */
  parseStep(): void {
    if (this.instructionLineCur >= this.InstructionFullList.length - 1) {
      this.isEnd = true;
    }
    if (!this.isEnd) {
      this.parseInstruction(this.InstructionFullList[this.instructionLineCur]);
      const issueAvailable = this.judgeIssue();
      if (issueAvailable) {
        this.updateInstructionInfoWhenIssue();
        this.OperationInfoStationActualSize++;
        this.instructionLineCur++;
        this.totalInstructionNum++;
      } else {
        this.statisticsInfo[3]++; // structural stall
      }
    }
    this.checkAllInstructionMember();
    this.CycleNumCur++;
    this.statisticsInfo[0] = this.CycleNumCur;
    this.statisticsInfo[1] = this.totalInstructionNum;
  }

  /** True when every issued instruction reached the terminal End state. */
  allEnded(): boolean {
    if (this.OperationInfoStation.length === 0) return false;
    for (const ii of this.OperationInfoStation) {
      if (ii.state !== 'End') return false;
    }
    return true;
  }
}
