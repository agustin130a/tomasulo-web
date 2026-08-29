import com.miracleyoo.Logic.MainLogic;
import com.miracleyoo.Logic.MainLogic.InstructionInfo;
import com.miracleyoo.utils.ParseFile;

import java.io.File;
import java.util.List;
import java.util.Map;

/**
 * Headless harness: loads a .s file, runs the Tomasulo logic cycle by cycle
 * (same parseStep() the GUI uses) and prints the Issue/Exe/WB timing table.
 * Used to generate the golden baselines in web/test/golden that validate the
 * TypeScript port.
 */
public class HeadlessTest {
    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.out.println("Usage: HeadlessTest <file.s> [maxCycles]");
            System.exit(2);
        }
        File f = new File(args[0]);
        int maxCycles = args.length > 1 ? Integer.parseInt(args[1]) : 200;

        MainLogic.InstructionFullList.clear();

        Map<String, List<Object[]>> parsed = ParseFile.parseFile(f);
        int textLines = parsed.get("textList").size();
        System.out.println("=== FILE: " + f.getName() + " ===");
        System.out.println("Parsed .text lines: " + textLines
                + " | InstructionFullList: " + MainLogic.InstructionFullList.size());

        MainLogic logic = new MainLogic();
        logic.initLabelMap();
        logic.CycleNumCur = 0;

        int guard = 0;
        while (guard < maxCycles) {
            logic.parseStep();
            guard++;
            if (logic.isEnd && allEnded(logic)) {
                break;
            }
        }

        System.out.println("Finished. isEnd=" + logic.isEnd
                + " | allEnded=" + allEnded(logic)
                + " | cycles=" + logic.CycleNumCur
                + " | issuedInstr=" + logic.totalInstructionNum
                + " | guardHit=" + (guard >= maxCycles));

        System.out.printf("%-28s %6s %10s %6s%n", "Instruction", "Issue", "Exe", "WB");
        for (InstructionInfo ii : logic.OperationInfoStation) {
            String exe = (ii.exeStart == 0 && ii.exeEnd == 0)
                    ? "-" : (ii.exeStart + "-" + ii.exeEnd);
            System.out.printf("%-28s %6d %10s %6d%n",
                    ii.inst, ii.issue, exe, ii.writeBack);
        }
        System.out.println();

        if (logic.totalInstructionNum == 0) {
            System.out.println("RESULT: FAIL (no instructions issued)");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    private static boolean allEnded(MainLogic logic) {
        if (logic.OperationInfoStation.isEmpty()) return false;
        for (InstructionInfo ii : logic.OperationInfoStation) {
            if (!"End".equals(ii.state)) return false;
        }
        return true;
    }
}
