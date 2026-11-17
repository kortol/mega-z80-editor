/* Conservative control-flow stack bound on the generated Z80, including nested
 * argument evaluation, call return addresses and private CPU helper calls. */
const fs = require('node:fs');
const path = require('node:path');
const feature=process.argv[2] || 'fixed';
if(!['fixed','bcd'].includes(feature))throw new Error('Expected fixed or bcd');
const root=path.resolve(__dirname,'../dist/scc/runtime/numeric',feature);
const files=['constructors.scc.asm','cpu.scc.asm',...fs.readdirSync(root).filter(name=>name.endsWith('.generated.scc.asm')).sort()];
const labels=new Map(), publicSymbols=new Set(), instructions=[];
for(const file of files)for(const line of fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/)){
  const text=line.split(';')[0].trim();
  if(!text)continue;
  if(/\.(ds|db|dw|ascii|asciz)\b/.test(text))throw new Error(`Unexpected runtime storage: ${text}`);
  if(text.startsWith('.globl')){publicSymbols.add(text.split(/\s+/)[1]);continue;}
  if(text.startsWith('.')){
    if(text.endsWith(':'))labels.set(text.slice(0,-1),instructions.length);
    else if(!/^\.(area|module)\s/.test(text))throw new Error(`Unexpected runtime storage/directive: ${text}`);
    continue;
  }
  if(text.endsWith(':')){labels.set(text.slice(0,-1),instructions.length);continue;}
  instructions.push(text.replace(/\s+/g,' ').replace(/,\s+/g,','));
}
const cache=new Map(),active=new Set();
function bound(name){
  if(cache.has(name))return cache.get(name);
  if(active.has(name))throw new Error(`Recursive runtime call: ${name}`);
  if(!labels.has(name))throw new Error(`Unknown callee: ${name}`);
  active.add(name);
  let peak=0;
  const seen=new Map(),queue=[[labels.get(name),0]];
  while(queue.length){
    const [offset,incoming]=queue.pop();
    if(seen.has(offset)){if(seen.get(offset)!==incoming)throw new Error(`Unbalanced stack at ${name}:${offset}`);continue;}
    seen.set(offset,incoming);
    const text=instructions[offset];
    if(!text)throw new Error(`Fallthrough: ${name}`);
    let depth=incoming;
    if(text.startsWith('push '))depth+=2;
    if(text.startsWith('pop '))depth-=2;
    if(text==='dec sp')depth++;
    if(text==='inc sp')depth--;
    if(depth<0)throw new Error(`Stack underflow: ${name}`);
    peak=Math.max(peak,depth);
    if(text.startsWith('call '))peak=Math.max(peak,depth+2+bound(text.slice(5)));
    if(text.startsWith('ld sp,') || text.startsWith('add sp,') || text==='ex (sp),hl')throw new Error(`Unsupported stack instruction: ${text}`);
    if(text.startsWith('ret')){
      if(depth!==0)throw new Error(`Unbalanced return: ${name} (${depth})`);
      if(text==='ret')continue;
    }
    const jump=/^(?:jp|jr) (?:(?:nz|z|nc|c|po|pe|p|m),)?([^, ]+)$/.exec(text);
    const djnz=/^djnz (.+)$/.exec(text);
    if(jump||djnz){
      const target=(jump||djnz)[1];
      if(!labels.has(target))throw new Error(`Unknown jump: ${target}`);
      queue.push([labels.get(target),depth]);
      if(jump && !text.includes(','))continue;
    }
    queue.push([offset+1,depth]);
  }
  active.delete(name);cache.set(name,peak);return peak;
}
for(const name of [...publicSymbols].filter(name=>(feature==='fixed'?/^mz80_q(?:8|16)_v1_/:/^mz80_bcd_v1_/).test(name) && labels.has(name)).sort())console.log(`${name}: ${bound(name)} bytes`);
console.log(`[${feature}-stack] no mutable storage; call graph is acyclic; all returns balance SP`);
