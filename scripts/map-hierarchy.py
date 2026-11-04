#!/usr/bin/env python3
"""The areas of a detailed region map that lie inside another (WIN-293): the map's own levels, for the lighter tone.

For every area: the other areas it lies in (at least 90 % of it inside the other), leaving out areas that are almost the
same shape (both at least 90 % inside each other) and areas that cover half the map's areas or more (those are as good
as the whole region, e.g. Rivesaltes in Roussillon). Written into public/maps/<region>.json as
"within": {area id: [area ids, largest first]}, only for areas that lie in another. build-maps.py writes it too.

Usage: python3 scripts/map-hierarchy.py [region id …]   (every detailed map when none is given)
"""
import json, os, re, sys
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = os.path.join(os.path.dirname(__file__), '..')
MAPS = ['bordeaux', 'bourgogne', 'champagne', 'rhone', 'roussillon', 'toscana', 'piemonte', 'rioja', 'douro', 'mosel']


def geometry(d):
    """SVG path data with M, L and Z only → a shapely geometry (rings combined even-odd, so holes stay holes)."""
    g = None
    for part in re.findall(r'M[^M]*', d):
        nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', part)]
        pts = list(zip(nums[0::2], nums[1::2]))
        if len(pts) < 3:
            continue
        ring = Polygon(pts).buffer(0)
        if ring.is_empty:
            continue
        g = ring if g is None else g.symmetric_difference(ring)
    return g


def within(areas):
    """{area id: {'d': …}} → {area id: [ids of the areas it lies in, largest first]}"""
    geoms = {k: geometry(a['d']) for k, a in areas.items()}
    geoms = {k: g for k, g in geoms.items() if g is not None and g.area > 0}
    total = unary_union(list(geoms.values())).area or 1
    out = {}
    for a, ga in geoms.items():
        parents = []
        for b, gb in geoms.items():
            if a == b or not ga.intersects(gb):
                continue
            n = ga.intersection(gb).area
            in_b, in_a = n / ga.area, n / gb.area
            if in_b >= 0.9 and in_a < 0.9 and gb.area / total < 0.5:
                parents.append((gb.area, b))
        if parents:
            out[a] = [b for _, b in sorted(parents, reverse=True)]
    return out


def main(ids):
    for rid in ids or MAPS:
        path = os.path.join(ROOT, 'public', 'maps', f'{rid}.json')
        with open(path, encoding='utf-8') as f:
            m = json.load(f)
        w = within(m['areas'])
        # Kept right after "whole", so the file reads in the same order as build-maps.py writes it
        out = {}
        for k, v in m.items():
            if k == 'within':
                continue
            out[k] = v
            if k == 'whole':
                out['within'] = w
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        print(rid, {k: v for k, v in w.items()})


if __name__ == '__main__':
    main(sys.argv[1:])
