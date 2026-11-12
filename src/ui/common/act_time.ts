// Act times as shown on the zone select and the tally: "m:ss.cc" (minutes,
// seconds, hundredths), or "--:--" when there is none.

export const NO_TIME = '--:--';

export function formatActTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return NO_TIME;
  const cs = Math.floor(seconds * 100 + 1e-6);
  const minutes = Math.floor(cs / 6000);
  const rest = cs - minutes * 6000;
  return `${minutes}:${String(Math.floor(rest / 100)).padStart(2, '0')}.${String(rest % 100).padStart(2, '0')}`;
}
