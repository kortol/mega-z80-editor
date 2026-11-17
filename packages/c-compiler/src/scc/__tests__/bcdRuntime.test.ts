import fs from "node:fs";
import path from "node:path";
import { loadArchiveFile } from "@mz80/core";
import { getBundledRuntimeArtifacts } from "../runtimeArtifacts";
import { executeNumeric, NumericAbi } from "./support/numericExecution";
type Arithmetic={op:string;left:string;right:string;status:number;raw?:string};
const vectors: {arithmetic:Arithmetic[];parsing:Array<{text:string;status:number;raw?:string}>;conversion:Array<{raw:string;text:string;status:number;integer?:string}>}=JSON.parse(fs.readFileSync(path.join(__dirname,'data/bcd-vectors.json'),'utf8'));
function bytes(raw:string){
  const value=BigInt(raw),digits=(value<0n?-value:value).toString().padStart(16,'0');
  return [value<0n?1:0,...Array.from({length:8},(_,index)=>parseInt(digits.slice(index*2,index*2+2),16))];
}
function object(name:string,raw:string){return `mz80_bcd ${name}={{${bytes(raw)}}};`;}
function run(declarations:string[],statements:string[],abi:NumericAbi){return executeNumeric(['#include <mz80_bcd.h>',...declarations,'int main(){',...statements,'return 0;}'].join('\n'),abi,{platform:'cpm',profile:'lite',features:['bcd']});}

test.each(['ts-internal','ts-static-frame'] as const)('BCD arithmetic / compare / alias through %s',(abi)=>{
  for(let start=0;start<vectors.arithmetic.length;start+=8){
    const batch=vectors.arithmetic.slice(start,start+8),declarations:string[]=[],statements:string[]=[];
    batch.forEach((v,index)=>{
      declarations.push(object(`first${index}`,v.left),object(`second${index}`,v.right),object(`output${index}`,'81'),`int status${index};int cmpstatus${index};int order${index};`);
      statements.push(`status${index}=mz80_bcd_${v.op}(&output${index},&first${index},&second${index});cmpstatus${index}=mz80_bcd_compare(&order${index},&first${index},&second${index});`);
    });
    const result=run(declarations,statements,abi);
    batch.forEach((v,index)=>{
      expect({op:v.op,left:v.left,right:v.right,status:result.integer(`status${index}`),bytes:result.bytes(`output${index}`,9)}).toEqual({op:v.op,left:v.left,right:v.right,status:v.status,bytes:bytes(v.status===0?v.raw!:'81')});
      expect(result.bytes(`first${index}`,9)).toEqual(bytes(v.left));expect(result.bytes(`second${index}`,9)).toEqual(bytes(v.right));
      expect(result.integer(`cmpstatus${index}`)).toBe(0);expect(result.integer(`order${index}`)).toBe(BigInt(v.left)<BigInt(v.right)?-1:BigInt(v.left)>BigInt(v.right)?1:0);
    });
  }
  for(const destination of ['first','second','both']){
    const batch=destination==='both'?vectors.arithmetic.filter(v=>v.left===v.right):[...vectors.arithmetic.filter(v=>v.status===0).slice(0,12),...vectors.arithmetic.filter(v=>v.status!==0).slice(0,8)];
    const declarations:string[]=[],statements:string[]=[];
    batch.forEach((v,index)=>{
      declarations.push(object(`first${index}`,v.left),object(`second${index}`,v.right),`int status${index};`);
      statements.push(`status${index}=mz80_bcd_${v.op}(&${destination==='second'?'second':'first'}${index},&first${index},&${destination==='both'?'first':'second'}${index});`);
    });
    const result=run(declarations,statements,abi);
    batch.forEach((v,index)=>{expect(result.integer(`status${index}`)).toBe(v.status);expect(result.bytes(`${destination==='second'?'second':'first'}${index}`,9)).toEqual(bytes(v.status===0?v.raw!:destination==='second'?v.right:v.left));});
  }
});

test.each(['ts-internal','ts-static-frame'] as const)('BCD parse / format / integer / roundtrip through %s',(abi)=>{
  for(let start=0;start<vectors.parsing.length;start+=8){
    const batch=vectors.parsing.slice(start,start+8);
    const result=run(batch.flatMap((v,index)=>[object(`output${index}`,'81'),`int status${index};`]),batch.map((v,index)=>`status${index}=mz80_bcd_parse(&output${index},${JSON.stringify(v.text)});`),abi);
    batch.forEach((v,index)=>expect({text:v.text,status:result.integer(`status${index}`),bytes:result.bytes(`output${index}`,9)}).toEqual({text:v.text,status:v.status,bytes:bytes(v.status===0?v.raw!:'81')}));
  }
  for(let start=0;start<vectors.conversion.length;start+=8){
    const batch=vectors.conversion.slice(start,start+8),declarations:string[]=[],statements:string[]=[];
    batch.forEach((v,index)=>{
      declarations.push(object(`input${index}`,v.raw),object(`roundtrip${index}`,'81'),`int integer${index}=81;int fmtstatus${index};int intstatus${index};int parsestatus${index};int shortstatus${index};char text${index}[19];char shorttext${index}[19]={81,82};`);
      statements.push(`fmtstatus${index}=mz80_bcd_format(text${index},${v.text.length+1},&input${index});intstatus${index}=mz80_bcd_to_int(&integer${index},&input${index});parsestatus${index}=mz80_bcd_parse(&roundtrip${index},text${index});shortstatus${index}=mz80_bcd_format(shorttext${index},${v.text.length},&input${index});`);
    });
    const result=run(declarations,statements,abi);
    batch.forEach((v,index)=>{
      expect(result.integer(`fmtstatus${index}`)).toBe(0);expect(result.bytes(`text${index}`,v.text.length+1)).toEqual([...Buffer.from(v.text),0]);
      expect(result.integer(`intstatus${index}`)).toBe(v.status);expect(result.integer(`integer${index}`)).toBe(v.status===0?Number(v.integer):81);
      expect(result.integer(`parsestatus${index}`)).toBe(0);expect(result.bytes(`roundtrip${index}`,9)).toEqual(bytes(v.raw));
      expect(result.integer(`shortstatus${index}`)).toBe(4);expect(result.bytes(`shorttext${index}`,2)).toEqual([81,82]);
      expect(result.bytes(`input${index}`,9)).toEqual(bytes(v.raw));
    });
  }
});

test.each(['ts-internal','ts-static-frame'] as const)('BCD malformed input / NULL / canonical zero through %s',(abi)=>{
  const malformed:number[][]=[];
  for(const sign of [2,255])malformed.push([sign,...Array(8).fill(0)]);
  for(let index=1;index<9;index++)for(const digit of [10,15,160,240]){const value=bytes('0');value[index]=digit;malformed.push(value);}
  for(let start=0;start<malformed.length;start+=8){
    const batch=malformed.slice(start,start+8);
    const result=run(batch.flatMap((v,index)=>[`mz80_bcd invalid${index}={{${v}}};char text${index}[19]={81,82};int status${index};`]),batch.map((_,index)=>`status${index}=mz80_bcd_format(text${index},19,&invalid${index});`),abi);
    batch.forEach((_,index)=>{expect(result.integer(`status${index}`)).toBe(3);expect(result.bytes(`text${index}`,2)).toEqual([81,82]);});
  }
  const calls=[...['add','sub','mul','div'].flatMap(op=>[`mz80_bcd_${op}(NULL,&valid,&valid)`,`mz80_bcd_${op}(&output,NULL,&valid)`,`mz80_bcd_${op}(&output,&valid,NULL)`,`mz80_bcd_${op}(&output,&invalid,&valid)`,`mz80_bcd_${op}(&output,&valid,&invalid)`]),
    'mz80_bcd_to_int(&integer,&invalid)','mz80_bcd_to_int(NULL,&valid)','mz80_bcd_to_int(&integer,NULL)','mz80_bcd_compare(&integer,&invalid,&valid)','mz80_bcd_compare(&integer,&valid,&invalid)','mz80_bcd_compare(NULL,&valid,&valid)','mz80_bcd_compare(&integer,NULL,&valid)','mz80_bcd_compare(&integer,&valid,NULL)',
    'mz80_bcd_parse(NULL,"1")','mz80_bcd_parse(&output,NULL)','mz80_bcd_format(NULL,19,&valid)','mz80_bcd_format(text,19,NULL)'];
  const result=run([object('valid','1'),object('output','81'),'mz80_bcd invalid={{0,0,0,0,0,0,0,0,10}};int integer=81;char text[19]={81,82};',...calls.map((_,index)=>`int status${index};`)],calls.map((call,index)=>`status${index}=${call};`),abi);
  calls.forEach((_,index)=>expect(result.integer(`status${index}`)).toBe(3));expect(result.bytes('output',9)).toEqual(bytes('81'));expect(result.integer('integer')).toBe(81);expect(result.bytes('text',2)).toEqual([81,82]);
  const capacities=[-1,0,1,6];
  const small=run([object('valid','1'),'char text[19]={81,82};',...capacities.map((_,index)=>`int status${index};`)],capacities.map((capacity,index)=>`status${index}=mz80_bcd_format(text,${capacity},&valid);`),abi);
  capacities.forEach((_,index)=>expect(small.integer(`status${index}`)).toBe(4));expect(small.bytes('text',2)).toEqual([81,82]);
  const zero=run(['mz80_bcd negativezero={{1,0,0,0,0,0,0,0,0}};',object('output','81'),object('positive','1'),'int status;int order;char text[19];'],['status=mz80_bcd_add(&output,&negativezero,&negativezero);mz80_bcd_format(text,19,&negativezero);mz80_bcd_compare(&order,&negativezero,&positive);'],abi);
  expect(zero.integer('status')).toBe(0);expect(zero.bytes('output',9)).toEqual(bytes('0'));expect(zero.bytes('text',7)).toEqual([...Buffer.from('0.0000'),0]);expect(zero.integer('order')).toBe(-1);
});

test('BCD archive has independent API members; unused arithmetic and fixed are excluded',()=>{
  const archive=getBundledRuntimeArtifacts({platform:'cpm',profile:'lite',features:['bcd']}).libraryPaths[0];
  expect(loadArchiveFile(archive).members.map(member=>member.name)).toEqual(['constructors','cpu','common','conversion','arithmetic','comparison','multiply','divide','parse','format'].map(name=>`mz80_bcd_v1_${name}.rel`));
  const result=run([object('output','0'),'int status;'],['status=mz80_bcd_from_int(&output,7);'],'ts-internal');
  expect(result.map).not.toMatch(/MZ80_BCD_(V1_(ADD|SUB|MUL|DIV|FORMAT|PARSE|COMPARE)|CPU)|MZ80_FIXED|MZ80_Q16/);
});
