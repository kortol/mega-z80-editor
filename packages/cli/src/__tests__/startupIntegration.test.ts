import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, Z80DebugCore } from "@mz80/core";
import { buildProjectTarget, loadProjectConfig } from "../project";
import { compileSccProgramFromCli } from "../cli/mz80-cc";
const memory={code:{start:256,size:32768,kind:"ram" as const},ram:{start:256,size:61184},stack:{top:61184,size:1024},heap:{start:53248,size:2048}};
test.each(["internal","static-frame"] as const)("YAML startup and target-config CLI through %s",abi=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mz80-target-cli-"));
  try{
    const input=path.join(directory,"main.c"),output=path.join(directory,"main.com"),config=path.join(directory,"mz80.yaml");
    fs.writeFileSync(input,"#include <stdio.h>\n#include <stdlib.h>\nint value=65;int blank;int boot(){char *p;p=malloc(8);p[0]=value+blank;putchar(p[0]);free(p);return 0;}");
    fs.writeFileSync(config,JSON.stringify({cc:{compiler:"ts",tsAbi:abi,runtime:{platform:"cpm",profile:"full"},startup:{entry:"boot",initHeap:true}},link:{com:true,memory},targets:{demo:{output:"main.com",modules:["main.c"]}}}));
    buildProjectTarget(config,loadProjectConfig(config),"demo",createLogger("quiet"));
    const run=()=>{
      const core=new Z80DebugCore(false);core.setCpm22Enabled(true);core.setAllowOutOfImage(true);
      core.writeMemory(0x100,new Uint8Array(0xEF00).fill(0xA5));core.loadImage(fs.readFileSync(output),0x100);core.setEntry(0x100);
      expect(core.run(200000).reason).toBe("BDOS 0: terminate");expect(core.getOutput()).toBe("A");
      expect(JSON.parse(fs.readFileSync(output.replace(/\.com$/,'.memory.json'),"utf8")).heap.start).toBe(53248);
    };
    run();
    const targetConfig=path.join(directory,"target.json");fs.writeFileSync(targetConfig,JSON.stringify({memory,startup:{entry:"boot",initHeap:true}}));
    compileSccProgramFromCli(createLogger("quiet"),input,output,{compiler:"ts",tsAbi:abi,runtime:{platform:"cpm",profile:"full"},targetConfig});run();
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test("startup rejects a custom CRT override instead of silently replacing it",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mz80-target-override-"));
  try{
    const config={cc:{compiler:"ts" as const,runtime:{platform:"cpm" as const,profile:"lite" as const}},link:{memory},targets:{demo:{output:"main.bin",modules:[],runtimeObject:"custom.rel"}}};
    expect(()=>buildProjectTarget(path.join(directory,"mz80.yaml"),config,"demo",createLogger("quiet"))).toThrow("runtimeObject");
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
