/* Tesco Trueno - 06-car-physics.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ============================================================= the car ===== */
function freshCar(x, y, h){
  return { x:x, y:y, h:h || 0, vx:0, vy:0, r:0, ax:0, d:0, ar:0,
           contact:0, dmg:0, hits:[], touching:false };
}
let car = freshCar(X0 + 30, BANDS[1] + AISLE_C, 0);      // an aisle, whatever the widths
const CTL = { steer:0, thr:0, brk:0, hb:0, rev:0 };

/* §3.2 slip angles are taken in each wheel's own frame against its own
   longitudinal speed. Against |vx| instead, reverse becomes stable and the
   J-turn stops existing. */
function stepPhysics(c, ctl, dt){
  // 1. steering actuator, rate limited
  const want = Math.max(-MAX_STEER, Math.min(MAX_STEER, ctl.steer * MAX_STEER));
  const md = STEER_RATE * dt;
  c.d += Math.max(-md, Math.min(md, want - c.d));

  // 2. slip angles
  const ufx = c.vx, ufy = c.vy + LF * c.r;
  const cd = Math.cos(c.d), sd = Math.sin(c.d);
  const flo = ufx * cd + ufy * sd, fla = -ufx * sd + ufy * cd;
  const af = Math.atan2(fla, Math.max(Math.abs(flo), 1.2));
  const urx = c.vx, ury = c.vy - LR * c.r;
  const ar = Math.atan2(ury, Math.max(Math.abs(urx), 1.2));

  // 3. load transfer from the previous step's longitudinal acceleration
  const Fzf = Math.max(60, M * (G * LR - c.ax * HCG) / L);
  const Fzr = Math.max(60, M * (G * LF + c.ax * HCG) / L);

  // 4. grip collapses with lateral slip SPEED, not slip angle
  const sf = Math.hypot(ufx, ufy) * Math.abs(Math.sin(af));
  const sr = Math.hypot(urx, ury) * Math.abs(Math.sin(ar));
  const mw = muWet(), muS = mw[0], muK = mw[1];
  const muf = muK + (muS - muK) * Math.exp(-sf / MU_V);
  const mur = muK + (muS - muK) * Math.exp(-sr / MU_V);
  const capF = muf * Fzf, capR = mur * Fzr;

  // 5. longitudinal, then the friction ellipse per axle
  const moving = Math.abs(c.vx) > 0.2 ? Math.sign(c.vx) : 0;
  let FxF = -F_BRAKE * BRK_F * ctl.brk * moving;
  let FxR = F_DRIVE * (ctl.thr - ctl.rev) - F_BRAKE * BRK_R * ctl.brk * moving;
  FxF = Math.max(-0.99 * capF, Math.min(0.99 * capF, FxF));
  FxR = Math.max(-0.99 * capR, Math.min(0.99 * capR, FxR));
  const fyMaxF = Math.sqrt(Math.max(0, capF * capF - FxF * FxF));
  const fyMaxR = Math.sqrt(Math.max(0, capR * capR - FxR * FxR));
  let FyF = -capF * Math.sin(PC * Math.atan(PB * af));
  let FyR = -capR * Math.sin(PC * Math.atan(PB * ar));
  FyF = Math.max(-fyMaxF, Math.min(fyMaxF, FyF));
  FyR = Math.max(-fyMaxR, Math.min(fyMaxR, FyR));

  // 6. handbrake: a locked tyre does not steer, it opposes being dragged §3.4
  if (ctl.hb > 0){
    const vrm = Math.hypot(urx, ury);
    if (vrm > 0.05){
      const lock = muWet()[1] * 0.95 * Fzr;
      FxR = FxR * (1 - ctl.hb) - lock * (urx / vrm) * ctl.hb;
      FyR = FyR * (1 - ctl.hb) - lock * (ury / vrm) * ctl.hb;
    }
  }

  // 7. front forces into the body, sum, integrate
  const FxFb = FxF * cd - FyF * sd;
  const FyFb = FxF * sd + FyF * cd;
  const drag = -DRAG * c.vx * Math.abs(c.vx) - RRES * moving;
  const Fx = FxFb + FxR + drag;
  const Fy = FyFb + FyR;
  const Mz = LF * FyFb - LR * FyR;

  c.ar = ar;                       // §5.4 counter-steers off rear slip
  c.ax = Fx / M;
  c.vx += (c.ax + c.r * c.vy) * dt;
  c.vy += (Fy / M - c.r * c.vx) * dt;
  c.r += Mz / IZ * dt;

  // §3.3 anti-creep. The rev term matters: without it the guard zeroes velocity
  // every step while reversing and the car can never back up.
  if (Math.abs(c.vx) < 0.06 && ctl.thr < 0.02 && ctl.rev < 0.02){
    c.vx = 0; c.vy *= 0.4;
  }

  c.h += c.r * dt;
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  c.x += (c.vx * ch - c.vy * sh) * dt;
  c.y += (c.vx * sh + c.vy * ch) * dt;
}

/* ========================================================= collision §4 ====
   Sample the signed distance at each body corner. A negative reading is an
   exact penetration depth with a smooth normal, so the car is pushed out by
   the deepest penetration only and a barely-touched corner barely moves.     */
const CORN = [[HALF_L, HALF_W], [HALF_L, -HALF_W], [-HALF_L, -HALF_W], [-HALF_L, HALF_W]];
function collide(c){
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  let nx = 0, ny = 0, deepest = 0, anyHard = false, hit = false;
  c.hits.length = 0;
  for (const k of CORN){
    const wx = c.x + k[0] * ch - k[1] * sh, wy = c.y + k[0] * sh + k[1] * ch;
    const d = sdfAt(wx, wy);
    if (d >= 0) continue;
    hit = true;
    const pen = -d;
    const n = sdfNormal(wx, wy);
    nx += n[0] * pen; ny += n[1] * pen;
    if (pen > deepest) deepest = pen;
    if (nearestKind(wx, wy) !== 'terrain') anyHard = true;
    c.hits.push([wx, wy, pen]);
  }
  if (!hit){ c.touching = false; return 0; }
  const nm = Math.hypot(nx, ny);
  if (nm < 1e-9) return 0;
  nx /= nm; ny /= nm;
  c.x += nx * deepest; c.y += ny * deepest;

  /* An impulse fires once per contact event. Contact lasts a frame or two even on
     an exact field, and applying it every frame squares the retention - a 45 degree
     thump came out at 1 mph instead of 8, because 0.205 became 0.205^2. While still
     touching, only the positional push-out continues. */
  if (c.touching) return 0;
  c.touching = true;

  // velocity in the world frame at the contact
  const wvx = c.vx * ch - c.vy * sh, wvy = c.vx * sh + c.vy * ch;
  const vn = wvx * nx + wvy * ny;
  let tx = wvx - vn * nx, ty = wvy - vn * ny, vnNew;
  /* §4.1, as a single impulse rather than a per-frame multiplier.

     The handover's 0.96 and 0.78 tangential scrubs assume the car stays in contact
     for many frames, which is true of a blurred chamfer field. This field is exact,
     so the push-out lands the corner on the surface and contact lasts one or two
     frames - measured. Applied once, a fixed multiplier costs almost nothing at any
     angle, and the kerb/wall distinction that §4.1 exists to create disappears.
     Measured 1.19x where the handover got 2.4x.
     So the scrub is derived from the impact instead. Coulomb friction opposes
     tangential slip in proportion to the normal impulse, which scales with the
     approach angle, and the exponent is what separates the two surfaces:
       kerb  loss goes with sin^2 - negligible on a graze, total on a thump
       wall  loss goes with sin   - a shallow clip still hurts
     The kerb also keeps its constant outward ease, faded out as the hit steepens
     so a 45 degree thump gets no helpful shove. */
  const vm = Math.hypot(wvx, wvy);
  const sinA = vm > 1e-6 ? Math.min(1, Math.abs(vn) / vm) : 0;
  const vt = Math.hypot(tx, ty);
  let keep, ease;
  if (anyHard){
    keep = Math.max(0, 1 - 1.60 * sinA);
    ease = 0;
    vnNew = -0.10 * vn;
    c.r *= 0.6;
  } else {
    keep = Math.max(0, 1 - 1.59 * sinA * sinA);
    ease = 0.8 * Math.max(0, 1 - 2 * sinA);
    vnNew = -0.25 * vn + ease;
    c.r *= 0.95;
  }
  tx *= keep; ty *= keep;
  const ovx = tx + vnNew * nx, ovy = ty + vnNew * ny;
  c.vx = ovx * ch + ovy * sh;
  c.vy = -ovx * sh + ovy * ch;

  const e = 0.5 * M * Math.max(0, vn * vn - vnNew * vnNew) * (anyHard ? 1 : 0.30);
  c.dmg += e;
  c.contact++;
  return e;
}
