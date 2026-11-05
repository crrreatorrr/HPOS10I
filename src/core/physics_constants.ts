// Every movement constant for Sproto, in one place for live tuning.
// Values are in the classic units: pixels per frame (speeds) and pixels per
// frame per frame (accelerations) at a fixed 60 fps. Edit
// physics_constants.json (the dev server reloads it live) and read
// Tuning.physics every tick instead of caching values.

import defaults from './physics_constants.json';

export const FPS = 60;

export type PhysicsConstants = { -readonly [K in keyof typeof defaults]: (typeof defaults)[K] extends boolean ? boolean : number };

export function defaultPhysics(): PhysicsConstants {
  return { ...(defaults as PhysicsConstants) };
}

/** Pixels per frame -> pixels per second. */
export function speed(pxPerFrame: number): number {
  return pxPerFrame * FPS;
}

/** Pixels per frame^2 -> pixels per second^2. */
export function accel(pxPerFrame2: number): number {
  return pxPerFrame2 * FPS * FPS;
}

/** Frames at 60 fps -> seconds. */
export function frames(count: number): number {
  return count / FPS;
}
