// Shared physics constants (planning doc §4.2). Every value marked TBD is a
// placeholder to tune by playtesting — change it here, nowhere else.
//
// Authoring units are METERS. Matter.js itself is tuned for pixel-scale bodies
// (default slop, sleep and velocity thresholds assume ~10–100 unit bodies), so
// meters are converted to pixels once, when a body is created — see toPx().

export const PX_PER_METER = 40; // TBD §4.2 — sized so Figma pieces (~50–86px) are ~1.5–2m

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

export const GRAVITY_Y = 1; // Matter.js default; scaled internally by gravity.scale

// §3.2 / §4.9 — no material ever bounces.
export const RESTITUTION = 0;

// Gameplay timing — not used until later phases, kept here so there is one source of truth.
export const BUILD_DURATION_S = 120; // §2.1
export const SETTLE_DURATION_S = 1.5; // TBD §4.6
export const MAX_TEST_DURATION_S = 75; // TBD §4.11 — suggested 60–90s
export const ROTATION_STEP_DEG = 15; // TBD §2.2
export const DAILY_PIECE_COUNT = 10; // §3.3
