/* Copied into an isolated consumer so require() resolves installed tarballs. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createLogger,Z80DebugCore,loadArchiveFile}=require('@mz80/core');
const api=require('@mz80/c-compiler');
const requested=process.argv[2]==='none'?[]:process.argv[2].split(',');
assert.deepEqual(api.availableNumericFeatures(),requested);
const source=fs.readFileSync(path.join(__dirname,'numeric-probe.c'),'utf8');
const selections=[[],...requested.map(name=>[name]),...(requested.length===2?[requested]:[])];
const measurements=[];
for(const features of selections)for(const abi of ['ts-internal','ts-static-frame'])for(const profile of ['lite','full']){
  const name=[features.join('+')||'none',abi,profile].join('-');
  const directory=path.join(__dirname,'execution',name);fs.mkdirSync(directory,{recursive:true});
  const inputFile=path.join(directory,'probe.c'),outputFile=path.join(directory,'probe.com');
  fs.writeFileSync(inputFile,source);
  api.compileSccProgram(createLogger('quiet'),{inputFile,outputFile,tempDir:path.join(directory,'stage'),runtime:{platform:'cpm',profile,features},com:true,map:true},{compilerAdapter:new api.TsSccCompilerAdapter({abi})});
  const core=new Z80DebugCore(false);core.setCpm22Enabled(true);core.setAllowOutOfImage(true);core.loadImage(fs.readFileSync(outputFile),0x100);core.setEntry(0x100);
  assert.equal(core.run(100000000).reason,'BDOS 0: terminate');
  assert.equal(core.getOutput(),(features.includes('fixed')?'1.25\n':'')+(features.includes('bcd')?'1.2500\n':'')+'CORE\n');
  const map=fs.readFileSync(outputFile.replace(/\.com$/,'.map'),'utf8');
  assert.equal(map.includes('MZ80_Q16_V1_DIV'),features.includes('fixed'));
  assert.equal(map.includes('MZ80_BCD_V1_DIV'),features.includes('bcd'));
  if(abi==='ts-internal'&&profile==='lite')measurements.push({features,imageBytes:fs.statSync(outputFile).size});
}
for(const feature of ['fixed','bcd'])if(!requested.includes(feature)){
  assert.throws(()=>api.getBundledRuntimeArtifacts({platform:'cpm',profile:'lite',features:[feature]}),/not included/);
  assert.throws(()=>api.getBundledSccRuntime({platform:'cpm',profile:'lite',features:[feature]}),/not included/);
  const directory=path.join(__dirname,'rejected-'+feature);fs.mkdirSync(directory,{recursive:true});
  assert.throws(()=>api.compileCSource(createLogger('quiet'),{source:`#include <mz80_${feature}.h>\nint main(){return 0;}`,tempDir:directory}),/include/i);
}
const mutable=[];
for(const feature of requested){
  const archive=api.getBundledRuntimeArtifacts({platform:'cpm',profile:'lite',features:[feature]}).libraryPaths[0];
  for(const member of loadArchiveFile(archive).members)for(const section of member.module.sections||[])if(['DATA','BSS'].includes(section.kind))assert.equal(section.size,0);
  mutable.push({feature,dataBytes:0,bssBytes:0});
}
console.log('[numeric-consumer] '+JSON.stringify({modules:requested,measurements,mutable}));
