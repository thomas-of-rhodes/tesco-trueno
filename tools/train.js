/* Tesco Trueno - tools/train.js
   Train the granny brain from the terminal (2026-10-13): the lab's training,
   with no browser to doze off when its window is hidden. Laptop only - the
   game itself stays a plain web page.

     node tools/train.js [--rounds 8] [--days 11] [--secs 600] [--seed 1000]
                         [--lr 0.01] [--threads 22] [--fresh]

   Round 0 copies the hand-written granny; each round after runs the brain and
   the hand-written granny on the same new days and learns from the brain's
   choices. Progress is saved after every round (tools/.train-state.json) and
   a re-run carries on from there unless --fresh. When it finishes, the best
   round's brain is written to brains/granny.brain.js - if one beat the
   hand-written granny. The game does not use it until it is switched on. */
'use strict';
const { Worker } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');

const root = path.join(__dirname, '..');
const arg = function(name, def){
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const fresh = process.argv.indexOf('--fresh') >= 0;
const STATE = path.join(__dirname, '.train-state.json');

/* The same maths as the lab: net.js and lab-train.js, loaded as they are. */
for (const f of ['js/net.js', 'js/lab-train.js'])
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename:f });
const G = globalThis;
/* A top-level const in a script loaded this way is not a property of the
   global object - reading it off G gave undefined, so the hand-written days
   kept no diary and round 0 had nothing to copy (2026-10-13). By name. */
const HAND_CODE = vm.runInThisContext('HAND_CODE');
if (typeof HAND_CODE !== 'string') throw new Error('HAND_CODE missing from js/lab-train.js');

function runOne(seed, ticks, code){
  return new Promise(function(done){
    const w = new Worker(path.join(__dirname, 'sim-thread.js'),
      { workerData:{ root:root, seed:seed, ticks:ticks, code:code, every:600 } });
    w.on('message', function(m){
      if (m.type === 'done'){ w.terminate(); done(m.result); }
      else if (m.type === 'error'){ w.terminate(); done({ error:m.error }); }
    });
    w.on('error', function(e){ done({ error:String(e.stack || e) }); });
  });
}
function runAll(specs, par, tick){
  return new Promise(function(done){
    const out = new Array(specs.length);
    let next = 0, live = 0, fin = 0;
    const go = function(){
      while (live < par && next < specs.length){
        const i = next++, sp = specs[i];
        live++;
        runOne(sp.seed, sp.ticks, sp.code).then(function(r){
          out[i] = r; live--; fin++;
          if (tick) tick(fin, specs.length);
          if (fin === specs.length) done(out); else go();
        });
      }
    };
    go();
  });
}
const num = function(x){
  if (x === null || x === undefined || !isFinite(x)) return '  -  ';
  return (x >= 0 ? ' ' : '') + x.toFixed(Math.abs(x) >= 10 ? 1 : 2);
};
/* Progress on a terminal; to a file (a log), only the finished lines. */
const say = function(t){ if (process.stdout.isTTY) process.stdout.write('\r' + t.padEnd(70)); };

async function main(){
  let T = null;
  if (!fresh && fs.existsSync(STATE)){
    T = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    if (T.done) T = null;
    else console.log('carrying on from round ' + T.next + ' (use --fresh to start again)');
  }
  if (!T){
    T = { cfg:{ R:+arg('rounds', 8), S:+arg('days', 11), ticks:Math.round(+arg('secs', 600) * 120),
                seed0:+arg('seed', 1000), lr:+arg('lr', 0.01) },
          rows:[], hive:null, best:null, st:{}, next:0, done:false };
  }
  const par = +arg('threads', Math.max(1, os.cpus().length - 2));
  const c = T.cfg;
  const save = function(){ fs.writeFileSync(STATE, JSON.stringify(T)); };
  const t0 = Date.now();
  console.log(c.R + ' rounds x ' + c.S + ' days of ' + (c.ticks / 7200) + ' sim min, ' + par + ' at once');

  if (T.next === 0){
    const seeds = []; for (let i = 0; i < c.S; i++) seeds.push(c.seed0 + i);
    const r0 = await runAll(seeds.map(function(sd){ return { seed:sd, ticks:c.ticks, code:HAND_CODE }; }), par,
                            function(f, n){ say('round 0: watching the hand-written grannies, ' + f + ' of ' + n); });
    const samples = [];
    for (const r of r0) if (r && r.tap) for (const e of r.tap) samples.push(e);
    const errs = r0.filter(function(r){ return !r || r.error; });
    if (errs.length) console.log('\n' + errs.length + ' runs failed: ' + String(errs[0].error).slice(0, 400));
    if (!samples.length){ console.log('round 0 collected no decisions - stopping rather than train from noise'); process.exit(1); }
    const cp = G.copyHand(samples);
    T.hive = cp.hive;
    const hd = r0.filter(function(r){ return r && r.metrics && r.metrics.grannyDay !== null; }).map(function(r){ return r.metrics.grannyDay; });
    T.rows.push({ round:0, note:'copied ' + samples.length + ' decisions, ' + (100 * cp.acc).toFixed(0) + '% the same', hand:G.mean(hd) });
    T.next = 1; save();
    say(''); console.log('\rround 0: ' + T.rows[0].note + ', hand-written day ' + num(T.rows[0].hand));
    console.log('round  brain  hand   brain-hand  +/-    chats(b/h)   company(b/h)  wet s(b/h)   sheltered(b/h) gave up');
  }
  for (let k = T.next; k <= c.R; k++){
    const specs = [];
    for (let i = 0; i < c.S; i++){
      const sd = c.seed0 + k * c.S + i;
      specs.push({ seed:sd, ticks:c.ticks, code:G.netCode(T.hive), arm:'net' });
      specs.push({ seed:sd, ticks:c.ticks, code:HAND_CODE, arm:'hand' });
    }
    const res = await runAll(specs, par, function(f, n){ say('round ' + k + ' of ' + c.R + ': ' + f + ' of ' + n + ' days'); });
    const rr = G.roundRow(k, specs, res);
    const r = rr.row;
    T.rows.push(r);
    if (r.diff !== null && (!T.best || r.diff > T.best.diff)) T.best = { diff:r.diff, round:k, hive:G.netCopy(T.hive) };
    G.learnFrom(T.hive, T.st, rr.samples, c.lr);
    T.next = k + 1; save();
    say('');
    console.log('\r' + String(k).padStart(5) + num(r.net) + num(r.hand) + '   ' + num(r.diff) + '  ' + num(r.se) +
                '   ' + num(r.chats) + '/' + num(r.chatsH) + '  ' + num(r.company) + '/' + num(r.companyH) +
                '   ' + num(r.wet) + '/' + num(r.wetH) + '   ' + num(r.shelter) + '/' + num(r.shelterH) + '   ' + num(r.gaveUp) +
                (r.errs ? '   ' + r.errs + ' FAILED: ' + r.err : ''));
  }
  T.done = true; save();
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  if (T.best && T.best.diff > 0){
    const meta = { trained:new Date().toISOString(), round:T.best.round, cfg:c, rows:T.rows };
    const out = path.join(root, 'brains', 'granny.brain.js');
    fs.mkdirSync(path.dirname(out), { recursive:true });
    fs.writeFileSync(out, '/* The granny hive, trained by tools/train.js (' + meta.trained + ', round ' + meta.round + ').\n' +
      '   22 neurons: 17 inputs -> 12 hidden -> 10 options. A town with no brain of its\n' +
      '   own starts from this one, once the game is switched to it. */\n' +
      'window.GRANNY_BRAIN = ' + JSON.stringify({ meta:meta, net:T.best.hive }) + ';\n');
    console.log('\ndone in ' + mins + ' min. Best: round ' + T.best.round + ' (' + num(T.best.diff) + ') -> brains/granny.brain.js');
  } else {
    console.log('\ndone in ' + mins + ' min. No round beat the hand-written granny, so no brain was written.');
  }
}
main().catch(function(e){ console.error(e); process.exit(1); });
