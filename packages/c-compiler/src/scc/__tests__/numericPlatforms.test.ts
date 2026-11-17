import fs from "node:fs";
import path from "node:path";
import { executeNumeric } from "./support/numericExecution";
import { NumericFeature } from "../runtimeFeatures";
import { getBundledRuntimeArtifacts } from "../runtimeArtifacts";
import { loadArchiveFile } from "@mz80/core";
const source=fs.readFileSync(path.join(__dirname,'../../../docs/examples/numeric-probe.c'),'utf8');
const selections:NumericFeature[][]=[[],['fixed'],['bcd'],['fixed','bcd']];
const cases=selections.flatMap(features=>(['ts-internal','ts-static-frame'] as const).flatMap(abi=>(['lite','full'] as const).flatMap(profile=>(['cpm','raw'] as const).map(platform=>({features,abi,profile,platform})))));
test.each(cases)('all numeric families through %o',({features,abi,profile,platform})=>{
  const result=executeNumeric(source,abi,{platform,profile,features});
  expect(result.output).toBe((features.includes('fixed')?'1.25\n':'')+(features.includes('bcd')?'1.2500\n':'')+'CORE\n');
  expect(result.map.includes('MZ80_Q16_V1_DIV')).toBe(features.includes('fixed'));
  expect(result.map.includes('MZ80_BCD_V1_DIV')).toBe(features.includes('bcd'));
  expect(result.map).not.toMatch(/MZ80_HEAP_INIT|MALLOC/);
});
test.each(['ts-internal','ts-static-frame'] as const)('independent BCD source runtime through %s',abi=>{
  const result=executeNumeric(source,abi,{platform:'cpm',profile:'lite',features:['bcd']},true);
  expect(result.output).toBe('1.2500\nCORE\n');expect(result.map).not.toMatch(/MZ80_FIXED|MZ80_Q16/);
});
test('numeric archives contain no mutable DATA or BSS',()=>{
  for(const feature of ['fixed','bcd'] as const){
    const archive=getBundledRuntimeArtifacts({platform:'cpm',profile:'lite',features:[feature]}).libraryPaths[0];
    for(const member of loadArchiveFile(archive).members) { expect(member.module.sections).toBeDefined(); for(const section of member.module.sections ?? []) {
      if(section.kind==='DATA'||section.kind==='BSS')expect(section.size).toBe(0);
    } }
  }
});
