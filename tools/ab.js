/* Tesco Trueno - tools/ab.js
   The lab's A/B comparison, in the terminal: the same seeds with two variants,
   every lab reading side by side, B-A paired over seeds with 2 standard errors.
     node tools/ab.js "<variant A code>" "<variant B code>" [seeds] [sim secs] [threads]
   e.g. node tools/ab.js "" "BRAINS.granny.policy = 'random'" 22 600 */
'use strict';
const { Worker } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const root = path.join(__dirname, '..');
/* "@path" anywhere in a variant is replaced by that file's contents - for a
   brain file, e.g. "@brains/granny.brain.js BRAINS.granny.policy = 'net';" */
const expand = function(code){
  return code.replace(/@(\S+)/g, function(m, f){ return fs.readFileSync(path.join(root, f), 'utf8') + '\n'; });
};
const A = expand(process.argv[2] || ''), B = expand(process.argv[3] || '');
const seed0 = +(process.env.SEED0 || 1000);
const n = +(process.argv[4] || 11), secs = +(process.argv[5] || 600);
const par = +(process.argv[6] || Math.max(1, os.cpus().length - 2));
/* LAB_ROWS, from the runner itself, so the rows are the lab's own. */
vm.runInThisContext('var window = globalThis, self = globalThis; var LAB_WORKER = true;' + fs.readFileSync(path.join(root, 'js/lab-run.js'), 'utf8'));
const ROWS = vm.runInThisContext('LAB_ROWS');

function run(seed, code){
  return new Promise(function(done){
    const w = new Worker(path.join(__dirname, 'sim-thread.js'),
      { workerData:{ root:root, seed:seed, ticks:secs * 120, code:code, every:600 } });
    w.on('message', function(m){ w.terminate(); done(m.result || { error:m.error }); });
    w.on('error', function(e){ done({ error:String(e) }); });
  });
}
const specs = [];
for (let i = 0; i < n; i++){ specs.push([seed0 + i, A]); specs.push([seed0 + i, B]); }
const out = new Array(specs.length);
let next = 0, fin = 0;
const t0 = Date.now();
function pump(){
  while (next < specs.length && next - fin < par){
    const i = next++;
    run(specs[i][0], specs[i][1]).then(function(r){ out[i] = r; fin++; if (fin === specs.length) report(); else pump(); });
  }
}
const mean = function(a){ return a.length ? a.reduce(function(s, x){ return s + x; }, 0) / a.length : null; };
const f = function(x){ return x === null || x === undefined || !isFinite(x) ? '    -' : (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2)).padStart(7); };
function report(){
  const errs = out.filter(function(r){ return r.error; });
  for (const e of errs.slice(0, 3)) console.log('ERROR: ' + String(e.error).slice(0, 500));
  console.log('reading'.padEnd(34) + '      A      B    B-A    +/-');
  let grp = '';
  for (const row of ROWS){
    if (row[2] !== grp){ grp = row[2]; console.log('-- ' + grp); }
    const k = row[0], a = [], b = [], d = [];
    for (let i = 0; i < n; i++){
      const x = out[2 * i], y = out[2 * i + 1];
      const xv = x.metrics ? x.metrics[k] : null, yv = y.metrics ? y.metrics[k] : null;
      if (xv !== null && xv !== undefined) a.push(xv);
      if (yv !== null && yv !== undefined) b.push(yv);
      if (xv !== null && xv !== undefined && yv !== null && yv !== undefined) d.push(yv - xv);
    }
    const md = mean(d);
    const se = d.length > 1 ? Math.sqrt(d.reduce(function(s, x){ return s + (x - md) * (x - md); }, 0) / (d.length - 1) / d.length) : null;
    const flag = row[3] === 'zero' ? ((mean(a) || 0) + (mean(b) || 0) > 0 ? '  <-- must be 0' : '')
               : (se !== null && Math.abs(md) > 2 * se ? '  *' : '');
    console.log(('  ' + row[1]).padEnd(34) + f(mean(a)) + f(mean(b)) + f(md) + f(se === null ? null : 2 * se) + flag);
  }
  const touch = out.reduce(function(s, r){ return s + (r.screen || 0); }, 0);
  console.log('screen touched while stepping: ' + touch + '   (' + n + ' seeds x ' + secs / 60 + ' sim min, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
}
pump();
