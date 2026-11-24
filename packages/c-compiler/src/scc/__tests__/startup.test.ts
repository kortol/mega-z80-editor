import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "@mz80/assembler";
import { createLogger, LinkMemoryLayout, MemoryLayoutReport, Z80DebugCore } from "@mz80/core";
import { compileSccProgram } from "../compileProgram";
import { configuredStartupSource, RuntimeStartupOptions } from "../startup";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { translateSccAsm } from "../translateAsm";
import { BundledRuntimeSpec } from "../runtime";
const rom:LinkMemoryLayout={code:{start:0x4000,size:0x4000,kind:"rom"},ram:{start:0xC000,size:0x3000},stack:{top:0xEF00,size:0x400},heap:{start:0xD000,size:0x800}};
const ram:LinkMemoryLayout={code:{start:0x100,size:0x8000,kind:"ram"},ram:{start:0x100,size:0xEF00},stack:{top:0xEF00,size:0x400},heap:{start:0xD000,size:0x800}};
function run(source:string,memory:LinkMemoryLayout,runtime:BundledRuntimeSpec,abi:"ts-internal"|"ts-static-frame",startup:RuntimeStartupOptions|false={},returnToCaller=false){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mz80-startup-"));
  try{
    const inputFile=path.join(directory,"probe.c"),outputFile=path.join(directory,"probe.bin"),libraries:string[]=[];
    fs.writeFileSync(inputFile,source);
    if(runtime.platform==="raw"){
      const assembly=path.join(directory,"hooks.asm"),object=path.join(directory,"hooks.rel");
      fs.writeFileSync(assembly,translateSccAsm([
        ".globl __mz80_raw_putc", ".globl __mz80_raw_getc", ".globl __mz80_raw_exit", ".area _CODE",
        "__mz80_raw_putc:","ld hl,#2","add hl,sp","ld e,(hl)","ld c,#2","call 5","ld l,e","ld h,#0","ret",
        "__mz80_raw_getc:","ld hl,#0","ret","__mz80_raw_exit:","ld c,#0","call 5","ret",
      ].join("\n")));
      expect(assemble(createLogger("quiet"),assembly,object,{relVersion:2}).errors).toEqual([]);libraries.push(object);
    }
    compileSccProgram(createLogger("quiet"),{inputFile,outputFile,tempDir:directory,keepTemps:true,runtime,memory,startup,libraries,map:true},{compilerAdapter:new TsSccCompilerAdapter({abi})});
    const report:MemoryLayoutReport=JSON.parse(fs.readFileSync(path.join(directory,"probe.memory.json"),"utf8"));
    const core=new Z80DebugCore(false);core.setCpm22Enabled(true);core.setAllowOutOfImage(true);
    core.writeMemory(report.ram.start,new Uint8Array(report.ram.size).fill(0xA5));
    const image=fs.readFileSync(outputFile);core.loadImage(image,report.code.start);core.setEntry(report.code.start);
    // A reset-style raw target may start with SP pointing into ROM.
    core.setRegisters({sp:runtime.platform==="raw"?0x4001:0xF200,ix:0x1234,iy:0x5678});
    if(returnToCaller){core.writeMemory(0xF200,[0,1]);core.writeMemory(0x100,[0x22,0,2,0x0E,0,0xCD,5,0]);}
    expect(core.run(3000000).reason).toBe("BDOS 0: terminate");
    if(report.code.kind==="rom")expect(core.readMemory(report.code.start,image.length)).toEqual([...image]);
    return {output:core.getOutput(),registers:core.getRegisters(),returnBytes:core.readMemory(0x200,2),report};
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
const variants=(["ts-internal","ts-static-frame"] as const).flatMap(abi=>(["cpm","raw"] as const).flatMap(platform=>[ram,...(platform==="raw"?[rom]:[])].map(memory=>({abi,platform,memory}))));
test.each(variants)("startup copies DATA / pointers, clears poisoned BSS, initializes heap: %o",({abi,platform,memory})=>{
  const result=run("#include <stdio.h>\n#include <stdlib.h>\nint initialized=65;int untouched;int *pointer=&initialized;char text[2]={66,0};int boot(){char *block;putchar(initialized);puts(text);putchar(untouched+67);*pointer=68;putchar(initialized);block=malloc(8);block[0]=69;putchar(block[0]);free(block);return 7;}",memory,{platform,profile:"full"},abi,{entry:"boot",initHeap:true});
  expect(result.output).toBe("AB\nCDE");
  expect(result.report.data.loadAddress).toBe(memory.code.kind==="rom"?result.report.text.start+result.report.text.size:result.report.data.start);
  expect(result.report.stack.start).toBe(0xEB00);
});
test.each(["ts-internal","ts-static-frame"] as const)("MSX return restores original SP / IX / IY through %s",abi=>{
  const result=run("int initialized=65;int untouched;int main(){initialized=initialized+untouched;return initialized;}",rom,{platform:"msx-bios",profile:"lite",exit:"return"},abi,{},true);
  // RET consumes the caller's return address; BDOS trapping does not push SP.
  expect(result.registers.sp).toBe(0xF202);expect(result.registers.ix).toBe(0x1234);expect(result.registers.iy).toBe(0x5678);
  expect(result.returnBytes).toEqual([65,0]);
});
test("zero-sized DATA/BSS skip LDIR/clear loops and explicit manual startup remains supported",()=>{
  expect(run("int main(){return 0;}",ram,{platform:"cpm",profile:"lite"},"ts-internal").report.data.size).toBe(0);
  expect(run("int main(){return 0;}",ram,{platform:"cpm",profile:"lite"},"ts-internal",false).output).toBe("");
});
test("startup validates runtime / heap / cartridge / entry contracts",()=>{
  expect(()=>configuredStartupSource("cpmcrt",ram)).toThrow("structured");
  expect(()=>configuredStartupSource({platform:"cpm",profile:"lite"},ram,{initHeap:true})).toThrow("initHeap");
  expect(()=>configuredStartupSource({platform:"raw",profile:"lite"},rom,{msxCartridge:true})).toThrow("msxCartridge");
  expect(()=>configuredStartupSource({platform:"cpm",profile:"lite"},ram,{entry:"bad\nret"})).toThrow("identifier");
  expect(()=>configuredStartupSource({platform:"cpm",profile:"lite"},ram,{unknown:true} as any)).toThrow("invalid option");
  expect(()=>run("int main(int value){return value;}",ram,{platform:"cpm",profile:"lite"},"ts-internal")).toThrow("int function(void)");
});
