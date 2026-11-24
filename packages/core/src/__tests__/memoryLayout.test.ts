import { LinkMemoryLayout, normalizeMemoryLayout } from "../linker/memoryLayout";
import { linkModulesV2 } from "../linker/core/linker";
import { RelModule } from "../linker/core/types";
import { BinOutputAdapter } from "../linker/output/binAdapter";
const memory:LinkMemoryLayout={code:{start:"4000H",size:"4000H",kind:"rom"},ram:{start:"C000H",size:"3000H"},stack:{top:"F000H",size:"400H"},heap:{start:"D000H",size:"800H"}};
function module():RelModule{return {name:"probe",version:2,sections:[{id:0,name:"TEXT",kind:"TEXT",size:4},{id:1,name:"DATA",kind:"DATA",size:2},{id:2,name:"BSS",kind:"BSS",size:8}],symbols:[{name:"MAIN",addr:0,section:"TEXT",storage:"REL"}],externs:["__MZ80_DATA_LOAD"],texts:[{addr:0,section:"TEXT",bytes:[0x21,0,0,0xC9]},{addr:0,section:"DATA",bytes:[9,7]}],refs:[{addr:1,section:"TEXT",sym:"__MZ80_DATA_LOAD"}]};}
test("ROM DATA relocates against RAM, loads immediately after TEXT, and BSS stays out of image",()=>{
  const result=linkModulesV2([module()],{memory});
  expect(result.memoryLayout?.data).toEqual({start:0xC000,size:2,loadAddress:0x4004});
  expect(result.memoryLayout?.bss).toEqual({start:0xC002,size:8});
  expect(result.symbols.get("__MZ80_STACK_TOP")?.addr).toBe(0xF000);
  expect([...new BinOutputAdapter(result).generateText()]).toEqual([0x21,4,0x40,0xC9,9,7]);
});
test("RAM placement follows TEXT and preserves defaults when layout is omitted",()=>{
  const ram:LinkMemoryLayout={code:{start:256,size:0x4000,kind:"ram"},ram:{start:256,size:0xEF00},stack:{top:0xF000,size:1024}};
  expect(linkModulesV2([module()],{memory:ram}).memoryLayout?.data).toEqual({start:260,size:2,loadAddress:260});
  const legacy=module();legacy.externs=[];legacy.refs=[];
  expect(linkModulesV2([legacy]).memoryLayout).toBeUndefined();
});
test.each([
  {...memory,code:{start:0xC000,size:0x100,kind:"rom"}},
  {...memory,ram:{start:65530,size:20}},
  {...memory,stack:{top:0xC001,size:32}},
  {...memory,heap:{start:0xEC00,size:1024}},
  {...memory,stack:{top:"bad",size:16}},
  {...memory,code:{start:1.5,size:100,kind:"rom"}},
])("rejects invalid region/reservation %o",value=>expect(()=>normalizeMemoryLayout(value as LinkMemoryLayout)).toThrow("memory:"));
test.each([
  {orgData:0xD000}, {orgData:0xEC00}, {orgData:0x100}, {orgBss:0xC001}, {orgText:0x8000},
])("rejects invalid final placement %o",options=>expect(()=>linkModulesV2([module()],{memory,...options})).toThrow("memory:"));
test("rejects ROM load image overflow, custom storage, unknown externs, and linker symbol redefinition",()=>{
  expect(()=>linkModulesV2([module()],{memory:{...memory,code:{start:0x4000,size:4,kind:"rom"}}})).toThrow("load image");
  const custom=module();custom.sections!.push({id:3,name:"extra",kind:"CUSTOM",size:1});
  expect(()=>linkModulesV2([custom],{memory})).toThrow("CUSTOM");
  const missing=module();missing.externs.push("UNDEFINED");expect(()=>linkModulesV2([missing],{memory})).toThrow("UNDEFINED");
  const relocation=module();relocation.refs.push({addr:1,section:"TEXT",sym:"UNKNOWN+1"});expect(()=>linkModulesV2([relocation],{memory})).toThrow("unresolved relocation");
  const reserved=module();reserved.symbols.push({name:"__MZ80_DATA_LOAD",addr:0,storage:"ABS"});expect(()=>linkModulesV2([reserved],{memory})).toThrow("redefined");
});
