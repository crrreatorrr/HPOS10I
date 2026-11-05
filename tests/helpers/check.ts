// Soft assertions in the style of the old Godot TestCase: every failure is
// collected and the test fails at done() with all of them, so a loop over many
// cases reports each case that broke, not only the first.

import { expect } from 'vitest';

export class Checks {
  readonly failures: string[] = [];

  fail(message: string): void {
    this.failures.push(message);
  }

  true(condition: boolean, message = 'expected true'): void {
    if (!condition) this.fail(message);
  }

  false(condition: boolean, message = 'expected false'): void {
    if (condition) this.fail(message);
  }

  eq<T>(actual: T, expected: T, message = ''): void {
    if (actual !== expected) this.fail(`${message} expected ${String(expected)}, got ${String(actual)}`);
  }

  near(actual: number, expected: number, tolerance: number, message = ''): void {
    if (!(Math.abs(actual - expected) <= tolerance)) this.fail(`${message} expected ${expected} ± ${tolerance}, got ${actual}`);
  }

  /** Fails the running test with every collected failure. */
  done(): void {
    expect(this.failures).toEqual([]);
  }
}

/** Runs `body` with a fresh Checks and fails with everything it collected. */
export function checked(body: (c: Checks) => void): () => void {
  return () => {
    const c = new Checks();
    body(c);
    c.done();
  };
}
