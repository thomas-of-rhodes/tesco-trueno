/* Tesco Trueno - tools/same.js
   Does a change alter the sim? The same seeds run with two variants and their
   whole-state fingerprints compared - they must match to the bit.
     node tools/same.js "<variant A code>" "<variant B code>" [seeds] [sim secs] [report expr]
   e.g. node tools/same.js "" "sdfAt = sdfAtSlow" 4 600 */
'use strict';
const { Worker } = require('worker_threads');
const path = require('path');
const A = process.argv[2] || '', B = process.argv[3] || '';
const n = +(process.argv[4] || 4), secs = +(process.argv[5] || 600), report = process.argv[6] || null;
const t0 = Date.now();
function run(seed, code){
  return new Promise(function(done){
    const w = new Worker(path.join(__dirname, 'sim-thread.js'),
      { workerData:{ root:path.join(__dirname, '..'), seed:seed, ticks:secs * 120, code:code, every:600, report:report } });
    w.on('message', function(m){ w.terminate(); done(m.result || { error:m.error }); });
  });
}
const jobs = [];
for (let i = 0; i < n; i++){ jobs.push(run(1000 + i, A)); jobs.push(run(1000 + i, B)); }
Promise.all(jobs).then(function(r){
  let same = 0;
  for (let i = 0; i < n; i++){
    const a = r[2 * i], b = r[2 * i + 1];
    if (a.error || b.error){ console.log('seed ' + (1000 + i) + ' error: ' + (a.error || b.error).slice(0, 300)); continue; }
    const ok = a.fp === b.fp;
    if (ok) same++;
    console.log('seed ' + (1000 + i) + ': ' + a.fp + ' ' + (ok ? '==' : '!=') + ' ' + b.fp +
                '   ' + (a.ms / 1000).toFixed(0) + ' s vs ' + (b.ms / 1000).toFixed(0) + ' s' +
                (report ? '   report ' + JSON.stringify(a.report) + ' / ' + JSON.stringify(b.report) : ''));
  }
  console.log(same + ' of ' + n + ' identical, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
});
