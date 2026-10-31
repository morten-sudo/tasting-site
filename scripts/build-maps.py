#!/usr/bin/env python3
"""Builds the region maps (public/maps/<region>.json) from open geodata.

Sources (downloaded into a data folder given as the first argument):
- Natural Earth 10m land, coastline, rivers and country borders (public domain) – github.com/nvkelso/natural-earth-vector
- Gironde municipalities (IGN Admin Express, Licence ouverte) – github.com/gregoiredavid/france-geojson
- Portuguese municipalities, CAOP (DGT, open data) – github.com/nmota/caop_GeoJSON

Appellations are drawn as the union of the municipalities they cover. That follows the official
lists closely, but an appellation may in reality cover only part of a municipality.
Usage: python3 scripts/build-maps.py <data folder> <output folder>
"""
import json, math, sys, os
from shapely.geometry import shape, mapping, box, LineString, MultiLineString, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely import transform as _transform

def transform(fn, g):
    return _transform(g, lambda a: __import__('numpy').array([fn(x, y) for x, y in a]))
from pyproj import Transformer

DATA, OUT = sys.argv[1], sys.argv[2]
W = 1000  # viewBox width


def load(name, enc='utf-8'):
    with open(os.path.join(DATA, name), encoding=enc) as f:
        return json.load(f)


class Proj:
    """Lon/lat → SVG x/y (equirectangular, scaled by cos(latitude))."""
    def __init__(self, lon0, lat0, lon1, lat1):
        self.lon0, self.lat0, self.lon1, self.lat1 = lon0, lat0, lon1, lat1
        self.k = math.cos(math.radians((lat0 + lat1) / 2))
        self.s = W / ((lon1 - lon0) * self.k)
        self.h = round((lat1 - lat0) * self.s)
        self.bbox = box(lon0, lat0, lon1, lat1)

    def xy(self, lon, lat):
        return ((lon - self.lon0) * self.k * self.s, (self.lat1 - lat) * self.s)

    def geom(self, g):
        return transform(lambda x, y, z=None: self.xy(x, y), g)


def d_of(g, tol=0.6):
    """Shapely geometry (already in SVG units) → compact SVG path data."""
    g = g.simplify(tol, preserve_topology=True)
    parts = []
    def ring(coords, close):
        pts = [(round(x, 1), round(y, 1)) for x, y in coords]
        if len(pts) < 2:
            return
        s = f"M{pts[0][0]} {pts[0][1]}" + ''.join(f"L{x} {y}" for x, y in pts[1:])
        parts.append(s + ('Z' if close else ''))
    def walk(g):
        if g.is_empty:
            return
        t = g.geom_type
        if t == 'Polygon':
            ring(g.exterior.coords, True)
            for i in g.interiors:
                ring(i.coords, True)
        elif t == 'LineString':
            ring(g.coords, False)
        elif t in ('MultiPolygon', 'MultiLineString', 'GeometryCollection'):
            for p in g.geoms:
                walk(p)
    walk(g)
    return ''.join(parts)


def lines_in(features, proj, keep=lambda p: True):
    out = []
    for f in features:
        if not keep(f['properties']):
            continue
        g = shape(f['geometry']).intersection(proj.bbox)
        if not g.is_empty:
            out.append(g)
    return unary_union(out) if out else None


def label_point(g):
    p = g.representative_point()
    return [round(p.x), round(p.y)]


def build(region):
    p = Proj(*region['bounds'])
    coast = lines_in(load('ne_10m_coastline.geojson')['features'], p)
    rivers_src = load('ne_10m_rivers_europe.geojson')['features'] + load('ne_10m_rivers_lake_centerlines.geojson')['features']
    river_names = region['rivers']
    rivers = []
    for name in river_names:
        g = lines_in(rivers_src, p, lambda pr, n=name: (pr.get('name') or pr.get('name_en') or '') == n)
        if g is not None:
            rivers.append({'name': name, 'd': d_of(p.geom(g), 0.8)})

    munis = region['municipalities']()  # name → lon/lat geometry
    # Land from Natural Earth (leaves out estuaries such as the Gironde); municipalities are clipped to it
    land_ll = unary_union([shape(f['geometry']) for f in load('ne_10m_land.geojson')['features']
                           if shape(f['geometry']).intersects(p.bbox)]).intersection(p.bbox)
    land = p.geom(land_ll)
    border = lines_in(load('ne_10m_admin_0_boundary_lines_land.geojson')['features'], p)
    areas = {}
    for aid, names in region['areas'].items():
        missing = [n for n in names if n not in munis]
        if missing:
            print('  missing', aid, missing)
        geoms = [munis[n] for n in names if n in munis]
        if not geoms:
            continue
        g = p.geom(unary_union(geoms).intersection(land_ll))
        areas[aid] = {'d': d_of(g, 0.8), 'label': label_point(g)}
        if aid in region.get('titles', {}):
            areas[aid]['title'] = region['titles'][aid]
    towns = [{'name': n, 'x': round(p.xy(lon, lat)[0]), 'y': round(p.xy(lon, lat)[1]), 'size': s} for n, lon, lat, s in region['towns']]
    out = {
        'id': region['id'], 'name': region['name'], 'w': W, 'h': p.h,
        'land': d_of(land, 0.9),
        'coast': d_of(p.geom(coast), 0.9) if coast is not None else '',
        'border': d_of(p.geom(border), 0.9) if border is not None else '',
        'rivers': rivers,
        'areas': areas,
        'whole': region['whole'],
        'labels': region.get('labels_fn', lambda p: [])(p),
        'towns': towns,
        'sources': region['sources'],
    }
    path = os.path.join(OUT, f"{region['id']}.json")
    with open(path, 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(region['id'], os.path.getsize(path) // 1024, 'KB', len(areas), 'areas')


# ---------- Bordeaux ----------
def gironde():
    g = load('gironde.geojson')
    return {f['properties']['nom']: shape(f['geometry']) for f in g['features']}

BORDEAUX = {
    'id': 'bordeaux', 'name': 'Bordeaux',
    'bounds': (-1.28, 44.42, 0.33, 45.62),
    'rivers': ['Garonne', 'Dordogne'],
    'municipalities': gironde,
    'whole': ['bordeaux', 'bordeaux-superieur'],
    'sources': 'Natural Earth; IGN Admin Express',
    'areas': {
        'medoc': ['Saint-Yzans-de-Médoc', 'Ordonnac', "Saint-Germain-d'Esteuil", 'Lesparre-Médoc', 'Bégadan',
                  'Saint-Christoly-Médoc', 'Couquèques', 'Blaignan', 'Civrac-en-Médoc', 'Valeyrac',
                  'Jau-Dignac-et-Loirac', 'Queyrac', 'Gaillan-en-Médoc', 'Vensac', 'Saint-Vivien-de-Médoc'],
        'saint-estephe': ['Saint-Estèphe'],
        'pauillac': ['Pauillac'],
        'saint-julien': ['Saint-Julien-Beychevelle'],
        'haut-medoc': ['Saint-Seurin-de-Cadourne', 'Vertheuil', 'Cissac-Médoc', 'Saint-Sauveur', 'Saint-Laurent-Médoc',
                       'Cussac-Fort-Médoc', 'Lamarque', 'Arcins', 'Avensan', 'Castelnau-de-Médoc', 'Pian-Médoc',
                       'Ludon-Médoc', 'Macau', 'Parempuyre', 'Blanquefort', 'Taillan-Médoc', 'Saint-Aubin-de-Médoc',
                       'Saint-Médard-en-Jalles', 'Haillan'],
        'margaux': ['Margaux-Cantenac', 'Soussans', 'Labarde', 'Arsac'],
        'listrac-medoc': ['Listrac-Médoc'],
        'moulis': ['Moulis-en-Médoc'],
        'pessac-leognan': ['Pessac', 'Talence', 'Gradignan', 'Léognan', "Villenave-d'Ornon", 'Cadaujac', 'Canéjan',
                           "Saint-Médard-d'Eyrans", 'Martillac', 'Mérignac'],
        'graves': ['Portets', 'Podensac', 'Cérons', 'Illats', 'Landiras', 'Saint-Selve', 'Brède', 'Castres-Gironde',
                   'Beautiran', 'Ayguemorte-les-Graves', 'Saint-Morillon', 'Virelade', 'Arbanats', 'Saint-Michel-de-Rieufret',
                   'Budos', 'Pujols-sur-Ciron', 'Toulenne', 'Langon', 'Saint-Pierre-de-Mons', 'Mazères', 'Roaillan', 'Léogeats'],
        'sauternes': ['Sauternes', 'Bommes', 'Fargues', 'Preignac'],
        'barsac': ['Barsac'],
        'entre-deux-mers': ['Créon', 'Sadirac', 'Lignan-de-Bordeaux', 'Loupes', 'Madirac', 'Cursan', 'Baron', 'Saint-Genès-de-Lombaud',
                            'Haux', 'Targon', 'Faleyras', 'Romagne', 'Soulignac', 'Cessac', 'Montignac', 'Ladaux', 'Bellebat',
                            'Frontenac', 'Sauveterre-de-Guyenne', 'Saint-Brice', 'Castelviel', 'Rauzan', 'Blasimon', 'Mauriac',
                            'Daignac', 'Dardenac', 'Espiet', 'Grézillac', 'Cabara', 'Branne', 'Tizac-de-Curton', 'Naujan-et-Postiac',
                            'Saint-Quentin-de-Baron', 'Nérigean', 'Camiac-et-Saint-Denis', 'Croignon', 'Pompignac', 'Sallebœuf',
                            'Fargues-Saint-Hilaire', 'Bonnetan', 'Tresses', 'Beychac-et-Caillau', 'Montussan', 'Saint-Germain-du-Puch',
                            'Génissac', 'Moulon', 'Vayres', 'Arveyres', 'Izon', 'Saint-Sulpice-et-Cameyrac', 'Saint-Loubès',
                            'Saint-Léon', 'Guillac', 'Lugaignac', 'Jugazan', 'Saint-Aubin-de-Branne', 'Courpiac', 'Martres',
                            'Saint-Pierre-de-Bat', 'Escoussans', "Saint-Genis-du-Bois", 'Castelmoron-d\'Albret', 'Gornac',
                            'Mourens', 'Arbis', 'Cantois', 'Ladaux', 'Saint-Martial', 'Sauveterre-de-Guyenne'],
        'cadillac': ['Cadillac', 'Loupiac', 'Sainte-Croix-du-Mont', 'Langoiran', 'Rions', 'Paillet', 'Lestiac-sur-Garonne', 'Béguey',
                     'Capian', 'Tabanac', 'Tourne', 'Baurech', 'Cambes', 'Quinsac', 'Camblanes-et-Meynac', 'Latresne',
                     'Villenave-de-Rions', 'Laroque', 'Omet', 'Donzac', 'Monprimblanc', 'Gabarnac', 'Verdelais', 'Saint-Maixant'],
        'saint-emilion-grand-cru': ['Saint-Émilion', 'Saint-Christophe-des-Bardes', 'Saint-Étienne-de-Lisse', 'Saint-Hippolyte',
                                    'Saint-Laurent-des-Combes', "Saint-Pey-d'Armens", 'Saint-Sulpice-de-Faleyrens', 'Vignonet'],
        'pomerol': ['Libourne'],
        'lalande-de-pomerol': ['Lalande-de-Pomerol', 'Néac'],
        'saint-emilion-satellites': ['Montagne', 'Lussac', 'Puisseguin'],
        'fronsac': ['Fronsac', 'Rivière', 'Saint-Germain-de-la-Rivière', 'Saint-Aignan', 'Saillans', 'Saint-Michel-de-Fronsac', 'Galgon'],
        'castillon': ['Castillon-la-Bataille', 'Belvès-de-Castillon', 'Gardegan-et-Tourtirac', 'Sainte-Colombe',
                      'Saint-Genès-de-Castillon', 'Saint-Magne-de-Castillon', "Saint-Philippe-d'Aiguille", 'Salles-de-Castillon'],
        'francs': ['Francs', 'Saint-Cibard', 'Tayac'],
        'cotes-de-bourg': ['Bourg', 'Bayon-sur-Gironde', 'Gauriac', 'Comps', 'Saint-Seurin-de-Bourg', 'Villeneuve', 'Samonac',
                           'Mombrier', 'Lansac', 'Tauriac', 'Pugnac', 'Prignac-et-Marcamps', 'Teuillac', 'Saint-Trojan',
                           'Saint-Ciers-de-Canesse'],
        'blaye': ['Blaye', 'Cars', 'Plassac', 'Saint-Genès-de-Blaye', 'Saint-Martin-Lacaussade', 'Berson', 'Saint-Paul', 'Fours',
                  'Saint-Androny', 'Anglade', 'Eyrans', 'Saint-Seurin-de-Cursac', 'Mazion', 'Cartelègue', "Saint-Girons-d'Aiguevives",
                  'Générac', 'Saint-Christoly-de-Blaye', 'Saint-Savin', 'Marcillac', 'Étauliers', 'Braud-et-Saint-Louis',
                  'Saint-Ciers-sur-Gironde', 'Campugnan', 'Saint-Vivien-de-Blaye', 'Saint-Mariens', 'Cavignac'],
    },
    # Canon-Fronsac and Saint-Émilion share areas with their neighbours on this map
    'towns': [('Bordeaux', -0.5792, 44.8378, 'big'), ('Libourne', -0.2423, 44.9153, 'mid'), ('Saint-Émilion', -0.1553, 44.8941, 'small'),
              ('Pauillac', -0.7488, 45.1990, 'small'), ('Margaux', -0.6779, 45.0392, 'small'), ('Blaye', -0.6617, 45.1281, 'small'),
              ('Langon', -0.2475, 44.5527, 'small'), ('Castillon-la-Bataille', -0.0423, 44.8536, 'small'), ('Lesparre-Médoc', -0.9381, 45.3075, 'small')],
}
BORDEAUX['areas']['canon-fronsac'] = ['Saint-Michel-de-Fronsac']
BORDEAUX['areas']['saint-emilion'] = BORDEAUX['areas']['saint-emilion-grand-cru']


# ---------- Douro ----------
def portugal():
    t = Transformer.from_crs(3763, 4326, always_xy=True)
    out = {}
    for f in load('pt_concelhos.geojson', 'utf-8-sig')['features']:
        name = f['properties']['Concelho'].title().replace(' Da ', ' da ').replace(' De ', ' de ').replace(' Do ', ' do ').replace(' E ', ' e ').replace(' À ', ' à ')
        out[name] = transform(lambda x, y, z=None: t.transform(x, y), shape(f['geometry']))
    return out

DOURO = {
    'id': 'douro', 'name': 'Douro',
    'bounds': (-8.75, 40.85, -6.65, 41.55),
    'rivers': ['Duero'],
    'municipalities': portugal,
    'whole': ['porto', 'douro'],
    'sources': 'Natural Earth; DGT (CAOP)',
    'titles': {'baixo-corgo': 'Baixo Corgo', 'cima-corgo': 'Cima Corgo', 'douro-superior': 'Douro Superior'},
    # The demarcated region by sub-region, drawn with the municipalities it lies in
    'areas': {
        'baixo-corgo': ['Mesão Frio', 'Peso da Régua', 'Santa Marta de Penaguião', 'Vila Real', 'Lamego'],
        'cima-corgo': ['Alijó', 'Sabrosa', 'Murça', 'Armamar', 'Tabuaço', 'São João da Pesqueira'],
        'douro-superior': ['Carrazeda de Ansiães', 'Vila Flor', 'Torre de Moncorvo', 'Vila Nova de Foz Côa',
                           'Freixo de Espada à Cinta', 'Mêda', 'Figueira de Castelo Rodrigo'],
    },
    'towns': [('Porto', -8.6110, 41.1496, 'big'), ('Vila Nova de Gaia', -8.6120, 41.1239, 'small'), ('Peso da Régua', -7.7863, 41.1640, 'mid'),
              ('Pinhão', -7.5463, 41.1911, 'mid'), ('Vila Real', -7.7464, 41.3006, 'small'), ('São João da Pesqueira', -7.4049, 41.1475, 'small'),
              ('Vila Nova de Foz Côa', -7.1415, 41.0820, 'small'), ('Barca d’Alva', -6.9727, 41.0276, 'small')],
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for r in (BORDEAUX, DOURO):
        build(r)
