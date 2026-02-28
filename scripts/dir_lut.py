import argparse
import math
import numpy as np
from PIL import Image


def _build_candidates(max_comp: int, require_maxcomp: bool):
    candidates = []
    for dx in range(-max_comp, max_comp + 1):
        for dy in range(-max_comp, max_comp + 1):
            if dx == 0 and dy == 0:
                continue
            m = max(abs(dx), abs(dy))
            if require_maxcomp and m != max_comp:
                continue
            length = math.hypot(dx, dy)
            g = math.gcd(abs(dx), abs(dy))
            reduced = (dx // g, dy // g)
            candidates.append((dx, dy, m, dx / length, dy / length, dx * dx + dy * dy, reduced))
    return candidates


def _rank_bucket_candidates(bucket_idx: int, num_buckets: int, candidates, unique_slopes: bool):
    theta = (bucket_idx * 2.0 * math.pi) / num_buckets
    tx = math.sin(theta)
    ty = math.cos(theta)

    if unique_slopes:
        best_by_reduced = {}
        for dx, dy, m, nx, ny, len2, reduced in candidates:
            dot = nx * tx + ny * ty
            key = (dot, m, len2)
            prev = best_by_reduced.get(reduced)
            if prev is None or key > prev[2]:
                best_by_reduced[reduced] = (dx, dy, key)
        ranked = sorted(best_by_reduced.values(), key=lambda x: x[2], reverse=True)
    else:
        ranked = []
        for dx, dy, m, nx, ny, len2, _reduced in candidates:
            dot = nx * tx + ny * ty
            key = (dot, m, len2)
            ranked.append((dx, dy, key))
        ranked.sort(key=lambda x: x[2], reverse=True)

    return ranked

def best_int_dir(num_buckets: int, max_comp: int, require_maxcomp: bool):
    """
    Returns list of (dx, dy) integer direction vectors for each bucket i.
    Bucket 0 points up (0, +1). Buckets increase clockwise.

    Search space: dx,dy in [-max_comp..max_comp], excluding (0,0).

    Selection:
      - primary: maximize alignment (dot) with target direction
      - secondary: maximize max(|dx|,|dy|) (use range when possible)
      - tertiary: maximize length^2 (more resolution)

    If require_maxcomp=True, restrict to max(|dx|,|dy|) == max_comp.
    """
    candidates = _build_candidates(max_comp, require_maxcomp)

    dirs = []
    for i in range(num_buckets):
        ranked = _rank_bucket_candidates(i, num_buckets, candidates, unique_slopes=False)
        dirs.append((ranked[0][0], ranked[0][1]))
    return dirs


def _sign_or_one(v: float):
    if v > 0:
        return 1
    if v < 0:
        return -1
    return 1


def _ladder_candidates_for_bucket(bucket_idx: int, num_buckets: int, max_comp: int):
    theta = (bucket_idx * 2.0 * math.pi) / num_buckets
    tx = math.sin(theta)
    ty = math.cos(theta)

    sx = _sign_or_one(tx)
    sy = _sign_or_one(ty)

    candidates = []
    if abs(ty) >= abs(tx):
        for major in range(0, max_comp + 1):
            if major == 0:
                candidates.append((sx, 0))
            else:
                candidates.append((sx, sy * major))
    else:
        for major in range(0, max_comp + 1):
            if major == 0:
                candidates.append((0, sy))
            else:
                candidates.append((sx * major, sy))
    return candidates


def closest_int_dirs(
    num_buckets: int,
    max_comp: int,
    require_maxcomp: bool,
    closest_k: int,
    unique_slopes: bool,
    unit_minor: bool,
):
    if unit_minor:
        per_bucket = []
        for i in range(num_buckets):
            ladder = _ladder_candidates_for_bucket(i, num_buckets, max_comp)
            per_bucket.append(ladder[:closest_k])
        return per_bucket

    candidates = _build_candidates(max_comp, require_maxcomp)
    per_bucket = []
    for i in range(num_buckets):
        ranked = _rank_bucket_candidates(i, num_buckets, candidates, unique_slopes=unique_slopes)
        per_bucket.append([(dx, dy) for dx, dy, _key in ranked[:closest_k]])
    return per_bucket

def draw_star(dirs, length=20, size=260):
    img = np.zeros((size, size), dtype=np.uint8)
    cx = cy = size // 2

    def draw_line(dx, dy):
        x, y = cx, cy
        sx = 1 if dx > 0 else -1 if dx < 0 else 0
        sy = 1 if dy > 0 else -1 if dy < 0 else 0
        dx_abs = abs(dx)
        dy_abs = abs(dy)

        # Bresenham-style stepping to normalize different ratios into 1-pixel steps
        if dx_abs >= dy_abs:
            err = dx_abs // 2
            for _ in range(length):
                if 0 <= x < size and 0 <= y < size:
                    img[y, x] = 255
                x += sx
                err -= dy_abs
                if err < 0:
                    y += sy
                    err += dx_abs
        else:
            err = dy_abs // 2
            for _ in range(length):
                if 0 <= x < size and 0 <= y < size:
                    img[y, x] = 255
                y += sy
                err -= dx_abs
                if err < 0:
                    x += sx
                    err += dy_abs

    for dx, dy in dirs:
        draw_line(dx, dy)
    return img

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--buckets", type=int, default=32)
    ap.add_argument("--maxcomp", type=int, default=8)
    ap.add_argument("--length", type=int, default=100)
    ap.add_argument("--closest-k", type=int, default=1,
                    help="Return top-K closest vectors per bucket (default: 1)")
    ap.add_argument("--unique-slopes", action="store_true",
                    help="When using --closest-k, deduplicate scalar multiples to show unique slope directions")
    ap.add_argument("--closest-unit-minor", action="store_true",
                    help="For --closest-k, keep weaker component at 0/1 and increment only the stronger component")
    ap.add_argument("--require-maxcomp", action="store_true",
                    help="Restrict vectors to max(|dx|,|dy|) == maxcomp")
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    dirs = best_int_dir(args.buckets, args.maxcomp, args.require_maxcomp)

    if args.closest_k < 1:
        raise ValueError("--closest-k must be >= 1")

    print(f"# LUT: buckets={args.buckets}, maxcomp={args.maxcomp}, require_maxcomp={args.require_maxcomp}")
    for i, (dx, dy) in enumerate(dirs):
        print(f"{i:2d}: ({dx:2d}, {dy:2d})")

    if args.closest_k > 1:
        closest = closest_int_dirs(
            args.buckets,
            args.maxcomp,
            args.require_maxcomp,
            args.closest_k,
            unique_slopes=args.unique_slopes,
            unit_minor=args.closest_unit_minor,
        )
        print(
            f"\n# Closest candidates per bucket: k={args.closest_k}, unique_slopes={args.unique_slopes}, unit_minor={args.closest_unit_minor}"
        )
        for i, options in enumerate(closest):
            as_pairs = ", ".join(f"{dx:2d} {dy:2d}" for dx, dy in options)
            print(f"{i:2d}: {as_pairs}")

    img = draw_star(dirs, length=args.length)
    print(f"# Raster image size: {img.shape[1]}x{img.shape[0]} px")

    out_path = args.out or f"dir_{args.buckets}_max{args.maxcomp}_len{args.length}.png"
    Image.fromarray(img, mode="L").save(out_path)
    print(f"# Output image size: {img.shape[1]}x{img.shape[0]} px (exact)")

if __name__ == "__main__":
    main()