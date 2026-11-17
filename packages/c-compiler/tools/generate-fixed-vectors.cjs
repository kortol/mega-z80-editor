/* Exact host oracle. No floating point is used in any numeric expectation. */
const fs = require('node:fs');
const path = require('node:path');
const result = [];
for (const [type, width] of [['q8', 2], ['q16', 4]]) {
  const bits = BigInt(width * 8);
  const scale = 1n << (bits / 2n);
  const minimum = -(1n << (bits - 1n));
  const maximum = -minimum - 1n;
  const format = raw => {
    const sign = raw < 0n ? '-' : '';
    let value = raw < 0n ? -raw : raw;
    const integer = value / scale;
    value %= scale;
    let fraction = '';
    while (value) { value *= 10n; fraction += value / scale; value %= scale; }
    return sign + integer + (fraction ? '.' + fraction : '');
  };
  const bounded = raw => raw < minimum || raw > maximum ? {status:1} : {status:0, raw:String(raw)};
  const pairs = [[0n,0n],[1n,1n],[-1n,1n],[minimum,maximum],[minimum,-1n],[maximum,1n],
    [minimum,minimum],[maximum,maximum],[minimum,scale],[minimum,-scale],[maximum,scale],
    [scale+1n,scale/2n+1n],[-scale-1n,scale/2n+1n],[scale,0n],[0n,-scale],
    [maximum,1n],[minimum,1n],[scale-1n,scale-1n]];
  let seed = 0x65a3n;
  const random = () => { seed=(1664525n*seed+1013904223n)&((1n<<bits)-1n); return seed > maximum ? seed-(1n<<bits) : seed; };
  for(let index=0;index<12;index++) pairs.push([random(),random()]);
  const arithmetic = pairs.flatMap(([left,right]) => ['add','sub','mul','div'].map(op => {
    let expected;
    if(op==='div' && right===0n) expected={status:2};
    else expected=bounded(op==='add'?left+right:op==='sub'?left-right:op==='mul'?left*right/scale:left*scale/right);
    return {op,left:String(left),right:String(right),...expected};
  }));
  const texts = ['0','-0','+0','000000000000000000000001.5000','-0.1','0.1','1.25','-1.999999999999999999999',
    format(minimum),format(maximum),format(minimum-1n),format(maximum+1n),
    '127.9999999999999999999999999','-128.000000000000000000001',
    '32767.9999999999999999999999999','-32768.000000000000000000001',
    '0.'+'0'.repeat(width*4)+'1',format(1n)+'0'.repeat(20),
    '99999999999999999999999999999999','99999999999999999999999999999999x',
    '', '+','-','.5','1.',' 1','1 ','1e2','1,0','1.2.3','--1','+-1',
    '0.00390624999999999999999','0.00390625','0.0000152587890624999999999','0.0000152587890625'];
  const parsing=texts.map(text=>{
    const match=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
    if(!match)return {text,status:3};
    const fraction=match[3]||'';
    const denominator=10n**BigInt(fraction.length);
    const magnitude=(BigInt(match[2])*denominator+BigInt(fraction||'0'))*scale/denominator;
    return {text,...bounded(match[1]==='-'?-magnitude:magnitude)};
  });
  const values=[minimum,minimum+1n,maximum,maximum-1n,0n,1n,-1n,scale,-scale,scale-1n,-scale+1n,scale+1n,-scale-1n,scale/2n,-scale/2n];
  for(let index=0;index<8;index++)values.push(random());
  result.push({type,width,arithmetic,parsing,conversion:values.map(raw=>({raw:String(raw),text:format(raw),integer:String(raw/scale)}))});
}
const file=path.resolve(__dirname,'../src/scc/__tests__/data/fixed-vectors.json');
const content=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check')) {
  if(fs.readFileSync(file,'utf8')!==content)throw new Error('Fixed vectors differ from exact BigInt oracle');
  console.log('[fixed-vectors] exact BigInt vectors match');
} else { fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content); }
