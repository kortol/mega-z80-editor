/* Real C-BIOS execution. Explicit ROM->RAM DATA copy and writable BSS startup. */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {createLogger}=require('@mz80/core');
const {compileSccProgram,TsSccCompilerAdapter}=require('../dist');
const openMsx=process.env.MZ80_OPENMSX || 'C:\\Program Files\\openMSX\\openmsx.exe';
if(!fs.existsSync(openMsx))throw new Error(`openMSX not found: ${openMsx}`);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mz80-msx-numeric-'));
const source=fs.readFileSync(path.join(__dirname,'../docs/examples/numeric-probe.c'),'utf8');
const tclPath=value=>value.replace(/\\/g,'/').replace(/[{}]/g,'\\$&');
try {
  for(const features of [[],['fixed'],['bcd'],['fixed','bcd']])for(const profile of ['lite','full'])for(const abi of ['ts-internal','ts-static-frame'])for(const exit of ['halt','return']){
    const name=[features.join('+')||'none',profile,abi,exit].join('-');
    const directory=path.join(root,name);fs.mkdirSync(directory);
    const inputFile=path.join(directory,'probe.c'),outputFile=path.join(directory,'probe.bin');
    fs.writeFileSync(inputFile,source);
    compileSccProgram(createLogger('quiet'),{inputFile,outputFile,tempDir:directory,keepTemps:true,
      runtime:{platform:'msx-bios',profile,exit,features},orgText:'4030H',orgData:'C000H',orgBss:'C200H',map:true},
      {compilerAdapter:new TsSccCompilerAdapter({abi})});
    const binary=fs.readFileSync(outputFile),dataOffset=0xC000-0x4030,data=binary.subarray(dataOffset);
    // Reserve BD80-BFFF for the startup stub and initial DATA; reject code overlap.
    assert.ok(!binary.subarray(0xBD80-0x4030,dataOffset).some(byte=>byte!==0),'numeric TEXT overlaps ROM startup');
    assert.ok(data.length<=512,'numeric initial DATA exceeds reserved ROM space');
    const rom=Buffer.alloc(32768);rom.write('AB');rom.writeUInt16LE(0x4010,2);
    // C-BIOS initially maps only cartridge page 1. Read its primary slot,
    // map that same cartridge into page 2 via ENASLT, then enter the stub.
    Buffer.from([0xCD,0x38,0x01,0x0F,0x0F,0xE6,0x03,0x26,0x80,0xCD,0x24,0x00,0xC3,0x80,0xBD]).copy(rom,0x10);
    binary.subarray(0,dataOffset).copy(rom,0x30);
    data.copy(rom,0x7E00);
    const startup=[0x21,0x00,0xC0,0x36,0x00,0x11,0x01,0xC0,0x01,0xFF,0x07,0xED,0xB0,
      ...(data.length?[0x21,0x00,0xBE,0x11,0x00,0xC0,0x01,data.length&255,data.length>>8,0xED,0xB0]:[]),
      0xCD,0x30,0x40,0x3E,0x5A,0x32,0xFE,0xC7,0x76,0x18,0xFD];
    Buffer.from(startup).copy(rom,0x7D80);
    const cartridge=path.join(directory,'probe.rom'),script=path.join(directory,'probe.tcl'),snapshot=path.join(directory,'screen.txt');
    fs.writeFileSync(cartridge,rom);
    fs.writeFileSync(script,[
      'set throttle off', 'after realtime 3 {',`set fd [open {${tclPath(snapshot)}} w]`,
      'puts $fd [get_screen]','puts $fd "RETURN_MARKER=[debug read memory 0xC7FE]"','close $fd','exit','}',
    ].join('\n'));
    const result=spawnSync(openMsx,['-machine','C-BIOS_MSX1','-cart',cartridge,'-romtype','Normal','-script',script],{encoding:'utf8',timeout:20000,windowsHide:true});
    if(result.error)throw result.error;
    assert.equal(result.status,0,result.stderr+result.stdout);
    const screen=fs.readFileSync(snapshot,'utf8');
    const expected=(features.includes('fixed')?'1.25':'')+(features.includes('bcd')?'1.2500':'')+'CORE';
    assert.ok(screen.replace(/\s/g,'').includes(expected),`${name}: missing numeric output: ${screen}`);
    assert.ok(screen.includes(`RETURN_MARKER=${exit==='return'?90:0}`),`${name}: wrong exit contract: ${screen}`);
    console.log(`[msx-numeric] passed ${name}: DATA copy, output, exit marker`);
  }
} finally {fs.rmSync(root,{recursive:true,force:true});}
