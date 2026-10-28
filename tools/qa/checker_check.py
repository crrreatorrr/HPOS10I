#!/usr/bin/env python3
"""QA: is a terrain fill a DIAMOND checker or a SQUARE one? (04-zones ZN-K1)

    python3 tools/qa/checker_check.py FRAME.png X0 Y0 X1 Y1

Crops a region of fill (a Movie Maker frame, or fill.png itself with the full
box), autocorrelates its brightness and finds the pattern period p along the
axes. In a diamond (45 degree) checker the shift (p/2, p/2) lands on the other
colour (strong negative correlation) while (p/2, 0) is neutral. A square
checker of cell s is the opposite: (s, 0) is strongly negative and (s, s)
strongly positive. Prints the numbers and a verdict. Needs Pillow and numpy.
Owned by QA.
"""
import sys

import numpy as np
from PIL import Image


def main() -> int:
    if len(sys.argv) != 6:
        print(__doc__)
        return 2
    path = sys.argv[1]
    x0, y0, x1, y1 = (int(v) for v in sys.argv[2:])
    a = np.asarray(Image.open(path).convert("RGB")).astype(float)[y0:y1, x0:x1].mean(axis=2)
    a -= a.mean()
    f = np.fft.fft2(a)
    ac = np.real(np.fft.ifft2(f * np.conj(f)))
    ac /= ac[0, 0]
    h, w = ac.shape

    def at(dx: int, dy: int) -> float:
        return float(ac[dy % h, dx % w])

    # Axis period: the first strong positive peak along x.
    period = next((d for d in range(4, min(64, w // 2)) if at(d, 0) > 0.6), 0)
    if period == 0:
        print("no clear period along x; not a checker")
        return 1
    half = period // 2
    diag, axis = at(half, half), at(half, 0)
    print("period %d px; corr(p/2, p/2) = %.2f, corr(p/2, 0) = %.2f, corr(p, 0) = %.2f" % (period, diag, axis, at(period, 0)))
    if diag < -0.3 and axis > -0.3:
        print("DIAMOND checker")
        return 0
    if axis < -0.3 and at(half, half) > 0.3:
        print("SQUARE checker (not allowed for Zone 1)")
        return 1
    print("unclear pattern")
    return 1


if __name__ == "__main__":
    sys.exit(main())
