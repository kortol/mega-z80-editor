import fs from "node:fs";
import path from "node:path";
import { assemble } from "@mz80/assembler";
import { createLogger, LinkMemoryLayout, normalizeMemoryLayout } from "@mz80/core";
import { getBundledSccRuntime, normalizeBundledRuntime, RuntimeSelection } from "./runtime";
import { translateSccAsm } from "./translateAsm";
import { TsAbiProfile, staticFrameEntry } from "./tsProgram";

export type RuntimeStartupOptions = {
  /** Zero-argument C entry, default main. */
  entry?: string;
  clearBss?: boolean;
  copyData?: boolean;
  setStack?: boolean;
  initHeap?: boolean;
  /** Primary-slot 16/32 KiB MSX cartridge header and BIOS slot setup. */
  msxCartridge?: boolean;
};
export function configuredStartupSource(runtime:RuntimeSelection,memory:LinkMemoryLayout,options:RuntimeStartupOptions={},abi:TsAbiProfile="ts-internal"):string {
  if(typeof runtime==="string")throw new Error("startup requires a structured runtime");
  if(!options||typeof options!=="object"||Array.isArray(options))throw new Error("startup must be an options object");
  const keys=["entry","clearBss","copyData","setStack","initHeap","msxCartridge"];
  for(const [key,value] of Object.entries(options))if(!keys.includes(key)||(key!=="entry"&&typeof value!=="boolean"))throw new Error(`startup: invalid option ${key}`);
  const layout=normalizeMemoryLayout(memory),spec=normalizeBundledRuntime(runtime);
  const name=options.entry??"main";
  if(typeof name!=="string"||!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(name))throw new Error("startup.entry must be a C identifier");
  if(options.setStack!==false&&layout.stack.size<16)throw new Error("startup: stack reservation must be at least 16 bytes");
  if(options.initHeap){
    const heap=layout.heap;
    if(spec.profile!=="full"||!heap||heap.start===0||heap.start%2||heap.size%2||heap.size<6||heap.size>32767||heap.start+heap.size>=65536)throw new Error("startup.initHeap requires full runtime and an even, valid H1 heap reservation (6..32766 bytes)");
  }
  if(options.msxCartridge&&(spec.platform!=="msx-bios"||layout.code.kind!=="rom"||layout.code.start!==0x4000||![0x4000,0x8000].includes(layout.code.size)))throw new Error("startup.msxCartridge requires MSX primary-slot ROM at 4000H with size 4000H or 8000H");
  const entry=abi==="ts-static-frame"?staticFrameEntry(name):name;
  let source=getBundledSccRuntime({...spec,profile:"lite",features:[]}).replace(/(\.globl\s+)main\b/,`$1${entry}`);
  const restore=spec.platform==="msx-bios"&&spec.exit==="return";
  const page2=!!options.msxCartridge&&layout.code.size===0x8000;
  const lines:string[]=[...(["DATA_START","DATA_LOAD","DATA_SIZE","BSS_START","BSS_SIZE","STACK_TOP"].map(symbol=>`.globl __MZ80_${symbol}`))];
  if(options.msxCartridge)lines.push(".db 65,66",".dw START",".ds 12");
  lines.push("START:");
  if(restore){
    lines.push("push ix","push iy");
    if(page2)lines.push("call $0138","push af","rrca","rrca","and #3","ld h,#128","call $0024");
    lines.push("ld iy,#0","add iy,sp");
  }
  if(options.setStack!==false)lines.push("ld sp,#__MZ80_STACK_TOP");
  if(page2&&!restore)lines.push("call $0138","rrca","rrca","and #3","ld h,#128","call $0024");
  if(options.copyData!==false)lines.push("ld bc,#__MZ80_DATA_SIZE","ld a,b","or c","jp z,__mz80_data_ready","ld hl,#__MZ80_DATA_LOAD","ld de,#__MZ80_DATA_START","ldir","__mz80_data_ready:");
  if(options.clearBss!==false)lines.push("ld bc,#__MZ80_BSS_SIZE","ld hl,#__MZ80_BSS_START","__mz80_bss_loop:","ld a,b","or c","jp z,__mz80_bss_ready","ld (hl),#0","inc hl","dec bc","jp __mz80_bss_loop","__mz80_bss_ready:");
  if(restore)lines.push("ld (__mz80_saved_sp),iy");
  if(options.initHeap)lines.push(".globl __MZ80_HEAP_START",".globl __MZ80_HEAP_SIZE",".globl mz80_heap_init","ld hl,#__MZ80_HEAP_START","push hl","ld hl,#__MZ80_HEAP_SIZE","push hl","call mz80_heap_init","pop bc","pop bc","ld a,h","or l","jp z,__mz80_startup_stop");
  lines.push(`call ${entry}`,"push hl","call exit","__mz80_startup_stop:","halt","jp __mz80_startup_stop");
  source=source.replace(/START:\r?\n[\s\S]*?(?=getchar:)/,lines.join("\n")+"\n");
  if(restore){
    const exit=["ld sp,(__mz80_saved_sp)"];
    if(page2)exit.push("pop af","push hl","rrca","rrca","rrca","rrca","and #3","ld h,#128","call $0024","pop hl");
    exit.push("pop iy","pop ix","ret");
    source=source.replace(/exit:\r?\n\s*ret\b/,"exit:\n"+exit.join("\n"));
    source+="\n.area _BSS\n__mz80_saved_sp: .ds 2\n";
  }
  return source+"\n.globl mz80_runtime_gchar\n.globl mz80_runtime_gint\n.area _CODE\nmz80_runtime_gchar:\njp .gchar\nmz80_runtime_gint:\njp .gint\n";
}
export function buildConfiguredStartup(runtime:RuntimeSelection,memory:LinkMemoryLayout,options:RuntimeStartupOptions,abi:TsAbiProfile,directory:string):string {
  const source=configuredStartupSource(runtime,memory,options,abi);
  fs.mkdirSync(directory,{recursive:true});
  const assembly=path.join(directory,"configured_startup.asm"),object=path.join(directory,"configured_startup.rel");
  fs.writeFileSync(assembly,translateSccAsm(source,{moduleName:"configured_startup_v1"}));
  const result=assemble(createLogger("quiet"),assembly,object,{relVersion:2});
  if(result.errors.length)throw new Error(`startup assembly failed: ${result.errors.map(error=>error.message).join("; ")}`);
  return object;
}
