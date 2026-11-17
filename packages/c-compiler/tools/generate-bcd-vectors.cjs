const fs=require('node:fs');
const path=require('node:path');
const scale=10000n,maximum=9999999999999999n;
const bounded=raw=>raw < -maximum || raw > maximum ? {status:1} : {status:0,raw:String(raw)};
const format=raw=>(raw<0n?'-':'')+(raw<0n?-raw:raw)/scale+'.'+((raw<0n?-raw:raw)%scale).toString().padStart(4,'0');
const pairs=[[0n,0n],[1n,1n],[-1n,1n],[maximum,-maximum],[maximum,1n],[-maximum,-1n],
  [maximum,maximum],[-maximum,-maximum],[maximum,scale],[-maximum,scale],[-maximum,-scale],
  [scale+1n,scale/2n+1n],[-scale-1n,scale/2n+1n],[scale,0n],[0n,-scale],
  [999999999999n,1n],[scale-1n,scale-1n],[1234567890123456n,987654321n]];
let seed=0x65a3n;
const random=()=>{seed=(seed*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);return seed%(maximum*2n+1n)-maximum;};
for(let index=0;index<12;index++)pairs.push([random(),random()]);
const arithmetic=pairs.flatMap(([left,right])=>['add','sub','mul','div'].map(op=>({op,left:String(left),right:String(right),
  ...(op==='div' && right===0n?{status:2}:bounded(op==='add'?left+right:op==='sub'?left-right:op==='mul'?left*right/scale:left*scale/right))})));
const texts=['0','-0','+0.0000','-0.0000','000000000000000000000000001.2500','1.25','-1.9999',
  '999999999999.9999','-999999999999.9999','1000000000000','-1000000000000','0.0001','0.00001',
  '0.00000','99999999999999999999999999999999','99999999999999999999999999999999x',
  '1000000000000.00001','1000000000000.00001x','','+','-','.5','1.',' 1','1 ','1e2','1,0','1.2.3','--1','+-1'];
const parsing=texts.map(text=>{
  const match=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if(!match)return {text,status:3};
  const fraction=match[3]||'';
  if(fraction.length>4)return {text,status:5};
  const value=BigInt(match[2])*scale+BigInt(fraction.padEnd(4,'0'));
  return {text,...bounded(match[1]==='-'?-value:value)};
});
const values=[0n,1n,-1n,scale,-scale,scale-1n,-scale+1n,maximum,-maximum,maximum-1n,-maximum+1n,
  327670000n,327679999n,327680000n,-327680000n,-327689999n,-327690000n,100000000000n];
for(let index=0;index<8;index++)values.push(random());
const conversion=values.map(raw=>({raw:String(raw),text:format(raw),
  ...(raw/scale < -32768n || raw/scale > 32767n?{status:1}:{status:0,integer:String(raw/scale)})}));
const file=path.resolve(__dirname,'../src/scc/__tests__/data/bcd-vectors.json');
const content=JSON.stringify({arithmetic,parsing,conversion},null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==content)throw new Error('BCD vectors differ from BigInt reference');console.log('[bcd-vectors] exact BigInt vectors match');}
else {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
