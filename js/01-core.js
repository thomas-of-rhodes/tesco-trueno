/* Tesco Trueno - 01-core.js
   Split out of trueno.html on 2026-10-12 (pre-neural step 1). The js/ files are
   classic scripts sharing one global scope and load in numbered order; see
   the script tags at the bottom of trueno.html. */
/* ===========================================================================
   Trueno: the driving core, ported to the Riverside Drive car park.

   Physics, collision response and the constants are from TRUENO-HANDOVER.md and
   are meant to be unchanged. What is new is the world interface: the old build
   read a 1 m grid and had to build a signed distance field to get usable surface
   normals off it. This world is boxes, so the distance field is exact and there
   is no chamfer, no blur, and nothing to rebuild when a car moves.

   No driver yet. The four open-loop tests in the panel are the acceptance
   criteria from the porting checklist, and they run before anything else.
   =========================================================================== */

/* ----------------------------------------------------------------- the site */
/* BAY went 2.55 to 2.95 and the fleet shrank about 8%. The measured site is
   genuinely tight - a 1.73 m car in a 2.55 m bay leaves 0.82 m to swing into -
   and 82% of parking manoeuvres were failing because of it. Dimensional
   fidelity is not worth a car park nobody can park in, and the extra 40 cm
   costs only eight bays a row. */
/* Widened 2026-10-12 (Thomas: "widen the whole map slightly and provide
   generous road widths"). PARK_W was 73, measured off Google Maps; it is 82 now
   because every road in it is 8 m - aisles were 6.0 and 6.4, the access road 7 -
   and the bays are the same size as before. The measured site is genuinely
   tighter than a car park built from this sim's driving can work in: cars could
   not swing out of a space without their nose meeting the row opposite.
   A band is bay row 4.8 + aisle + bay row 4.8. */
const AISLE_W = 8.0;                          // a band's driving aisle
const AISLE_C = 4.8 + AISLE_W / 2;            // its centreline, from the band's edge
const PARK_L = 172, PARK_W = 82, BAND = 4.8 + AISLE_W + 4.8, BAY = 2.95;
const X0 = 40, X1 = X0 + PARK_L, Y0 = 2, Y1 = Y0 + PARK_W;

/* Across the car park, edge to edge, each thing gets its own strip:
     walkway  the covered colonnade and its pavilion, against the river side
     prime    the row of bays that faces the doors, and its wide aisle
     bands    bay row / driving aisle / bay row, repeated
     island   a kerbed island: hoop trolley shelters, and the CCTV masts
     road     the access road along the railway fence
   Two rounds of correction got here. First: the walkway, the pavilion, a shelter and
   every lighting mast were standing in driving aisles. Then six Street View shots
   showed the walkway is far narrower than I had it - 5 m, not 11 - but fenced off
   with a dense bollard line rather than open columns; that the shelters are long
   curved-hoop canopies in rows, not scattered four-post clusters; and that the
   railway side is a real two-way access road, separated from the bays by a kerbed
   island rather than opening straight onto them. */
const WALK_W  = 5;      // the colonnade: raised, kerbed, and a dense bollard line
const PRIME_W = 5.2;    // the row that faces the doors, nose-in to that kerb
const PAISLE  = 8.0;    // and the wide aisle that serves it (was 6.4)
const ISLAND_W = 2.6;   // kerbed island carrying the hoop shelters and the masts
const ROAD_W  = 8.0;    // the access road along the railway fence (was 7.0)
const LANE_W  = ROAD_W; // 'the lane' in the telemetry means that road
const BAND0 = Y0 + WALK_W + PRIME_W + PAISLE;
const NBANDS = Math.floor((PARK_W - (BAND0 - Y0) - ISLAND_W - ROAD_W) / BAND);
const BANDS = [];
for (let i = 0; i < NBANDS; i++) BANDS.push(BAND0 + i * BAND);
const ISLAND_Y = BAND0 + NBANDS * BAND + ISLAND_W / 2;
const ROWY = [Y0 + WALK_W + 2.6];                    // the prized row
/* 2.25/13.35 rather than 2.4/13.2: four more inches of aisle at each band,
   taken off a bay depth that was 4.8 m for a car now under 4.4. */
for (const b of BANDS){ ROWY.push(b + 2.25); ROWY.push(b + BAND - 2.25); }
/* The back-to-back lines between bay rows, where a mast can stand in the corner of
   four spaces instead of in the middle of the road. */
const BAYLINE = function(k){ return X0 + 4 + k * BAY; };
/* Genuine back-to-back lines only: where the BACKS of two bay rows meet, which is
   the one place a mast can stand in the corner of four spaces. BANDS[0] was in here
   too, and it is not one of those - it is the back of the first row against the
   prime aisle, so a mast there put its bollard ring out in the road. */
const CROSS = [];
for (let i = 1; i < NBANDS; i++) CROSS.push(BANDS[i]);
CROSS.push(BANDS[NBANDS - 1] + BAND);

/* --------------------------------------------------------------- the car §3.1 */
const WX_MAX = 340, WY_MAX = 200;      // extent the spatial index covers
const M = 1120, IZ = 1750, L = 2.45;
const LF = L * 0.53, LR = L * 0.47;
const HCG = 0.56, G = 9.81;
const MU_S = 1.05, MU_K = 0.45, MU_V = 1.1;
