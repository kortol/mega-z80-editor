import('./src/assembler/parser/gen/z80_parser.js').then(p => {

  const tracer = {
    trace(event) {
      const indent = ' '.repeat(event.depth * 2);
      if (event.type === 'rule.enter') {
        console.log(`${indent}→ Enter ${event.rule}`);
      } else if (event.type === 'rule.match') {
        console.log(`${indent}✔ Match ${event.rule}`);
      } else if (event.type === 'rule.fail') {
        console.log(`${indent}✖ Fail ${event.rule}`);
      }
    },
  };

  const fs = require('fs');
  const s = fs.readFileSync('./src/assembler/examples/sample.asm', 'utf8');
  console.dir(p.default.parse(s, { tracer }), { depth: null });
});