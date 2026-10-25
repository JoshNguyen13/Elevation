// Shared physics constants (planning doc §4.2). Every value marked TBD is a
// placeholder to tune by playtesting — change it here, nowhere else.
//
// Authoring units are METERS. Matter.js itself is tuned for pixel-scale bodies
// (default slop, sleep and velocity thresholds assume ~10–100 unit bodies), so
// meters are converted to pixels once, when a body is created — see toPx().

// Board layout unit only (canvas, platform). Pieces use a per-day scale instead
// (src/lib/game/dailyScale.ts) so each day's full set fits the fixed board.
export const PX_PER_METER = 40; // TBD §4.2

export const toPx = (meters: number) => meters * PX_PER_METER;
export const toMeters = (px: number) => px / PX_PER_METER;

// Canvas = the play area inside the Build Area frame in Figma (02 — Build Phase).
export const CANVAS_WIDTH_M = 10;
export const CANVAS_HEIGHT_M = 14;

// Platform matches Figma's 220×20px rounded bar at PX_PER_METER = 40.
export const PLATFORM_WIDTH_M = 5.5; // TBD §4.2
export const PLATFORM_HEIGHT_M = 0.5;
export const PLATFORM_BOTTOM_MARGIN_M = 0.5;
export const PLATFORM_CORNER_RADIUS_PX = 6;

// Gravity in real-world g, applied at the day's piece scale (dayGravity() in dailyScale.ts),
// so pieces fall and topple at the same speed relative to their size every day. TBD —
// above 1 g on purpose, for snappy stacking. Matter's default (1000 px/s²) was 0.8–4.4 g
// depending on the day.
export const GRAVITY_G = 2.5;
export const STANDARD_GRAVITY = 9.81; // m/s²
// Screen-space clamp (px/s²) for days with extreme scales. Below the floor stacks settle
// slowly; above the cap (Matter's default) small pieces creep and stacks of them fall
// apart (a 9–18px stack crept 1.8px at 1000, 7px at 1200, and collapsed at 1600).
export const MIN_GRAVITY_PX_S2 = 500;
export const MAX_GRAVITY_PX_S2 = 1000;

// Matter.js is stepped manually at a fixed rate so drawing and game rules stay in sync with it.
export const PHYSICS_STEP_MS = 1000 / 60;
// Longest frame gap to catch up on (e.g. after a background tab) before dropping time.
export const MAX_FRAME_MS = 100;
// Solver passes, above Matter's defaults (6 / 4) so stacks jitter less. TBD — tune for feel vs CPU.
export const POSITION_ITERATIONS = 10;
export const VELOCITY_ITERATIONS = 8;

// §3.2 / §4.9 — no material ever bounces.
export const RESTITUTION = 0;

// §5.1 max possible height (the day's pieces end to end, by longest dimension)
// fills this fraction of the space above the platform.
export const HEIGHT_HEADROOM = 0.9;

export const BUILD_DURATION_S = 120; // §2.1
export const SETTLE_DURATION_S = 1.5; // TBD §4.6
// Pause on the measured height before the disaster starts.
export const HEIGHT_REVEAL_S = 2;
export const ROTATION_STEP_DEG = 1; // TBD §2.2 — fine steps; holding Q/E repeats

// Matter uses the higher frictionStatic of two touching bodies, so this sets how
// hard resting pieces are to nudge off each other, whatever their kinetic friction.
export const FRICTION_STATIC = 3;
// Matter uses the lower friction of two touching bodies. The platform sits above every
// material's friction, so a piece on it grips with its own.
export const PLATFORM_FRICTION = 2;

// Bonded stacks: two pieces resting on each other are welded at their contact points, so a
// stable stack acts as one body (pieces stop sliding off each other under a disaster), until
// a hard enough jolt snaps the weld. TBD — tune with the disasters.
// Steps two touching pieces must stay calm (relative speed below BOND_CALM_SPEED px/step) to bond.
export const BOND_REST_STEPS = 60;
export const BOND_CALM_SPEED = 0.1;
// Weld springiness (Matter constraint stiffness, 0–1) and damping.
export const BOND_STIFFNESS = 0.5;
export const BOND_DAMPING = 0.1;
// A weld snaps once its two anchors are pulled this far apart (px). At 0.5 a meteor hit
// snaps welds; an earthquake doesn't.
export const BOND_BREAK_PX = 0.5;

// Resting (build and settle only): a piece calm for REST_STEPS steps in a row (below
// REST_CALM_SPEED px/step, at its centre and rim) is held where it rested, but still free
// to turn, so it can lean, rock and tip. Matter's friction never fully holds, so without
// this resting pieces creep, and welded ones glide (the weld pins nudge them every step).
// Checked again every step, so a push, a topple or its support leaving lets go at once:
// one step of unsupported gravity (≥ 0.14 px/step) is above the limit. A held piece that
// keeps turning (past REST_TURN_DEG since it was held) is tipping over, so it lets go too.
export const REST_STEPS = 30;
export const REST_CALM_SPEED = 0.1;
export const REST_TURN_DEG = 0.5;
export const DAILY_PIECE_COUNT = 10; // §3.3

// --- Testing Phase (disasters track) -------------------------------------------
// Disaster force magnitudes live in disasters.ts; these are the test's rules.
export const MAX_TEST_DURATION_S = 75; // TBD §4.11 — suggested 60–90s
// The tower counts as collapsed once this fraction of its pieces has fallen (§4.7). TBD
export const COLLAPSE_FALLEN_FRACTION = 0.5;
// A piece "touches the ground" within this many px of the platform top (§4.7).
export const GROUND_TOLERANCE_PX = 2;
