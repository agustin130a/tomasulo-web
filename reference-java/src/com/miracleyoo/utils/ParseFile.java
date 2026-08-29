package com.miracleyoo.utils;

import com.miracleyoo.Logic.MainLogic;

import java.io.*;
import java.util.*;

// Reference original parser (preserved). The executable web parser is
// web/src/engine/parseFile.ts.
public class ParseFile {
    public static Map< String, List<Object[]>> parseFile(File selectedFile) throws IOException {
        InputStream selectedFileStream = new FileInputStream(selectedFile);
        BufferedReader bufferedReader = new BufferedReader(new InputStreamReader(selectedFileStream));

        List<Object[]> dataList = new ArrayList<>();
        List<Object[]> textList = new ArrayList<>();
        Map< String, List<Object[]>> listFlagMap = new HashMap<>();
        Map< String, Integer> listCounter = new HashMap<>();

        listFlagMap.put("dataList", dataList);
        listFlagMap.put("textList", textList);
        listCounter.put("dataList", 0);
        listCounter.put("textList", -4);
        String listFlag = "dataList";

        String str;
        while((str = bufferedReader.readLine()) != null) {
            if(!str.startsWith(";") && !str.trim().isEmpty()){
                if(str.strip().equals(".data")){
                    listFlag = "dataList";
                }
                else if(str.strip().equals(".text")){
                    listFlag = "textList";
                }
                else{
                    if(listFlag.equals("textList")){
                        listCounter.put(listFlag, listCounter.get(listFlag) + 4);
                        MainLogic.InstructionFullList.add(str.strip());
                    }
                    listFlagMap.get(listFlag).add(new Object[]{String.format("%04X", listCounter.get(listFlag)), str.strip()});
                }
            }
        }
        return listFlagMap;
    }
}
