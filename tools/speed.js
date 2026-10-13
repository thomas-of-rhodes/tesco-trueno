/* Tesco Trueno - tools/speed.js
   How fast the sim runs through a day, with nothing else in the way.
     node tools/speed.js [seed] [sim seconds] [threads]
   With threads > 1, that many days at once (seed, seed+1, ...) - which also
   shows how well the laptop's cores share the work. */
'use strict';
const { Worker } = require('worker_threads');
const path = require('path');
const root = path.join(__dirname, '..');
const seed = +(process.argv[2] || 1000), secs = +(process.argv[3] || 1200), n = +(process.argv[4] || 1);
const t0 = Date.now();
let done = 0;
const all = [];
for (let i = 0; i < n; i++){
  const w = new Worker(path.join(__dirname, 'sim-thread.js'),
    { workerData:{ root:root, seed:seed + i, ticks:secs * 120, speedEvery:60 * 120 } });
  w.on('message', function(m){
    if (m.type === 'error'){ console.error(m.error); process.exit(1); }
    all[i] = m.rows;
    if (++done === n){
      console.log('sim min  speed (x real time)  people  cars' + (n > 1 ? '   [first day of ' + n + ']' : ''));
      for (const r of all[0]) console.log(String(r.simSecs / 60).padStart(7) + '  ' + String(r.x).padStart(8) + '              ' +
                                          String(r.beings).padStart(5) + '  ' + String(r.cars).padStart(4));
      const wall = (Date.now() - t0) / 1000;
      console.log('\n' + n + ' day(s) of ' + secs / 60 + ' sim min in ' + wall.toFixed(0) + ' s: ' +
                  (n * secs / wall).toFixed(0) + ' sim seconds per second in all');
    }
  });
}
