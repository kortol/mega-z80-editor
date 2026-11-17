import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, link, loadArchiveFile, Z80DebugCore } from "@mz80/core";
import { compileSccProgram } from "../compileProgram";
import { TsSccCompilerAdapter } from "../tsCompilerAdapter";
import { getBundledRuntimeArtifacts } from "../runtimeArtifacts";
import { getBundledRuntimeDefines, getBundledRuntimeIncludeDirs, getBundledSccRuntime } from "../runtime";
import { translateSccAsm } from "../translateAsm";
import { assemble } from "@mz80/assembler";

type Abi = "ts-internal" | "ts-static-frame";
type VectorSet = {
  type: string; width: number;
  arithmetic: Array<{op:string;left:string;right:string;status:number;raw?:string}>;
  parsing: Array<{text:string;status:number;raw?:string}>;
  conversion: Array<{raw:string;text:string;integer:string}>;
};
const vectors: VectorSet[] = JSON.parse(fs.readFileSync(path.join(__dirname,"data/fixed-vectors.json"),"utf8"));
function rawBytes(raw: string, width: number) {
  let value = BigInt.asUintN(width * 8, BigInt(raw));
  return Array.from({length:width}, () => { const byte=Number(value & 255n);value >>= 8n;return byte; });
}
function object(type: string, name: string, raw: string, width: number) {
  return `mz80_${type === "q8" ? "q8_8" : "q16_16"} ${name}={{${rawBytes(raw,width).join(",")}}};`;
}
function run(declarations: string[], statements: string[], abi: Abi) {
  return runSource(["#include <mz80_fixed.h>",...declarations,"int main(){",...statements,"return 0;}"].join("\n"),abi);
}
function runSource(source: string, abi: Abi, profile: "lite" | "full" = "lite", sourceRuntime = false) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(),"mz80-fixed-"));
  try {
    const inputFile=path.join(tempDir,"fixed.c"), outputFile=path.join(tempDir,"fixed.com");
    fs.writeFileSync(inputFile,source);
    const runtime = {platform:"cpm" as const,profile,features:["fixed" as const]};
    if(sourceRuntime) {
      const assemblyFile=path.join(tempDir,"runtime.asm"),runtimeRel=path.join(tempDir,"runtime.rel");
      fs.writeFileSync(assemblyFile,translateSccAsm(getBundledSccRuntime(runtime)));
      expect(assemble(createLogger("quiet"),assemblyFile,runtimeRel,{relVersion:2}).errors).toEqual([]);
      const compiled=new TsSccCompilerAdapter({abi}).compileToRel(createLogger("quiet"),{
        inputFile,tempDir,bundledIncludeDirs:getBundledRuntimeIncludeDirs(runtime),defines:getBundledRuntimeDefines(runtime),runtimeFeatures:["fixed"],
      });
      link([runtimeRel,compiled.relFile],outputFile,{com:true,orgText:"100H",map:true});
    } else compileSccProgram(createLogger("quiet"), {inputFile,outputFile,tempDir,keepTemps:true,runtime,com:true,map:true}, {compilerAdapter:new TsSccCompilerAdapter({abi})});
    const core=new Z80DebugCore(false);
    core.setCpm22Enabled(true);core.setAllowOutOfImage(true);core.loadImage(fs.readFileSync(outputFile),0x100);core.setEntry(0x100);
    expect(core.run(50000000).reason).toBe("BDOS 0: terminate");
    const map=fs.readFileSync(path.join(tempDir,"fixed.map"),"utf8");
    const address=(name:string)=>{
      const match=new RegExp(`^${name.toUpperCase()}\\s*= \\$([0-9a-f]+)`,"im").exec(map);
      if(!match)throw new Error(`Missing ${name}`);
      return parseInt(match[1],16);
    };
    return {map,output:core.getOutput(),imageBytes:fs.statSync(outputFile).size,bytes:(name:string,count:number)=>core.readMemory(address(name),count),integer:(name:string)=>{
      const bytes=core.readMemory(address(name),2);const value=bytes[0]+bytes[1]*256;return value>=32768?value-65536:value;
    }};
  } finally { fs.rmSync(tempDir,{recursive:true,force:true}); }
}
const configurations = (["ts-internal","ts-static-frame"] as const).flatMap(abi=>vectors.map(vector=>({abi,...vector})));

test.each(configurations)("$type arithmetic / alias / failures through $abi", ({abi,type,width,arithmetic})=>{
  for(let start=0;start<arithmetic.length;start+=8){
    const batch=arithmetic.slice(start,start+8);
    const declarations:string[]=[], statements:string[]=[];
    batch.forEach((v,index)=>{
      declarations.push(object(type,`first${index}`,v.left,width),object(type,`second${index}`,v.right,width),object(type,`output${index}`,"81",width),`int status${index};`);
      statements.push(`status${index}=mz80_${type}_${v.op}(&output${index},&first${index},&second${index});`);
      if(v.op==="add") {
        declarations.push(`int order${index};int cmpstatus${index};`);
        statements.push(`cmpstatus${index}=mz80_${type}_compare(&order${index},&first${index},&second${index});`);
      }
    });
    const result=run(declarations,statements,abi);
    batch.forEach((v,index)=>{
      expect({op:v.op,left:v.left,right:v.right,status:result.integer(`status${index}`),bytes:result.bytes(`output${index}`,width)}).toEqual({op:v.op,left:v.left,right:v.right,status:v.status,bytes:rawBytes(v.status===0?v.raw!:"81",width)});
      expect(result.bytes(`first${index}`,width)).toEqual(rawBytes(v.left,width));
      expect(result.bytes(`second${index}`,width)).toEqual(rawBytes(v.right,width));
      if(v.op==="add") {
        expect(result.integer(`cmpstatus${index}`)).toBe(0);
        expect(result.integer(`order${index}`)).toBe(BigInt(v.left)<BigInt(v.right)?-1:BigInt(v.left)>BigInt(v.right)?1:0);
      }
    });
  }
  for(const destination of ["first","second"]){
    const batch=[...arithmetic.filter(v=>v.status===0 && v.left!==v.right).slice(0,12),...arithmetic.filter(v=>v.status!==0).slice(0,8)];
    const declarations:string[]=[], statements:string[]=[];
    batch.forEach((v,index)=>{
      declarations.push(object(type,`first${index}`,v.left,width),object(type,`second${index}`,v.right,width),`int status${index};`);
      statements.push(`status${index}=mz80_${type}_${v.op}(&${destination}${index},&first${index},&second${index});`);
    });
    const result=run(declarations,statements,abi);
    batch.forEach((v,index)=>{expect(result.integer(`status${index}`)).toBe(v.status);expect(result.bytes(`${destination}${index}`,width)).toEqual(rawBytes(v.status===0?v.raw!:destination==="first"?v.left:v.right,width));});
  }
});

test.each(configurations)("$type decimal parse / format / integer conversion through $abi", ({abi,type,width,parsing,conversion})=>{
  for(let start=0;start<parsing.length;start+=8){
    const batch=parsing.slice(start,start+8);
    const result=run(batch.flatMap((v,index)=>[object(type,`output${index}`,"81",width),`int status${index};`]),batch.map((v,index)=>`status${index}=mz80_${type}_parse(&output${index},${JSON.stringify(v.text)});`),abi);
    batch.forEach((v,index)=>expect({text:v.text,status:result.integer(`status${index}`),bytes:result.bytes(`output${index}`,width)}).toEqual({text:v.text,status:v.status,bytes:rawBytes(v.status===0?v.raw!:"81",width)}));
  }
  for(let start=0;start<conversion.length;start+=8){
    const batch=conversion.slice(start,start+8);
    const declarations:string[]=[], statements:string[]=[];
    batch.forEach((v,index)=>{
      declarations.push(object(type,`input${index}`,v.raw,width),object(type,`roundtrip${index}`,"81",width),`char text${index}[24];char shorttext${index}[24]={81,82};int integer${index};int fmtstatus${index};int intstatus${index};int shortstatus${index};int parsestatus${index};`);
      statements.push(`shortstatus${index}=mz80_${type}_format(shorttext${index},${v.text.length},&input${index});fmtstatus${index}=mz80_${type}_format(text${index},${v.text.length+1},&input${index});intstatus${index}=mz80_${type}_to_int(&integer${index},&input${index});parsestatus${index}=mz80_${type}_parse(&roundtrip${index},text${index});`);
    });
    const result=run(declarations,statements,abi);
    batch.forEach((v,index)=>{
      expect(result.integer(`fmtstatus${index}`)).toBe(0);expect(result.integer(`intstatus${index}`)).toBe(0);
      expect(result.integer(`integer${index}`)).toBe(Number(v.integer));
      expect(result.bytes(`text${index}`,v.text.length+1)).toEqual([...Buffer.from(v.text),0]);
      expect(result.bytes(`input${index}`,width)).toEqual(rawBytes(v.raw,width));
      expect(result.integer(`shortstatus${index}`)).toBe(4);expect(result.bytes(`shorttext${index}`,2)).toEqual([81,82]);
      expect(result.integer(`parsestatus${index}`)).toBe(0);expect(result.bytes(`roundtrip${index}`,width)).toEqual(rawBytes(v.raw,width));
    });
  }
});

test.each(configurations)("$type compare / NULL / format capacity through $abi", ({abi,type,width})=>{
  const declarations=[object(type,"first","-1",width),object(type,"second","1",width),"int order=81;int status;char text[24]={81,82,83};"];
  let result=run(declarations,[`status=mz80_${type}_compare(&order,&first,&second);`],abi);
  expect(result.integer("status")).toBe(0);expect(result.integer("order")).toBe(-1);
  for(const statement of [`mz80_${type}_compare(&order,NULL,&second)`,`mz80_${type}_compare(&order,&first,NULL)`,`mz80_${type}_to_int(&order,NULL)`]){
    result=run(declarations,[`status=${statement};`],abi);expect(result.integer("status")).toBe(3);expect(result.integer("order")).toBe(81);
  }
  for(const operation of ["add","sub","mul","div"]){
    for(const args of ["NULL,&first,&second","&first,NULL,&second","&first,&second,NULL"]){
      result=run(declarations,[`status=mz80_${type}_${operation}(${args});`],abi);expect(result.integer("status")).toBe(3);expect(result.bytes("first",width)).toEqual(rawBytes("-1",width));
    }
  }
  for(const capacity of [-1,0,1,2,3]){
    result=run(declarations,[`status=mz80_${type}_format(text,${capacity},&first);`],abi);expect(result.integer("status")).toBe(4);expect(result.bytes("text",3)).toEqual([81,82,83]);
  }
  for(const call of [`mz80_${type}_parse(&first,NULL)`,`mz80_${type}_parse(NULL,"1")`,`mz80_${type}_format(NULL,24,&first)`,`mz80_${type}_format(text,24,NULL)`,`mz80_${type}_to_int(NULL,&first)`,`mz80_${type}_compare(NULL,&first,&second)`]){
    result=run(declarations,[`status=${call};`],abi);expect(result.integer("status")).toBe(3);expect(result.bytes("first",width)).toEqual(rawBytes("-1",width));
  }
});

test.each(configurations)("$type identical operands and in-place integer / comparison through $abi",({abi,type,width})=>{
  const scale=1n << BigInt(width*4);
  const declarations:string[]=[object(type,"integer_alias",String(-scale-1n),width),object(type,"compare_alias","-1",width),object(type,"positive","1",width),`mz80_${type==="q8"?"q8_8":"q16_16"} *numeric_pointer;int *integer_pointer;int intstatus;int cmpstatus;`];
  const statements=["numeric_pointer=&integer_alias;integer_pointer=(int *)numeric_pointer;",`intstatus=mz80_${type}_to_int(integer_pointer,numeric_pointer);`,"numeric_pointer=&compare_alias;integer_pointer=(int *)numeric_pointer;",`cmpstatus=mz80_${type}_compare(integer_pointer,numeric_pointer,&positive);`];
  const expected={add:scale*3n,sub:0n,mul:scale*9n/4n,div:scale};
  for(const operation of ["add","sub","mul","div"] as const){
    declarations.push(object(type,`${operation}_alias`,String(scale*3n/2n),width),`int ${operation}_status;`);
    statements.push(`${operation}_status=mz80_${type}_${operation}(&${operation}_alias,&${operation}_alias,&${operation}_alias);`);
  }
  const result=run(declarations,statements,abi);
  expect(result.integer("intstatus")).toBe(0);expect(result.integer("integer_alias")).toBe(-1);
  expect(result.integer("cmpstatus")).toBe(0);expect(result.integer("compare_alias")).toBe(-1);
  for(const operation of ["add","sub","mul","div"] as const){
    expect(result.integer(`${operation}_status`)).toBe(0);expect(result.bytes(`${operation}_alias`,width)).toEqual(rawBytes(String(expected[operation]),width));
  }
});

test("fixed archive splits API families and constructor use excludes arithmetic / format",()=>{
  const archive=getBundledRuntimeArtifacts({platform:"cpm",profile:"lite",features:["fixed"]}).libraryPaths[0];
  expect(loadArchiveFile(archive).members.map(member=>member.name)).toEqual(["constructors","cpu","common","conversion","arithmetic","comparison","multiply","divide","parse","format"].map(name=>`mz80_fixed_v1_${name}.rel`));
  const result=run([object("q16","output","0",4),"int status;"],["status=mz80_q16_from_int(&output,7);"],"ts-internal");
  expect(result.map).not.toMatch(/MZ80_FIXED_(MULTIPLY|DIVIDE|FORMAT|PARSE|CPU)/);
  const addition=run([object("q16","first","65536",4),object("q16","second","65536",4),object("q16","output","0",4),"int status;"],["status=mz80_q16_add(&output,&first,&second);"],"ts-internal");
  expect(addition.map).not.toMatch(/MZ80_FIXED_(MULTIPLY|DIVIDE|FORMAT|PARSE)/);
});

const exampleConfigurations=(["ts-internal","ts-static-frame"] as const).flatMap(abi=>(["lite","full"] as const).flatMap(profile=>[false,true].map(sourceRuntime=>({abi,profile,sourceRuntime}))));
test.each(exampleConfigurations)("fractional simultaneous equations through %o",({abi,profile,sourceRuntime})=>{
  const source=fs.readFileSync(path.join(__dirname,"../../../docs/examples/fixed-equations.c"),"utf8");
  const result=runSource(source,abi,profile,sourceRuntime);
  expect(result.output).toBe("2.5\n1.5\n");
});
