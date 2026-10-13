/* Tesco Trueno - tools/profile.js
   Where a step's time goes, at a chosen point in the day.
     node tools/profile.js [seed] [from sim minute] [for sim seconds]
   Shares include what each function calls, so they overlap. */
'use strict';
const { Worker } = require('worker_threads');
const path = require('path');
const seed = +(process.argv[2] || 1000), from = +(process.argv[3] || 4) * 60 * 120, ticks = +(process.argv[4] || 120) * 120;
const names = ['drive', 'senses', 'scanGaps', 'corridorProbe', 'clearestSteer', 'lateralRoom', 'rearSense', 'probe',
  'stepCars', 'stepNpc', 'stepBeings', 'walkTo', 'stepMovers', 'routeTo', 'sdfAt', 'sdfNormal', 'nearestKind',
  'nearBoxes', 'sdRect', 'solid', 'collide', 'collidePeople', 'collideMovers', 'stepExcite', 'trafficStep', 'stepCensus'];
const w = new Worker(path.join(__dirname, 'sim-thread.js'),
  { workerData:{ root:path.join(__dirname, '..'), seed:seed, from:from, ticks:ticks, profile:names } });
w.on('message', function(m){
  if (m.type === 'error'){ console.error(m.error); process.exit(1); }
  console.log('from sim minute ' + from / 7200 + ', ' + ticks / 120 + ' s: ' + m.all.toFixed(0) + ' ms (' + m.x.toFixed(1) + 'x real time)');
  for (const r of m.rows) if (r[1] > 0.2) console.log(String(r[1]).padStart(6) + '%  ' + r[0].padEnd(16) + r[2] + ' calls');
});
