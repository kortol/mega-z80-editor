const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {createLogger}=require('@mz80/core');
const {compileSccProgram,TsSccCompilerAdapter}=require('../dist');
const executable=process.env.MZ80_OPENMSX || 'C:\\Program Files\\openMSX\\openmsx.exe';
if(!fs.existsSync(executable))throw new Error('Set MZ80_OPENMSX to openMSX executable');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mz80-startup-msx-'));
const source=fs.readFileSync(path.join(__dirname,'../docs/examples/startup-probe.c'),'utf8');
const configuration=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/examples/msx-target.json'),'utf8'));
const tcl=value=>value.replace(/\\/g,'/').replace(/[{}]/g,'\\$&');
try{
  for(const size of [0x4000,0x8000])for(const abi of ['ts-internal','ts-static-frame'])for(const exit of ['halt','return']){
    const name=[size,abi,exit].join('-'),root=path.join(directory,name);fs.mkdirSync(root);
    const inputFile=path.join(root,'probe.c'),outputFile=path.join(root,'probe.rom');fs.writeFileSync(inputFile,source);
    const memory={...configuration.memory,code:{...configuration.memory.code,size}};
    const features=size===0x8000?['fixed','bcd']:[];
    compileSccProgram(createLogger('quiet'),{inputFile,outputFile,tempDir:root,keepTemps:true,runtime:{platform:'msx-bios',profile:'full',exit,features},memory,startup:configuration.startup,map:true},{compilerAdapter:new TsSccCompilerAdapter({abi})});
    const rom=fs.readFileSync(outputFile);assert.equal(rom.length,size);assert.equal(rom.toString('ascii',0,2),'AB');
    const entry=rom.readUInt16LE(2),script=path.join(root,'probe.tcl'),snapshot=path.join(root,'screen.txt');
    fs.writeFileSync(script,[
      'set throttle off','set ::entered 0','set ::returned 0','set ::restored 0',
      `debug set_bp ${entry} {} {`,
      ' if {!$::entered} {','  set ::entered 1','  set ::original_sp [reg SP]','  set ::original_ix [reg IX]','  set ::original_iy [reg IY]','  set ::original_slot [debug read ioports 0xa8]',
      '  set target [expr {[debug read memory $::original_sp] + 256 * [debug read memory [expr {$::original_sp+1}]]}]',
      '  debug set_bp $target {} {','   set ::returned 1',
      '   set ::restored [expr {[reg SP] == $::original_sp+2 && [reg IX] == $::original_ix && [reg IY] == $::original_iy && ([debug read ioports 0xa8]&48) == ($::original_slot&48)}]',
      '  }',' }','}',
      'after realtime 3 {',`set fd [open {${tcl(snapshot)}} w]`,'puts $fd [get_screen]','puts $fd "ENTRY=$::entered RETURN=$::returned RESTORE=$::restored"','close $fd','exit','}',
    ].join('\n'));
    const result=spawnSync(executable,['-machine','C-BIOS_MSX1','-cart',outputFile,'-romtype','Normal','-script',script],{encoding:'utf8',timeout:20000,windowsHide:true});
    if(result.error)throw result.error;assert.equal(result.status,0,result.stderr+result.stdout);
    const screen=fs.readFileSync(snapshot,'utf8'),expected='ABCDEREADY'+(features.length?'1.251.2500':'');
    assert.ok(screen.replace(/\s/g,'').includes(expected),`${name}: bad DATA / BSS / heap / numeric output: ${screen}`);
    assert.ok(screen.includes(`ENTRY=1 RETURN=${exit==='return'?1:0} RESTORE=${exit==='return'?1:0}`),`${name}: caller SP / IX / IY / page2 not restored: ${screen}`);
    console.log(`[msx-startup] passed ${name}: emitted cartridge, DATA/BSS, heap, caller context`);
  }
}finally{fs.rmSync(directory,{recursive:true,force:true});}
