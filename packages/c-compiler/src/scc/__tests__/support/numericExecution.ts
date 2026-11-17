import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble } from "@mz80/assembler";
import { createLogger, link, Z80DebugCore } from "@mz80/core";
import { compileSccProgram } from "../../compileProgram";
import { TsSccCompilerAdapter } from "../../tsCompilerAdapter";
import { BundledRuntimeSpec, getBundledRuntimeDefines, getBundledRuntimeIncludeDirs, getBundledSccRuntime } from "../../runtime";
import { translateSccAsm } from "../../translateAsm";
export type NumericAbi="ts-internal"|"ts-static-frame";
export function executeNumeric(source:string,abi:NumericAbi,runtime:BundledRuntimeSpec,sourceRuntime=false){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mz80-numeric-execution-'));
  try{
    const inputFile=path.join(directory,'probe.c'),outputFile=path.join(directory,'probe.com');
    fs.writeFileSync(inputFile,source);
    const assembleSource=(name:string,text:string)=>{
      const assembly=path.join(directory,name+'.asm'),object=path.join(directory,name+'.rel');
      fs.writeFileSync(assembly,translateSccAsm(text));
      expect(assemble(createLogger('quiet'),assembly,object,{relVersion:2}).errors).toEqual([]);
      return object;
    };
    const libraries:string[]=[];
    if(runtime.platform==='raw') libraries.push(assembleSource('hooks',[
      '.globl __mz80_raw_putc','.globl __mz80_raw_getc','.globl __mz80_raw_exit','.area _CODE',
      '__mz80_raw_putc:','ld hl,#2','add hl,sp','ld e,(hl)','ld c,#2','call 5','ld l,e','ld h,#0','ret',
      '__mz80_raw_getc:','ld hl,#0','ret','__mz80_raw_exit:','ld c,#0','call 5','ret',
    ].join('\n')));
    if(sourceRuntime){
      const object=assembleSource('runtime',getBundledSccRuntime(runtime));
      const compiled=new TsSccCompilerAdapter({abi}).compileToRel(createLogger('quiet'),{
        inputFile,tempDir:directory,bundledIncludeDirs:getBundledRuntimeIncludeDirs(runtime),
        defines:getBundledRuntimeDefines(runtime),runtimeFeatures:runtime.features,
      });
      link([object,compiled.relFile,...libraries],outputFile,{com:true,orgText:'100H',map:true});
    } else compileSccProgram(createLogger('quiet'),{inputFile,outputFile,tempDir:directory,keepTemps:true,runtime,libraries,com:true,map:true},{compilerAdapter:new TsSccCompilerAdapter({abi})});
    const core=new Z80DebugCore(false);
    core.setCpm22Enabled(true);core.setAllowOutOfImage(true);core.loadImage(fs.readFileSync(outputFile),0x100);core.setEntry(0x100);
    expect(core.run(100000000).reason).toBe('BDOS 0: terminate');
    const map=fs.readFileSync(path.join(directory,'probe.map'),'utf8');
    const bytes=(name:string,size:number)=>{
      const match=new RegExp(`^${name.toUpperCase()}\\s*= \\$([0-9a-f]+)`,'im').exec(map);
      if(!match)throw new Error(`Missing ${name}`);
      return core.readMemory(parseInt(match[1],16),size);
    };
    return {map,output:core.getOutput(),imageBytes:fs.statSync(outputFile).size,bytes,integer:(name:string)=>{
      const data=bytes(name,2),value=data[0]+data[1]*256;return value>=32768?value-65536:value;
    }};
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
