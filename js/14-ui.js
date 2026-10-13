/* Tesco Trueno - 14-ui.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ============================================================ what they think ===
   Every cast member now carries an explicit state for the whole of its visit, and
   the useful accident of that is that the state IS the thought. There is nothing
   to invent and nothing to keep in step: if she is in `muddled` then she is
   standing where she left the car wondering about it, and the bubble can simply
   say so. It is the cheapest feature in the file and it explains more of the sim
   than any of the telemetry panels do.

   One line, picked deterministically from the being's own id so it does not
   flicker between frames, and written as the thought rather than the state name -
   'this is where I left it' rather than 'muddled'. */
const HOVER = { mx:-1, my:-1 };

function pickLine(b, lines){
  if (!lines.length) return '';
  let h = 0;
  const id = String(b.cid || 'x');
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return lines[h % lines.length];
}

function thoughtOf(b){
  /* Somebody is driving each of these, and they have the same opinions as
     everybody else - they are just having them at the wheel. Temper picks the
     register: the Jazz is in no rush and the A4 is already late. */
  if (b.model){
    if (b.tow) return b.tow.loaded ? pickLine(b, ['nobody ever comes back for these', 'right. home.',
                                                  'another one for the pound'])
                                   : pickLine(b, ['just doing my job, pal', 'paid by the tow, pal',
                                                  'one way? not for me it\'s not']);
    const hot = temperOf(b) > 0.7;
    if (b.held) return 'why am i in the air';
    if (b.swim) return b.depth > 0.6 ? 'glub' : 'oh no. oh no no no.';
    if ((b.wetK || 0) > 0.25) return pickLine(b, ['nice and steady in this', 'no rush in this']);
    if (rainHere(b.x, b.y) > 0.7) return 'wipers on full';
    if (b.airborne) return 'AAAAAAA';
    if (b.rolling) return 'the handbrake. the HANDBRAKE.';
    if (b.rogue && (b.state === 'go' || b.state === 'in'))
      return pickLine(b, ['one way, my foot', 'i\'m not going all the way round',
                          'it\'s only one way if you let it be']);
    if (b.onDetour) return hot ? 'i am not waiting for this'
                               : 'i\'ll just go round, then';
    if ((b.jammed || 0) > 4) return hot ? pickLine(b, ['come ON', 'oh for heaven\'s sake'])
                                        : pickLine(b, ['waiting', 'no rush', 'we\'ll get there']);
    if (b.ped !== undefined && b.ped < 4) return 'mind yourself';
    if (b.state === 'park') return pickLine(b, ['right, in we go', 'this\'ll do',
                                                'is that straight? near enough.']);
    if (b.state === 'out') return 'nothing coming... nothing coming...';
    if (b.state === 'go') return pickLine(b, ['let\'s get home before it gets too late',
                                              'out. out. out.', 'that\'s the shopping done']);
    if (b.state === 'idle') return 'well, this is new';
    /* state 'in' - still looking */
    const full = BAYS.filter(function(q){ return q.car; }).length / Math.max(1, BAYS.length);
    if (full > 0.3) return pickLine(b, ['oo it\'s busy', 'where should i park',
                                        'there is nothing here']);
    return pickLine(b, ['looking for a space', 'where should i park',
                        'something near the doors']);
  }
  if (b === car){
    if (AQUA > 0.3) return 'WHEEEEEE';
    if (simClock - (car.soakAt === undefined ? -99 : car.soakAt) < 6)
      return pickLine({cid:'t3'}, ['SPLOOSH', 'sorry! not sorry.']);
    if (MOOD.sulk) return pickLine({cid:'t1'}, ['booo, it\'s too busy',
                                                'i\'m going to sit on TikTok for a bit']);
    if ((MOOD.shine || 0) > 0) return 'nobody about. perfect.';
    if (b.dodging) return 'MIND OUT';
    if (Math.hypot(b.vx, b.vy) > 9) return 'yeeeees';
    if (MOOD.fret > 0.6) return 'everyone is in my way';
    if (b.swim) return b.depth > 0.6 ? 'glub glub' : 'i am a CAR. cars do not SWIM.';
    if (rainHere(car.x, car.y) > 0.7) return 'can\'t see a THING';
    if (b.voidAt !== undefined && simClock - b.voidAt < 90 && b.voidHow === 'tay')
      return pickLine({cid:'t2'}, ['i can still taste the river', 'there is a fish in my exhaust']);
    if (b.voidAt !== undefined && simClock - b.voidAt < 90)
      return pickLine({cid:'t2'}, ['i went somewhere. there was nothing there.',
                                   'never again', 'what WAS that']);
    return 'seagulls. somewhere. i can feel it.';
  }
  /* In the river. */
  if (b.swim){
    if (b.kind === 'gull') return b.wetT > b.floatT ? 'right, that\'s enough of that'
                                                  : 'lovely';
    if (b.kind === 'fox') return 'foxes can swim, actually';
    if (b.kind === 'manager') return 'this suit is dry clean only';
    if (b.kind === 'trolleyboy') return 'not paid enough for this';
    if (b.kind === 'granny') return pickLine(b, ['i\'ll just float, then',
                                                'my good coat']);
    return pickLine(b, ['the tay is COLD', 'which way is the shore']);
  }
  /* The rain. Soaked first, because that is all you would be thinking about. */
  if (b.soakUntil !== undefined && simClock < b.soakUntil){
    if (b.kind === 'granny') return pickLine(b, ['my GOOD coat', 'soaked. absolutely SOAKED.']);
    if (b.kind === 'manager') return pickLine(b, ['i know that car', 'right. RIGHT.']);
    if (b.kind === 'trolleyboy') return 'brilliant. just brilliant.';
    return pickLine(b, ['you absolute WEAPON', 'cheers. CHEERS for that.']);
  }
  if (b.brollyT !== undefined && simClock - b.brollyT < 12)
    return b.kind === 'granny' ? 'come BACK' : 'my UMBRELLA';
  if (rainHere(b.x, b.y) > 0.6){
    if (b.kind === 'gull') return 'into the wind. obviously.';
    if (b.kind === 'fox') return 'hate this';
    if (b.kind === 'trolleyboy') return 'hood up. head down.';
    if (b.kind === 'manager') return 'company umbrella. company weather.';
    if (brollyUp(b)) return b.kind === 'granny' ? 'hold on to it, hold ON'
                                                : 'this thing is useless sideways';
    return b.kind === 'granny' ? 'oh, it\'s teeming' : 'it\'s coming down SIDEWAYS';
  }
  /* Back from the Tay. */
  if (b.voidAt !== undefined && simClock - b.voidAt < 150 && b.voidHow === 'tay'){
    if (b.kind === 'manager') return pickLine(b, ['dripping. on the shop floor.',
                                                 'that is going in the incident book']);
    if (b.kind === 'trolleyboy') return pickLine(b, ['the tay. AGAIN.',
                                                    'there are trolleys in the tay. loads.']);
    if (b.kind === 'gull') return 'nice paddle';
    if (b.kind === 'fox') return 'never speak of this';
  }
  /* Back from the void, and not over it. */
  if (b.voidAt !== undefined && simClock - b.voidAt < 150){
    if (b.kind === 'manager') return pickLine(b, ['that is going in the incident book',
                                                 'who signed off on the void']);
    if (b.kind === 'trolleyboy') return pickLine(b, ['not paid enough for the void',
                                                    'there were trolleys down there. hundreds.']);
    if (b.kind === 'gull') return 'there is no sea out there';
    if (b.kind === 'fox') return 'no bins in the dark';
  }
  if (b.carVoid && !b.towed && (b.life === 'muddled' || b.life === 'hunting'))
    return pickLine(b, ['it\'s not anywhere. it\'s not ANYWHERE.',
                        'cars do not just vanish']);
  if (b.kind === 'gull'){
    if ((b.gz || 0) > 0.3) return pickLine(b, ['good view from up here',
                                               'this\'ll do', 'mine now']);
    if (b.z > 0.3) return 'RUN';
    if ((b.fed || 0) > 6) return 'i have eaten so much rubber';
    return pickLine(b, ['chips', 'is that a chip', 'tyre. delicious.']);
  }
  if (b.kind === 'fox') return pickLine(b, ['bins', 'the bins are this way',
                                            'nobody here but me']);
  if (b.kind === 'manager' && (b.ticketBay || (b.ticketed && simClockNow() - b.ticketed < 4)))
    return b.night ? pickLine(b, ['fine. a ticket.', 'whose is this even', 'not paid enough for parking'])
                   : pickLine(b, ['you can\'t just LEAVE that there', 'third time. THIRD.',
                                  'that is a ticket, sunshine']);
  if (b.kind === 'manager' && b.night){
    if (HELP.length) return liveBeing('trolleyboy') ? 'somebody else can get that'
                                                    : 'nobody to radio. it\'s just me.';
    if (LORRY.on) return pickLine(b, ['another lorry. brilliant.', 'sign here, sign there']);
    if (beingNear(b, ['fox'], 12)) return 'evening, fox';
    if (Math.hypot(car.x - b.x, car.y - b.y) < 16) return 'not tonight. please.';
    return pickLine(b, ['not my problem till six', 'is it six yet', 'i could be asleep',
                        'tea break. it is always tea break.']);
  }
  if (b.kind === 'manager'){
    if (HELP.length) return 'where is that boy';
    if (beingNear(b, ['gull'], 12)) return 'those bloody gulls';
    if (Math.hypot(car.x - b.x, car.y - b.y) < 16) return 'and THAT thing';
    return pickLine(b, ['clipboard', 'standards', 'nobody is working hard enough']);
  }
  if (b.kind === 'trolleyboy'){
    if (b.job) return 'the ' + (b.job.who.carSprite || 'car') +
                      '. two rows over. obviously.';
    if (b.carry) return 'that\'s another one';
    if (b.state === 'smoking' || b.hold > 0) return 'five minutes';
    if (isNight()) return pickLine(b, ['is it still today', 'they said this was temporary',
                                       "what's a weekend"]);
    return pickLine(b, ['trolleys', 'forty-one trolleys',
                        'somebody has put one in the hedge again']);
  }
  const gran = b.kind === 'granny';
  if (b.towed && b.life === 'toExit') return pickLine(b, ['forty quid to get it back. FORTY.',
                                                          'i was ten minutes over']);
  if (b.forgot && b.life === 'toExit') return pickLine(b, ['i\'ll get the bus home, i think',
                                                           'lovely day for the bus']);
  if (b.toWork) return pickLine(b, ['clocking on', 'early shift. again.', 'right. tills.']);
  if (b.staff && (b.life === 'toCar' || b.life === 'outDoors'))
    return pickLine(b, ['end of shift. finally.', 'home, feet up', 'never again. see you tomorrow.']);
  switch (b.life){
    case 'arriving':  return gran ? 'right then' : 'in and out, that\'s the plan';
    case 'toDoors':   return gran ? pickLine(b, ['milk, bread, and a wee look at the cakes',
                                                 'i\'ll not be long'])
                                  : pickLine(b, ['milk. just milk.', 'i have a list']);
    case 'outDoors':  return 'that\'s that done';
    case 'toTown':    return gran ? pickLine(b, ['into town for a wee wander', 'the free parking, i\'ll not be long'])
                                  : pickLine(b, ['three hours free. plenty.', 'nipping into town']);
    case 'toCar':     if (b.ownBay && (b.ownBay.tickets || 0) > 0 &&
                          Math.hypot(b.ownBay.x - b.x, b.ownBay.y - b.y) < 14)
                        return b.ownBay.tickets > 1 ? 'how many TICKETS' : 'a TICKET?';
                      if (b.fromTown) return pickLine(b, ['back for the car', 'that went quicker than i thought']);
                      return gran ? 'now then, where did i put it'
                                  : pickLine(b, ['row D. or was it C.', 'this way, i think']);
    case 'muddled':   if (b.towed) return pickLine(b, ['they\'ve TOWED it', 'oh you are KIDDING me']);
                      return pickLine(b, ['...this is where i left it',
                                          'i left it RIGHT here']);
    case 'hunting':   return pickLine(b, ['it\'s around here somewhere',
                                          'they all look the same']);
    case 'seekHelp':  return 'i\'ll find somebody who works here';
    case 'waitHelp':  return 'they said somebody was coming';
    case 'following': return gran ? 'oh, you\'ve found it? bless you'
                                  : 'oh thank god';
    case 'toExit':    return pickLine(b, ['i\'ll walk. i\'ll just walk.',
                                          'i am going to write to somebody']);
  }
  if (b.down > 0) return 'well that was unnecessary';
  if (b.leaving) return 'home, then';
  return gran ? 'lovely day for it' : '...';
}

/* Who is under the pointer. Same projection the hand uses, and the head rather
   than the feet, because that is where the eye goes. */
function castAt(mx, my){
  let best = null, bd = 30;
  const test = function(o, wx, wy, wz){
    const q = P(wx, wy);
    const d = Math.hypot(SX(q) - mx, SY(q, wz) - my);
    if (d < bd){ bd = d; best = o; }
  };
  for (const b of BEINGS){
    if (beingAbsent(b)) continue;
    test(b, b.x, b.y, b.z + (b.gz || 0) + 0.9);
  }
  for (const c of CARS){
    if (c.done) continue;
    test(c, c.x, c.y, (c.z || 0) + (c.airborne || 0) + 0.8);
  }
  test(car, car.x, car.y, 0.7);
  return best;
}

/* The cloud. The field raw is nine or ten live cells out of six hundred and
   eighty, which drawn one blob per cell is a handful of dots - I tried it, and
   it was invisible on tarmac at normal zoom. So it goes through two 3x3 means
   first, which spreads those ten cells into about a hundred with a gradient
   between them, and then each one is drawn as a soft circle nearly two cells
   wide. The overlaps do the rest: additive blending turns a hundred overlapping
   translucent circles into one cloud with bands in it, and the bands are
   isobars, because that is exactly what they are - a smoothed scalar field drawn
   by magnitude.
   Brightness is ABSOLUTE, not normalised to the current peak. Normalising would
   look better on a quiet morning and would also be a lie: the whole point of a
   barometric readout is that 60 means the same thing on Tuesday as it does on
   Saturday. A quiet car park gets a faint haze and a busy one glows. */
function drawExcite(){
  if (!EXC_ON) return;
  for (let pass = 0; pass < 2; pass++){
    const src = pass ? EXE : EXC, dst = pass ? EXD : EXE;
    for (let j = 0; j < EGH; j++){
      for (let i = 0; i < EGW; i++){
        let sum = 0, cnt = 0;
        for (let dj = -1; dj <= 1; dj++){
          for (let di = -1; di <= 1; di++){
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= EGW || jj >= EGH) continue;
            sum += src[jj * EGW + ii]; cnt++;
          }
        }
        dst[j * EGW + i] = sum / cnt;
      }
    }
  }
  g2.save();
  g2.globalCompositeOperation = 'lighter';
  const rad = ECELL * K * 1.75;
  for (let j = 0; j < EGH; j++){
    for (let i = 0; i < EGW; i++){
      const v = EXD[j * EGW + i];
      if (v < 0.05) continue;
      const q = P(EX0 + (i + 0.5) * ECELL, EY0 + (j + 0.5) * ECELL);
      const sx = SX(q), sy = SY(q, 0);
      /* Square root rather than linear, so the faint outskirts are actually
         visible instead of being mathematically present and optically absent -
         which is what killed the first attempt. */
      const t = Math.min(1, v / 4);
      const a = 0.030 + 0.26 * Math.sqrt(t);
      /* Amber through to white-hot, which is the only legible way to show a
         magnitude on tarmac this dark. */
      const gg = Math.round(118 + 112 * t), bb = Math.round(34 + 180 * t * t);
      const grd = g2.createRadialGradient(sx, sy, 0, sx, sy, rad);
      grd.addColorStop(0, 'rgba(255,' + gg + ',' + bb + ',' + a.toFixed(3) + ')');
      grd.addColorStop(0.55, 'rgba(255,' + gg + ',' + bb + ',' +
                                (a * 0.45).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(255,' + gg + ',' + bb + ',0)');
      g2.fillStyle = grd;
      g2.beginPath();
      /* Flattened two to one, like everything else on the ground plane: a round
         blob reads as a sphere hovering over the car park rather than a patch
         of it. */
      g2.ellipse(sx, sy, rad, rad * 0.5, 0, 0, 6.2832);
      g2.fill();
    }
  }
  g2.restore();
  /* And the number in the middle of each one, which is the readout. */
  g2.save();
  g2.font = '600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  for (const hs of EXC_HOT){
    const q = P(hs.x, hs.y);
    const sx = SX(q), sy = SY(q, 0);
    const txt = hs.v.toFixed(0);
    g2.lineWidth = 3.5;
    g2.strokeStyle = 'rgba(9,11,13,0.9)';
    g2.strokeText(txt, sx, sy);
    g2.fillStyle = hs.v > 45 ? '#fff2cf' : hs.v > 18 ? '#ffe0a0' : '#e2a95f';
    g2.fillText(txt, sx, sy);
  }
  g2.restore();
}

function drawThought(){
  if (HOVER.mx < 0) return;
  const who = castAt(HOVER.mx, HOVER.my);
  if (!who) return;
  const txt0 = thoughtOf(who);
  if (!txt0) return;
  /* Who is thinking it. A person by name, a car by whose it is. */
  const tag = who === car ? 'Trueno'
            : who.model ? (who.veh ? vehName(who.veh) : '')
            : (who.name || '');
  const txt = tag ? tag + ':  ' + txt0 : txt0;
  const q = P(who.x, who.y);
  const hz = (who === car) ? 1.3
           : who.model ? (who.z || 0) + (who.airborne || 0) + 1.5
           : who.z + (who.gz || 0) + 1.75;
  const ax = SX(q), ay = SY(q, hz);
  g2.save();
  g2.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const w = g2.measureText(txt).width + 16;
  const h = 22;
  /* Above and a little right, flipped to stay on screen. */
  let bx = ax + 14, by = ay - 34;
  if (bx + w > cv.width / dpr() - 8) bx = ax - 14 - w;
  if (by < 8) by = ay + 18;
  const r = 6;
  g2.beginPath();
  g2.moveTo(bx + r, by);
  g2.lineTo(bx + w - r, by);       g2.quadraticCurveTo(bx + w, by, bx + w, by + r);
  g2.lineTo(bx + w, by + h - r);   g2.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
  g2.lineTo(bx + r, by + h);       g2.quadraticCurveTo(bx, by + h, bx, by + h - r);
  g2.lineTo(bx, by + r);           g2.quadraticCurveTo(bx, by, bx + r, by);
  g2.closePath();
  g2.fillStyle = 'rgba(9,11,13,0.92)';
  g2.fill();
  g2.strokeStyle = '#3a444c';
  g2.lineWidth = 1;
  g2.stroke();
  /* The tail: two little bubbles back toward the head, which reads as a thought
     rather than as speech. */
  const tx = bx < ax ? bx + w : bx;
  for (let i = 1; i <= 2; i++){
    const f = i / 3;
    g2.beginPath();
    g2.arc(tx + (ax - tx) * f, by + h + (ay - by - h) * f, 3.4 - i * 0.9, 0, 6.2832);
    g2.fillStyle = 'rgba(9,11,13,0.92)';
    g2.fill();
    g2.strokeStyle = '#3a444c';
    g2.stroke();
  }
  g2.fillStyle = '#cfd6db';
  g2.textBaseline = 'middle';
  g2.fillText(txt, bx + 8, by + h / 2 + 0.5);
  g2.restore();
}

/* ONE step of the simulation, DT long. The page calls it from the frame loop
   and a harness or a background worker can call it directly; it does not
   touch the screen. SIM_TICK counts steps for the whole run: Trueno decides on
   every fourth STEP, which used to be every fourth step within a FRAME - so
   when he decided depended on how many steps a frame happened to hold, i.e.
   on the frame rate, and no two machines (or two loads) had the same day. */
let SIM_TICK = 0;
function simStep(){
  /* A held or airborne car is out of the driving model entirely: no perception,
     no tyres, no contacts. It comes back the instant it lands. */
  /* Driven off the edge of the world, which manual driving can do. */
  if (!car.held && !car.airborne && inVoid(car.x, car.y)){ car.airborne = -1e-3; car.vzz = 0; }
  const grounded = !car.held && !car.airborne;
  if (auto && grounded && (SIM_TICK % 4) === 0) drive(car, CTL);
  if (grounded){
    const wasTouching = car.touching;
    stepPhysics(car, CTL, DT); collide(car); collideMovers(car); collidePeople(car);
    /* Counted for the lab: the start of each contact with the world. */
    if (car.touching && !wasTouching) MOOD.bumps = (MOOD.bumps || 0) + 1;
  } else {
    stepCarFall(DT);
  }
  stepMovers(DT); stepBeings(DT); stepWeather(DT); washRubber(DT); stepRain(DT);
  trafficStep(DT); stepCars(DT); stepCensus(DT);
  /* The same multiplier the clock itself gets. A lamp takes five minutes of
     ITS day to come up, so running the day at twenty times should not leave
     every lamp stuck at a quarter brightness all night. */
  stepLamps(DT * (typeof fastDay !== 'undefined' && fastDay ? 20 : 1));
  simClock += DT; stampVisit(car.x, car.y); stepLorry(WORLD, DT);
  stepBus(WORLD, DT); stepExcite(DT);
  if (trace && !car.held && !car.airborne) layRubber(car);
  SIM_TICK++;
}

let excT = 0;
function frame(t){
  if (!last) last = t;
  /* THE one place dt enters the program, so it is the one place worth guarding.
     `Math.min(0.1, NaN)` is NaN, so the old clamp passed a bad clock straight
     through to every integrator in the file - the car, the cast, the weather,
     the excitement field, the camera heads - and most of those are accumulators
     with no way back out. One frame of NaN would have been permanent.
     The sweep that found this found exactly one such poisoning live (the camera
     heads, via a zero-width canvas), and the lesson was that guarding each
     accumulator is the wrong shape of fix: there are a dozen of them and only
     one dt. A clock that goes backwards gets the same treatment, because the
     one thing you can say about a negative frame time is that nothing good
     comes of integrating it. */
  let dtr = (t - last) / 1000;
  if (!(dtr >= 0)) dtr = 0;
  dtr = Math.min(0.1, dtr);
  last = t;
  readInput();
  acc += dtr;
  stepHand(dtr);
  /* Fixed steps, however the frames fall. */
  while (acc >= DT){ simStep(); acc -= DT; }
  saveTick(dtr);
  /* Four times a second is plenty for the peaks - they are a reading of a field
     with a six second half-life, so recomputing them every frame would just be
     the same answer a hundred and twenty times. */
  excT = (excT || 0) + dtr;
  if (excT > 0.25){ excT = 0; EXC_HOT = hotspots(4); }
  if (VIEW === 'cctv'){
    stepCCTV(dtr);
    drawCCTV();
  } else {
    /* Trueno's camera owns the projection in his view; the fishtank keeps the
       centre-locked whole-site frame it has always had, with the wheel and the
       god-mode pan on top. */
    if (VIEW === 'trueno') stepTruenoCam(dtr);
    else stepGod(dtr);
    render();
    drawBeam();
    drawExcite();
    drawThought();
  }
  requestAnimationFrame(frame);
}
function resize(){
  const d = dpr();
  cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d);
  fit();
}
const $ = function(id){ return document.getElementById(id); };
$('bRun').onclick = function(){
  const el = $('tests'), on = !el.classList.contains('on');
  if (on && !el.dataset.ran){
    el.dataset.ran = '1';
    $('stat').textContent = 'running the suite, about 15 s...';
    setTimeout(runTests, 30);
  }
  el.classList.toggle('on', on); this.classList.toggle('on', on);
};
$('bRays').onclick = function(){ showRays = !showRays; this.classList.toggle('on', showRays); };
/* Zoom inside the crop only. The view angle is locked, the centre is locked, and
   there is no pan - so the wheel is the only camera control there is. */
cv.addEventListener('wheel', function(e){
  e.preventDefault();
  if (VIEW === 'trueno'){
    /* A bias on the follow distance rather than an absolute zoom, so it still
       pulls back when he gets a move on. */
    TCAM.bias = Math.max(-0.9, Math.min(1.1,
      TCAM.bias + (e.deltaY < 0 ? 0.16 : -0.16)));
    $('zoomR').textContent = TCAM.bias === 0 ? 'wheel to zoom'
      : 'follow ' + (TCAM.bias > 0 ? 'close' : 'wide');
    return;
  }
  if (VIEW === 'cctv') return;          // the cameras own their own zoom
  const was = zoom;
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
                  zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  if (zoom !== was){
    applyZoom();
    $('zoomR').textContent = zoom <= 1.001 ? 'wheel to zoom'
                                           : 'zoom ×' + zoom.toFixed(1);
  }
}, { passive:false });
$('bAuto').onclick = function(){ auto = !auto; this.classList.toggle('on', auto);
  if (!auto){ CTL.thr = CTL.brk = CTL.hb = CTL.rev = 0; CTL.steer = 0; } };
/* The clock turns at one day per twenty minutes and the rain arrives on its
   own timer somewhere between three and fifteen. Both are the right rates to
   WATCH and hopeless to develop against, so here are the handles: skip forward
   two hours at a time, run the day fast, or just turn the rain on. */
$('bTime').onclick = function(){ TOD = (TOD + 1 / 12) % 1; settleLamps(); };
let fastDay = false;
$('bFast').onclick = function(){
  fastDay = !fastDay; this.classList.toggle('on', fastDay);
};
/* One switch for everything drawn on top of the car park. Both black boxes - the
   driving telemetry and the progress checklist - were development instruments,
   and between them they covered the top right and the bottom right of the view.
   The bottom right is the worst of it: the site has one way in, off a roundabout
   at the south-west, and that corner projects to exactly where the checklist
   sat, so the bus pulling up and every arrival and departure through the gate
   happened underneath it.
   They start hidden now, and the census goes in the same group - it is an
   overlay like the others, and the point of the button is that one press gives
   you a clean car park to watch. */
/* The progress checklist that used to be in this group is gone (Thomas,
   2026-10-12: "i can ask you, i don't need it on the page itself"). */
const OVERLAYS = ['tel', 'cen'];
function showOverlays(on){
  for (const id of OVERLAYS){
    const el = $(id);
    if (el) el.style.display = on ? '' : 'none';
  }
  const b = $('bPlan');
  if (b) b.classList.toggle('on', on);
}
$('bPlan').onclick = function(){
  showOverlays($('cen').style.display === 'none');
};
/* Its own switch rather than part of the overlay group: the cloud is something
   you would want on WHILE watching, and the two black boxes are the opposite. */
/* The three views. `skid marks`, `excitement` and `reset car` came off the bar
   to make room: the rubber stays on permanently (it is scenery, and the gulls
   eat it), and the excitement cloud is still there behind `EXC_ON` if it is ever
   wanted back - the FIELD runs either way, because the quad view steers by it. */
const VIEWS = { vFish:'fishtank', vCctv:'cctv', vTru:'trueno' };
function setView(v){
  VIEW = v;
  CCTV.on = (v === 'cctv');
  if (CCTV.on) cctvReset();
  if (v === 'trueno') truenoCamReset();
  if (v === 'fishtank') applyZoom();
  /* Only the quad view hides the caption - it would land across the top two
     monitors. Following Trueno still wants it, because the wheel feedback
     lives in it. */
  const hn = $('hint');
  if (hn) hn.style.display = (v === 'cctv') ? 'none' : '';
  for (const id in VIEWS){
    const b = $(id);
    if (b) b.classList.toggle('on', VIEWS[id] === v);
  }
}
for (const id in VIEWS)
  $(id).onclick = function(){ setView(VIEWS[this.id]); };
$('bRain').onclick = function(){
  const on = WX.spell <= 0;
  this.classList.toggle('on', on);
  if (on){
    WX.spell = 240; WX.rain = 1; WX.wet = Math.max(WX.wet, 0.55);
    /* And one already on its way across the river: here in about ten seconds. */
    SQ.ws = Math.max(SQ.ws, 7); spawnCell(150); SQ.cellT = 60;
  }
  else { WX.spell = 0; WX.rain = 0; WX.next = 400 + RND.weather() * 600; }
};
$('bGod').onclick = function(){
  HAND.on = !HAND.on; this.classList.toggle('on', HAND.on);
  if (!HAND.on) release();
  cv.style.cursor = HAND.on ? 'grab' : 'default';
};

/* ---------------------------------------------------------- the hand, wired ---
   Screen position is converted at the height the thing is actually at, not at
   ground level: converting a lifted trolley's cursor against z = 0 makes it lag
   the pointer by several metres up the screen, which feels broken. */
function handAt(e){
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
cv.addEventListener('mousedown', function(e){
  if (!HAND.on || e.button !== 0) return;
  const raw = handAt(e);
  const m = pointerView(raw[0], raw[1]);
  const hit = grabbableAt(m[0], m[1]);
  if (!hit){ pointerDone(); return; }
  e.preventDefault();
  /* Solved at the carry height from the very first frame - see handHeight. */
  const g = screenToGround(m[0], m[1], handHeight());
  pointerDone();
  HAND.x = g[0]; HAND.y = g[1]; HAND.px = g[0]; HAND.py = g[1];
  HAND.vx = 0; HAND.vy = 0;
  /* The monitor it was grabbed in owns the whole drag, even if the pointer
     wanders into another one. You picked it up on that screen; dragging it
     across the bezel and having the transform change underneath it would send
     the thing across the car park. */
  HAND.camI = m[2];
  /* That monitor is the god's now. The pull-back is relative to whatever the
     camera happened to be zoomed to when you clicked, so lifting something out
     of a tight shot opens it up and lifting something out of a wide one barely
     changes it - there is nothing to pull back from at the wide end. */
  if (CCTV.on && m[2] >= 0){
    const gc = CCTV.cams[m[2]];
    if (gc){
      CCTV.godI = m[2]; CCTV.godT = 0;
      gc.godZl = Math.max(0.15, gc.zl.p - 0.5);
    }
  }
  grab(hit);
  cv.style.cursor = 'grabbing';
});
/* Tracked always, not only while the hand is active - the thought bubble is a
   reading tool and should not need god mode switched on to use it. */
cv.addEventListener('mousemove', function(e){
  const r = cv.getBoundingClientRect();
  HOVER.mx = e.clientX - r.left; HOVER.my = e.clientY - r.top;
});
cv.addEventListener('mouseleave', function(){ HOVER.mx = -1; HOVER.my = -1; });
let handLast = 0;
addEventListener('mousemove', function(e){
  if (!HAND.on) return;
  const raw = handAt(e);
  if (!HAND.grabbed){
    const h = pointerView(raw[0], raw[1]);
    cv.style.cursor = grabbableAt(h[0], h[1]) ? 'grab' : 'default';
    pointerDone();
    return;
  }
  const m = pointerView(raw[0], raw[1], HAND.camI);
  const now = performance.now();
  const dt = Math.max(0.008, Math.min(0.1, (now - (handLast || now)) / 1000));
  handLast = now;
  const g = screenToGround(m[0], m[1], handHeight());
  pointerDone();
  /* Smoothed, so one jittery sample cannot launch a trolley into the Tay. */
  HAND.vx = HAND.vx * 0.55 + ((g[0] - HAND.px) / dt) * 0.45;
  HAND.vy = HAND.vy * 0.55 + ((g[1] - HAND.py) / dt) * 0.45;
  HAND.px = g[0]; HAND.py = g[1];
  HAND.x = g[0]; HAND.y = g[1];
});
addEventListener('mouseup', function(){
  if (!HAND.grabbed) return;
  release();
  cv.style.cursor = HAND.on ? 'grab' : 'default';
});
addEventListener('resize', resize);

/* Building the day. Called by 15-save.js once it knows whether there is a
   saved town to pour in first. */
function bootDay(){
  showOverlays(false);          // a clean car park to begin with
  WORLD = buildSite();
  seedTrolleys();
  seedCast();
  buildLattice();
  settleLamps();                 // whatever hour it opens at, the lamps are right
  resize();
}
/* The suite is no longer something to run on every page load. It has grown to
   25 starts x 45 s twice over for the manoeuvre comparison alone, plus the
   attractor, flick and weather runs - about forty seconds of simulation before
   the car park would so much as appear. It is a development harness, so it
   lives behind its button now and the sim starts immediately. The first
   frame is requested by 15-save.js, after any save has loaded. */
