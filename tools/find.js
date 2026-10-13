/* Tesco Trueno - tools/find.js
   Run many seeds with a variant and print a report only where a condition holds.
     node tools/find.js "<variant code>" "<condition expr>" "<report expr>" [seeds] [secs] [seed0]
   e.g. node tools/find.js "" "CENSUS.ev.inventedDrivers > 0" "JSON.stringify(CENSUS.log.slice(-5))" 22 1200 */
'use strict';
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');
const code = process.argv[2] || '', cond = process.argv[3] || 'true', rep = process.argv[4] || '""';
const n = +(process.argv[5] || 22), secs = +(process.argv[6] || 1200), s0 = +(process.argv[7] || 1000);
const par = Math.max(1, os.cpus().length - 2);
let next = 0, live = 0, fin = 0, hits = 0;
function go(){
  while (live < par && next < n){
    const seed = s0 + next++; live++;
    const w = new Worker(path.join(__dirname, 'sim-thread.js'),
      { workerData:{ root:path.join(__dirname, '..'), seed:seed, ticks:secs * 120, code:code, every:600,
                     report:'(' + cond + ') ? (' + rep + ') : null' } });
    w.on('message', function(m){
      w.terminate(); live--; fin++;
      if (m.error) console.log('seed ' + seed + ' ERROR ' + String(m.error).slice(0, 300));
      else if (m.result.report !== null && m.result.report !== undefined){ hits++; console.log('seed ' + seed + ': ' + m.result.report); }
      if (fin === n) console.log(hits + ' of ' + n + ' seeds matched'); else go();
    });
  }
}
go();
