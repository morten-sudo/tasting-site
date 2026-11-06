#!/usr/bin/env python3
"""Detailed map tiles for the small map of one wine (zoomed in on its producer or appellation).

The overview maps (europe.json, world.json) are drawn for a whole continent and look coarse when the map
zooms in on a few hundred kilometres. These tiles hold the same kind of map in Natural Earth's highest
resolution (10m: land, coastline, lakes, rivers, country borders; public domain), cut into 5 × 5 degree squares
around the wine countries. The site loads only the squares a map shows.

Output: public/maps/tiles/<lon>_<lat>.json (the square's south-west corner) and public/maps/tiles/index.json.
Each tile: {"land": [...], "lakes": [...], "rivers": [...], "coast": [...], "border": [...]} (land is drawn without an outline; the coast is its own line, so the tiles show no seams), every shape a flat list of
longitude/latitude pairs in thousandths of a degree, the first pair absolute and the rest as steps.
Usage: python3 scripts/build-detail-tiles.py <data folder with the ne_10m_*.geojson files> [<lon>_<lat> …]
With squares given, only those are (re)built and added to the index; the other tiles are kept.
"""
import json, math, os, sys
from shapely.geometry import shape, box
from shapely.strtree import STRtree

DATA = sys.argv[1]
ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'public', 'maps', 'tiles')
SIZE = 5          # degrees per tile
TOL = 0.004       # simplification, degrees (about 400 m)
PAD = 0.05        # tiles overlap a little so shapes meet without a seam
# Wine islands outside their country's mainland box (countries.json): Madeira, the Canaries and the Azores (lon0, lat0, lon1, lat1)
ISLANDS = [(-17.4, 32.5, -16.2, 33.2), (-18.3, 27.5, -13.3, 29.5), (-31.4, 36.8, -24.9, 39.8)]


def load(name):
    return [shape(f['geometry']) for f in json.load(open(os.path.join(DATA, name), encoding='utf-8'))['features'] if f['geometry']]


def shapes_in(tree, geoms, cell, polygons):
    out = []
    for i in tree.query(cell):
        g = geoms[i].intersection(cell)
        if g.is_empty:
            continue
        g = g.simplify(TOL, preserve_topology=True)
        parts = getattr(g, 'geoms', [g])
        for p in parts:
            if polygons and p.geom_type == 'Polygon':
                for ring in [p.exterior, *p.interiors]:
                    out.append(encode(ring.coords))
            elif not polygons and p.geom_type == 'LineString':
                out.append(encode(p.coords))
    return [s for s in out if len(s) >= 4]


def encode(coords):
    flat, px, py = [], None, None
    for x, y in coords:
        ix, iy = round(x * 1000), round(y * 1000)
        if px is None:
            flat += [ix, iy]
        elif (ix, iy) != (px, py):
            flat += [ix - px, iy - py]
        else:
            continue
        px, py = ix, iy
    return flat


def main():
    countries = json.load(open(os.path.join(ROOT, 'public', 'maps', 'countries.json')))
    # The squares around every wine country (its box, plus a margin for maps near a border or coast)
    cells = set()
    for c in countries.values():
        x0, y0, x1, y1 = c['box']
        for lon in range(math.floor((x0 - 3) / SIZE) * SIZE, math.ceil((x1 + 3) / SIZE) * SIZE, SIZE):
            for lat in range(math.floor((y0 - 3) / SIZE) * SIZE, math.ceil((y1 + 3) / SIZE) * SIZE, SIZE):
                cells.add((lon, lat))
    for x0, y0, x1, y1 in ISLANDS:
        for lon in range(math.floor(x0 / SIZE) * SIZE, math.ceil(x1 / SIZE) * SIZE, SIZE):
            for lat in range(math.floor(y0 / SIZE) * SIZE, math.ceil(y1 / SIZE) * SIZE, SIZE):
                cells.add((lon, lat))
    only = {tuple(int(v) for v in a.split('_')) for a in sys.argv[2:]}
    if only:
        cells &= only
    layers = {
        'land': (load('ne_10m_land.geojson'), True),
        'lakes': (load('ne_10m_lakes.geojson'), True),
        'rivers': (load('ne_10m_rivers_lake_centerlines.geojson') + load('ne_10m_rivers_europe.geojson'), False),
        'coast': (load('ne_10m_coastline.geojson'), False),
        'border': (load('ne_10m_admin_0_boundary_lines_land.geojson'), False),
    }
    trees = {k: STRtree(g) for k, (g, _) in layers.items()}
    os.makedirs(OUT, exist_ok=True)
    written, total = [], 0
    if only:
        # Keep the other tiles: start from the index there is
        written = [t for t in json.load(open(os.path.join(OUT, 'index.json')))['tiles'] if tuple(t) not in only]
    else:
        for f in os.listdir(OUT):
            os.remove(os.path.join(OUT, f))
    for lon, lat in sorted(cells):
        cell = box(lon - PAD, lat - PAD, lon + SIZE + PAD, lat + SIZE + PAD)
        tile = {k: shapes_in(trees[k], g, cell, poly) for k, (g, poly) in layers.items()}
        if not tile['land']:
            continue  # open sea: the map's sea colour is enough
        path = os.path.join(OUT, f'{lon}_{lat}.json')
        with open(path, 'w') as fh:
            json.dump(tile, fh, separators=(',', ':'))
        total += os.path.getsize(path)
        written.append([lon, lat])
    written.sort()
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump({'size': SIZE, 'tiles': written, 'sources': 'Natural Earth 10m'}, fh, separators=(',', ':'))
    print(len(written), 'tiles,', total // 1024, 'KB')


if __name__ == '__main__':
    main()
