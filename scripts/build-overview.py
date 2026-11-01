#!/usr/bin/env python3
"""Builds the overview maps and the coordinates the site uses when a wine has no detailed region map.

Output:
- public/maps/europe.json and public/maps/world.json: land and borders (Natural Earth, public domain)
- public/maps/countries.json: for each wine country its mainland box and centre (lon/lat)
- a SQL file with appellation coordinates and the country boxes (second argument)

Appellation coordinates: Bordeaux from the centre of its municipalities (IGN Admin Express),
Douro from the demarcated region (DGT CAOP), the others from their main village.
Usage: python3 scripts/build-overview.py <data folder> <sql output file>
"""
import json, math, os, sys
from shapely.geometry import shape, box, MultiPolygon
from shapely.ops import unary_union
from shapely import transform as _transform
import numpy as np

DATA, SQL = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'maps')
load = lambda n, enc='utf-8': json.load(open(os.path.join(DATA, n), encoding=enc))

WINE_COUNTRIES = ['FR', 'IT', 'ES', 'PT', 'DE', 'AT', 'CH', 'HU', 'GR', 'SI', 'HR', 'RO', 'BG', 'GE', 'LB', 'IL', 'US', 'CA',
                  'MX', 'AR', 'CL', 'UY', 'BR', 'ZA', 'AU', 'NZ', 'GB', 'DK', 'SE', 'CN', 'JP']


def d_of(g, tol):
    g = g.simplify(tol, preserve_topology=True)
    out = []
    def ring(c, close):
        c = list(c)
        if len(c) < 2:
            return
        out.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in c) + ('Z' if close else ''))
    def walk(g):
        t = g.geom_type
        if t == 'Polygon':
            ring(g.exterior.coords, True)
            for i in g.interiors:
                ring(i.coords, True)
        elif t == 'LineString':
            ring(g.coords, False)
        elif hasattr(g, 'geoms'):
            for x in g.geoms:
                walk(x)
    walk(g)
    return ''.join(out)


def overview(name, bounds, land_file, border_file, width, tol):
    lon0, lat0, lon1, lat1 = bounds
    k = math.cos(math.radians((lat0 + lat1) / 2)) if name != 'world' else 1.0
    s = width / ((lon1 - lon0) * k)
    h = round((lat1 - lat0) * s)
    bb = box(*bounds)
    xy = lambda a: np.array([((x - lon0) * k * s, (lat1 - y) * s) for x, y in a])
    land = unary_union([shape(f['geometry']) for f in load(land_file)['features'] if shape(f['geometry']).intersects(bb)]).intersection(bb)
    border = unary_union([shape(f['geometry']) for f in load(border_file)['features'] if shape(f['geometry']).intersects(bb)]).intersection(bb)
    out = {'id': name, 'w': width, 'h': h, 'proj': {'lon0': lon0, 'lat1': lat1, 'k': k, 's': s},
           'land': d_of(_transform(land, xy), tol), 'border': d_of(_transform(border, xy), tol), 'sources': 'Natural Earth'}
    with open(os.path.join(OUT, f'{name}.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(name, os.path.getsize(os.path.join(OUT, f'{name}.json')) // 1024, 'KB')


def countries():
    out = {}
    for f in load('ne_50m_admin_0_countries.geojson')['features']:
        p = f['properties']
        code = p.get('ISO_A2_EH') or p.get('ISO_A2')
        if code not in WINE_COUNTRIES:
            continue
        g = shape(f['geometry'])
        # Several features can share a code (e.g. small territories): keep the largest
        if code in out and out[code]['area'] >= g.area:
            continue
        main = max(g.geoms, key=lambda x: x.area) if isinstance(g, MultiPolygon) else g
        # Mainland plus nearby islands (e.g. Sicily, Sardinia, Corsica), not overseas territories
        parts = [x for x in (g.geoms if isinstance(g, MultiPolygon) else [g]) if x.distance(main) < 4]
        u = unary_union(parts)
        b = u.bounds
        c = main.representative_point() if code != 'US' else u.centroid
        out[code] = {'box': [round(v, 3) for v in b], 'centre': [round(c.x, 3), round(c.y, 3)], 'area': g.area}
    missing = [c for c in WINE_COUNTRIES if c not in out]
    if missing:
        print('missing countries', missing)
    for v in out.values():
        v.pop('area', None)
    with open(os.path.join(OUT, 'countries.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    return out


# Main village (lat, lon) of each appellation outside Bordeaux
COORDS = {
    'porto': (41.19, -7.55), 'douro': (41.19, -7.55),
    'rivesaltes': (42.769, 2.873), 'muscat-de-rivesaltes': (42.769, 2.873), 'maury': (42.808, 2.607),
    'banyuls': (42.483, 3.129), 'collioure': (42.525, 3.083), 'cotes-du-roussillon': (42.62, 2.75),
    'bourgogne': (47.05, 4.75), 'chablis': (47.814, 3.798), 'chablis-grand-cru': (47.82, 3.80),
    'gevrey-chambertin': (47.226, 4.968), 'morey-saint-denis': (47.196, 4.961), 'chambolle-musigny': (47.185, 4.954),
    'vougeot': (47.174, 4.961), 'vosne-romanee': (47.160, 4.955), 'nuits-saint-georges': (47.137, 4.950),
    'cote-de-nuits-villages': (47.20, 4.95), 'corton': (47.07, 4.86), 'beaune': (47.025, 4.840), 'pommard': (47.008, 4.794),
    'volnay': (46.999, 4.774), 'meursault': (46.977, 4.770), 'puligny-montrachet': (46.947, 4.752),
    'chassagne-montrachet': (46.937, 4.729), 'santenay': (46.910, 4.697), 'mercurey': (46.840, 4.716),
    'macon': (46.307, 4.832), 'pouilly-fuisse': (46.29, 4.75),
    'champagne': (49.04, 4.02), 'coteaux-champenois': (49.04, 4.02),
    'cotes-du-rhone': (44.30, 4.80), 'cotes-du-rhone-villages': (44.25, 4.95), 'chateauneuf-du-pape': (44.056, 4.833),
    'gigondas': (44.163, 5.005), 'vacqueyras': (44.139, 4.983), 'rasteau': (44.233, 5.017), 'lirac': (44.04, 4.69),
    'tavel': (44.012, 4.698), 'cote-rotie': (45.48, 4.78), 'condrieu': (45.463, 4.767), 'saint-joseph': (45.10, 4.80),
    'hermitage': (45.072, 4.845), 'crozes-hermitage': (45.10, 4.86), 'cornas': (44.964, 4.847),
    'barolo': (44.611, 7.943), 'barbaresco': (44.725, 8.082), 'langhe': (44.60, 8.00), 'nebbiolo-d-alba': (44.75, 8.00),
    'barbera-d-alba': (44.70, 8.03), 'barbera-d-asti': (44.85, 8.25), 'dolcetto-d-alba': (44.62, 8.00), 'roero': (44.78, 7.95),
    'gavi': (44.689, 8.805), 'moscato-d-asti': (44.75, 8.20), 'piemonte': (44.80, 8.10),
    'chianti': (43.55, 11.30), 'chianti-classico': (43.47, 11.30), 'brunello-di-montalcino': (43.058, 11.489),
    'rosso-di-montalcino': (43.058, 11.489), 'vino-nobile-di-montepulciano': (43.093, 11.780), 'bolgheri': (43.231, 10.611),
    'maremma': (42.75, 11.15), 'carmignano': (43.81, 11.01), 'vernaccia-di-san-gimignano': (43.468, 11.043), 'toscana-igt': (43.40, 11.20),
    'rioja': (42.47, -2.45), 'rioja-alta': (42.576, -2.847), 'rioja-alavesa': (42.553, -2.585), 'rioja-oriental': (42.20, -1.95),
    'mosel': (49.916, 7.074), 'saar': (49.62, 6.56), 'ruwer': (49.77, 6.73),
    'napa-valley': (38.50, -122.40), 'oakville': (38.437, -122.401), 'rutherford': (38.457, -122.420),
    'stags-leap-district': (38.40, -122.33), 'howell-mountain': (38.56, -122.43), 'los-carneros': (38.25, -122.35),
    'st-helena': (38.505, -122.470), 'calistoga': (38.579, -122.580),
}


def bordeaux_coords():
    """Centre of each Bordeaux appellation's municipalities (same lists as build-maps.py)."""
    sys.path.insert(0, os.path.dirname(__file__))
    import importlib.util
    spec = importlib.util.spec_from_file_location('bm', os.path.join(os.path.dirname(__file__), 'build-maps.py'))
    src = open(spec.origin).read().split("if __name__ == '__main__':")[0]
    ns = {'__name__': 'bm'}
    sys.argv = [sys.argv[0], DATA, OUT]
    exec(src, ns)
    munis = ns['gironde']()
    out = {}
    for aid, names in ns['BORDEAUX']['areas'].items():
        g = unary_union([munis[n] for n in names if n in munis])
        c = g.representative_point()
        out[aid] = (round(c.y, 4), round(c.x, 4))
    all_bdx = unary_union(list(munis.values())).representative_point()
    out['bordeaux'] = out['bordeaux-superieur'] = (44.84, -0.35)
    out['saint-emilion-satellites'] = out.get('saint-emilion-satellites', (44.95, -0.10))
    return out


if __name__ == '__main__':
    overview('europe', (-11.0, 34.5, 32.0, 60.5), 'ne_50m_land.geojson', 'ne_50m_admin_0_boundary_lines_land.geojson', 1000, 0.8)
    overview('world', (-180.0, -56.0, 180.0, 72.0), 'ne_50m_land.geojson', 'ne_50m_admin_0_boundary_lines_land.geojson', 1000, 0.7)
    cs = countries()
    coords = {**bordeaux_coords(), **COORDS}
    lines = ['-- Generated by scripts/build-overview.py']
    for aid, (lat, lon) in sorted(coords.items()):
        lines.append(f"update appellations set lat = {lat}, lon = {lon} where id = '{aid}';")
    lines.append('insert into countries (code, lon0, lat0, lon1, lat1, lon, lat) values')
    rows = [f"  ('{c}', {v['box'][0]}, {v['box'][1]}, {v['box'][2]}, {v['box'][3]}, {v['centre'][0]}, {v['centre'][1]})" for c, v in sorted(cs.items())]
    lines.append(',\n'.join(rows))
    lines.append('on conflict (code) do update set lon0 = excluded.lon0, lat0 = excluded.lat0, lon1 = excluded.lon1, lat1 = excluded.lat1, lon = excluded.lon, lat = excluded.lat;')
    open(SQL, 'w').write('\n'.join(lines) + '\n')
    print(len(coords), 'appellation coordinates')
