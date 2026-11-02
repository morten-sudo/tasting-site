#!/usr/bin/env python3
"""Builds the region maps (public/maps/<region>.json) from open geodata.

Sources (downloaded into a data folder given as the first argument):
- Natural Earth 10m land, coastline, rivers and country borders (public domain) – github.com/nvkelso/natural-earth-vector
- Gironde municipalities (IGN Admin Express, Licence ouverte) – github.com/gregoiredavid/france-geojson- Burgundy municipalities from the same repository: departements/{21-cote-d-or,71-saone-et-loire,89-yonne}/
  communes-<dep>-<name>.geojson, saved as communes-21.geojson, communes-71.geojson and communes-89.geojson
- Champagne municipalities from the same repository, departments 51, 10, 02, 52 and 77, saved as communes-<dep>.geojson,
  plus the Marne file as of commit cd65fc6 (2017, before Blancs-Coteaux) saved as communes-51-2017.geojson
- Roussillon municipalities from the same repository, departments 66 and 11, saved as communes-66.geojson and communes-11.geojson
- Rhône valley municipalities from the same repository, departments 69, 42, 07, 26, 84 and 30, saved as communes-<dep>.geojson
- Portuguese municipalities, CAOP (DGT, open data) – github.com/nmota/caop_GeoJSON
- Tuscan municipalities (comuni), ISTAT boundaries – github.com/openpolis/geojson-italy,
  geojson/limits_R_9_municipalities.geojson saved as it-toscana-comuni.geojson
- Piedmont comuni from the same repository, geojson/limits_R_1_municipalities.geojson saved as it-piemonte-comuni.geojson
- Spanish municipalities (municipios), IGN boundaries as TopoJSON from es-atlas 0.6.0 (MIT; npm package es-atlas,
  github.com/martgnz/es-atlas), es/municipalities.json saved as es-municipalities.json

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
        # A river may be split over several Natural Earth names (e.g. the lower Saône is spelt 'Sane')
        names = {name, *region.get('river_parts', {}).get(name, [])}
        g = lines_in(rivers_src, p, lambda pr, ns=names: (pr.get('name') or pr.get('name_en') or '') in ns)
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
        if aid in region.get('label_at', {}):  # a chosen place (lon, lat) for the badge, e.g. in an area of several parts
            areas[aid]['label'] = [round(v) for v in p.xy(*region['label_at'][aid])]
        if aid in region.get('titles', {}):
            areas[aid]['title'] = region['titles'][aid]
    towns = [{'name': n, 'x': round(p.xy(lon, lat)[0]), 'y': round(p.xy(lon, lat)[1]), 'size': s} for n, lon, lat, s in region['towns']]
    out = {
        'id': region['id'], 'name': region['name'], 'w': W, 'h': p.h,
        # x = (lon - lon0) * k * s, y = (lat1 - lat) * s – for pins at exact places
        'proj': {'lon0': p.lon0, 'lat1': p.lat1, 'k': round(p.k, 6), 's': round(p.s, 4)},
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

# ---------- Bourgogne ----------
def burgundy():
    """Municipalities of Côte-d'Or (21), Saône-et-Loire (71) and Yonne (89). A name found in more than one of
    them (e.g. Maligny, Givry, Bussières) is only available with its department: 'Givry (71)'."""
    out, seen = {}, {}
    for dep in ('21', '71', '89'):
        for f in load(f'communes-{dep}.geojson')['features']:
            name = f['properties']['nom']
            g = shape(f['geometry'])
            out[f'{name} ({dep})'] = g
            seen.setdefault(name, []).append(g)
    out.update({n: gs[0] for n, gs in seen.items() if len(gs) == 1})
    return out

BOURGOGNE = {
    'id': 'bourgogne', 'name': 'Bourgogne',
    'bounds': (3.35, 46.15, 5.35, 47.98),
    'rivers': ['Saône', 'Yonne', 'Doubs'],
    'river_parts': {'Saône': ['Sane']},
    'municipalities': burgundy,
    'whole': ['bourgogne', 'cremant-de-bourgogne'],
    'sources': 'Natural Earth; IGN Admin Express',
    # Village and Grand Cru appellations by the municipalities INAO lists for them (an appellation may cover only part
    # of a municipality). As with Haut-Médoc in Bordeaux, the wider appellations leave out the municipalities that have
    # a village appellation of their own on this map (Côte de Nuits-Villages: Fixin, Brochon; Mâcon: the Pouilly-Fuissé
    # and Viré-Clessé villages), and each appellation is drawn with its own municipalities only, also when the id stands
    # for neighbours too ('mercurey' for Givry and Rully, 'pouilly-fuisse' for Saint-Véran, 'corton' for Ladoix).
    'areas': {
        'chablis': ['Chablis', 'Beine', 'Béru', 'Chemilly-sur-Serein', 'Chichée', 'Collan', 'Courgis', 'Fleys',
                    'Fontenay-près-Chablis', 'Chapelle-Vaupelteigne', 'Lignorelles', 'Ligny-le-Châtel', 'Maligny (89)',
                    'Poilly-sur-Serein', 'Préhy', 'Saint-Cyr-les-Colons', 'Villy', 'Viviers'],
        'chablis-grand-cru': ['Chablis'],
        # Côte de Nuits
        'marsannay': ['Chenôve', 'Marsannay-la-Côte', 'Couchey'],
        'fixin': ['Fixin'],
        'gevrey-chambertin': ['Gevrey-Chambertin', 'Brochon'],
        'morey-saint-denis': ['Morey-Saint-Denis'],
        'chambolle-musigny': ['Chambolle-Musigny'],
        'vougeot': ['Vougeot'],
        'vosne-romanee': ['Vosne-Romanée', 'Flagey-Echézeaux'],
        'nuits-saint-georges': ['Nuits-Saint-Georges', 'Premeaux-Prissey'],
        'cote-de-nuits-villages': ['Comblanchien', 'Corgoloin'],
        # Côte de Beaune
        'corton': ['Aloxe-Corton', 'Ladoix-Serrigny'],
        'pernand-vergelesses': ['Pernand-Vergelesses'],
        'savigny-les-beaune': ['Savigny-lès-Beaune'],
        'chorey-les-beaune': ['Chorey-les-Beaune'],
        'beaune': ['Beaune'],
        'pommard': ['Pommard'],
        'volnay': ['Volnay'],
        'monthelie': ['Monthelie'],
        'auxey-duresses': ['Auxey-Duresses'],
        'saint-romain': ['Saint-Romain'],
        'meursault': ['Meursault'],
        'puligny-montrachet': ['Puligny-Montrachet'],
        'saint-aubin': ['Saint-Aubin'],
        'chassagne-montrachet': ['Chassagne-Montrachet'],
        'santenay': ['Santenay', 'Remigny'],
        # Côte Chalonnaise
        'bouzeron': ['Bouzeron'],
        'mercurey': ['Mercurey', 'Saint-Martin-sous-Montaigu'],
        'montagny': ['Montagny-lès-Buxy', 'Buxy', 'Jully-lès-Buxy', 'Saint-Vallerin'],
        # Mâconnais
        'macon': ['Mâcon', 'Charnay-lès-Mâcon', 'Hurigny', 'Sancé', 'Chevagny-les-Chevrières', 'Roche-Vineuse', 'Prissé',
                  'Davayé', 'Vinzelles', 'Leynes', 'Chânes', 'Chasselas', 'Saint-Vérand', 'Pierreclos', 'Bussières (71)',
                  'Milly-Lamartine', 'Sologny', 'Verzé', 'Igé', 'Azé', 'Péronne', 'Lugny', 'Saint-Gengoux-de-Scissé', 'Burgy',
                  'Bissy-la-Mâconnaise', 'Cruzille', 'Chardonnay', 'Uchizy', 'Plottes', 'Mancey'],
        'vire-clesse': ['Viré', 'Clessé', 'Laizé', 'Montbellet'],
        'pouilly-fuisse': ['Fuissé', 'Solutré-Pouilly', 'Vergisson', 'Chaintré'],
    },
    'towns': [('Dijon', 5.0415, 47.3220, 'big'), ('Beaune', 4.8400, 47.0260, 'mid'), ('Auxerre', 3.5673, 47.7982, 'mid'),
              ('Chalon-sur-Saône', 4.8535, 46.7808, 'mid'), ('Mâcon', 4.8326, 46.3069, 'mid'), ('Chablis', 3.7983, 47.8141, 'small'),
              ('Nuits-Saint-Georges', 4.9505, 47.1376, 'small'), ('Gevrey-Chambertin', 4.9680, 47.2260, 'small'),
              ('Meursault', 4.7703, 46.9786, 'small'), ('Tournus', 4.9087, 46.5626, 'small'), ('Cluny', 4.6590, 46.4344, 'small')],
}

# ---------- Champagne ----------
def champagne():
    """Municipalities of Marne (51), Aube (10), Aisne (02), Haute-Marne (52) and Seine-et-Marne (77), named as in Bourgogne
    ('Bligny (10)' when a name is found in more than one of them). Two Marne municipalities are both called 'Breuil' in
    Admin Express; the one by Dormans (51085, Le Breuil) is in the Champagne area. Oger, Vertus and Voipreux were merged
    into Blancs-Coteaux in 2018; they are taken from the 2017 file of the same repository (commit cd65fc6, saved as
    communes-51-2017.geojson), so that the Grand Cru Oger is not drawn over Vertus."""
    out, seen = {}, {}
    for dep in ('51', '10', '02', '52', '77'):
        for f in load(f'communes-{dep}.geojson')['features']:
            pr = f['properties']
            name = 'Le Breuil' if pr['code'] == '51085' else pr['nom']
            g = shape(f['geometry'])
            out[f'{name} ({dep})'] = g
            seen.setdefault(name, []).append(g)
    out.update({n: gs[0] for n, gs in seen.items() if len(gs) == 1})
    for f in load('communes-51-2017.geojson')['features']:
        if f['properties']['code'] in ('51411', '51612', '51651'):  # Oger, Vertus, Voipreux
            out[f['properties']['nom']] = shape(f['geometry'])
    return out

# The 319 municipalities of the Champagne area (INAO; the list for the AOC Champagne and Coteaux Champenois as published in
# OpenWineMap's def_aop/Champagne_data, which follows the INAO list of municipalities), with Admin Express names: articles
# dropped ('Riceys', 'Mesnil-sur-Oger') and merged municipalities drawn whole: Aÿ-Champagne (Ay, Bisseuil, Mareuil-sur-Ay),
# Val de Livre (Louvois, Tauxières-Mutry) and Vallées en Champagne (Baulne-en-Brie, La Chapelle-Monthodon, Saint-Agnan).
CHAMPAGNE_ZONE = {
    '51': [
        "Saint-Martin-d'Ablois", 'Allemant (51)', 'Ambonnay', 'Arcis-le-Ponsart', 'Aubilly', "Avenay-Val-d'Or",
        'Avize', 'Aÿ-Champagne', 'Barbonne-Fayel', 'Baslieux-sous-Châtillon', 'Bassu', 'Bassuet', 'Baye',
        'Beaumont-sur-Vesle', 'Beaunay', 'Belval-sous-Châtillon', 'Bergères-lès-Vertus', 'Bergères-sous-Montmirail',
        'Berru', 'Bethon', 'Bezannes', 'Billy-le-Grand', 'Binson-et-Orquigny', 'Bligny (51)', 'Bouilly (51)',
        'Bouleuse', 'Boursault', 'Bouzy', 'Branscourt', 'Le Breuil', 'Brimont', 'Brouillet', 'Broussy-le-Grand',
        'Broyes', 'Brugny-Vaudancourt', 'Cauroy-lès-Hermonville', 'Celle-sous-Chantemerle', 'Cernay-lès-Reims',
        'Châlons-sur-Vesle', 'Chambrecy', 'Chamery', 'Champillon', 'Champlat-et-Boujacourt', 'Champvoisy', 'Changy',
        'Chantemerle', 'Châtillon-sur-Marne', 'Chaumuzy', 'Chavot-Courcourt', 'Chenay', 'Chigny-les-Roses', 'Chouilly',
        'Coizard-Joches', 'Val-des-Marais', 'Congy', 'Cormicy', 'Cormontreuil', 'Cormoyeux', 'Coulommes-la-Montagne',
        'Courcelles-Sapicourt', 'Courjeonnet', 'Courmas', 'Courtagnon', 'Courthiézy', 'Courville', 'Couvrot',
        'Cramant', 'Crugny', 'Cuchery', 'Cuis', 'Cuisles', 'Cumières', 'Damery', 'Dizy', 'Dormans', 'Val-de-Vière',
        'Écueil', 'Épernay', 'Étoges', 'Étréchy', 'Faverolles-et-Coëmy', 'Fèrebrianges', 'Festigny',
        'Fleury-la-Rivière', 'Fontaine-Denis-Nuisy', 'Fontaine-sur-Ay', 'Germaine (51)', 'Germigny', 'Givry-lès-Loisy',
        'Glannes', 'Grauves', 'Gueux', 'Hautvillers', 'Hermonville', 'Hourges', 'Igny-Comblizy', 'Janvry',
        'Jonchery-sur-Vesle', 'Jonquery', 'Jouy-lès-Reims', 'Lagery', 'Leuvrigny', 'Lhéry', 'Lisse-en-Champagne',
        'Loisy-en-Brie', 'Loisy-sur-Marne', 'Val de Livre', 'Ludes', 'Mailly-Champagne', 'Mancy', 'Mardeuil',
        'Mareuil-le-Port', 'Marfaux', 'Merfy', 'Merlaut', 'Méry-Prémecy', 'Mesneux', 'Mesnil-sur-Oger',
        'Mondement-Montgivroux', 'Montbré', 'Montgenost', 'Monthelon', 'Montigny-sur-Vesle', 'Morangis', 'Moslins',
        'Moussy', 'Mutigny', 'Nanteuil-la-Forêt', 'Nesle-le-Repons', 'Neuville-aux-Larris', "Nogent-l'Abbesse",
        'Œuilly (51)', 'Oger', 'Oiry', 'Olizy', "Orbais-l'Abbaye", 'Ormes (51)', 'Oyes', 'Pargny-lès-Reims',
        'Passy-Grigny', 'Pévy', 'Pierry', 'Poilly', 'Pontfaverger-Moronvilliers', 'Pouillon', 'Pourcy', 'Prouilly',
        'Puisieulx', 'Reims', 'Reuil', 'Rilly-la-Montagne', 'Romery (51)', 'Romigny', 'Rosnay', 'Sacy',
        'Saint-Amand-sur-Fion', 'Saint-Euphraise-et-Clairizet', 'Sainte-Gemme', 'Saint-Gilles',
        'Saint-Lumier-en-Champagne', 'Saint-Thierry', 'Sarcy', 'Saudoy', 'Savigny-sur-Ardres', 'Selles', 'Sermiers',
        'Serzy-et-Prin', 'Sézanne', 'Sillery', 'Soulières', 'Taissy', 'Talus-Saint-Prix', 'Thil (51)',
        'Tours-sur-Marne', 'Tramery', 'Trépail', 'Treslon', 'Trigny', 'Trois-Puits', 'Troissy', 'Unchair',
        'Vanault-le-Châtel', 'Vandeuil', 'Vandières', 'Vauciennes', 'Vaudemange', 'Vavray-le-Grand', 'Vavray-le-Petit',
        'Venteuil', 'Verneuil', 'Vert-Toulon', 'Vertus', 'Verzenay', 'Verzy', 'Ville-Dommange', 'Ville-en-Tardenois',
        'Villeneuve-Renneville-Chevigny', 'Villers-Allerand', 'Villers-aux-Nœuds', 'Villers-Franqueux',
        'Villers-Marmery', 'Villers-sous-Châtillon', 'Villevenard', 'Vinay', 'Vincelles', 'Vindey',
        'Vitry-en-Perthois', 'Voipreux', 'Vrigny'],
    '02': [
        'Azy-sur-Marne', 'Barzy-sur-Marne', 'Vallées en Champagne', 'Bézu-le-Guéry', 'Blesmes', 'Bonneil', 'Brasles',
        'Celles-lès-Condé', 'Charly-sur-Marne', 'Chartèves', 'Château-Thierry', 'Chézy-sur-Marne', 'Chierry',
        'Connigis', 'Courtemont-Varennes', 'Crézancy', 'Crouttes-sur-Marne', 'Domptin', 'Essômes-sur-Marne',
        'Étampes-sur-Marne', 'Fossoy', 'Gland', 'Jaulgonne', 'Mézy-Moulins', 'Monthurel', 'Montreuil-aux-Lions',
        'Mont-Saint-Père', 'Nesles-la-Montagne', 'Nogentel', "Nogent-l'Artaud", 'Passy-sur-Marne', 'Pavant',
        'Reuilly-Sauvigny', 'Romeny-sur-Marne', 'Saulchery', 'Trélou-sur-Marne', 'Villiers-Saint-Denis'],
    '77': [
        'Citry', 'Nanteuil-sur-Marne', 'Saâcy-sur-Marne'],
    '10': [
        'Ailleville', 'Arconville', 'Argançon', 'Arrentières', 'Arsonval', 'Avirey-Lingey', 'Bagneux-la-Fosse',
        'Balnot-sur-Laignes', 'Baroville', 'Bar-sur-Aube', 'Bar-sur-Seine', 'Bergères', 'Bertignolles', 'Bligny (10)',
        'Bragelogne-Beauvoir', 'Buxeuil', 'Buxières-sur-Arce', 'Celles-sur-Ource', 'Chacenay',
        'Champignol-lez-Mondeville', 'Channes', 'Chervey', 'Colombé-la-Fosse', 'Colombé-le-Sec', 'Courteron',
        'Couvignon', 'Cunfin', 'Dolancourt', 'Éguilly-sous-Bois', 'Engente', 'Essoyes', 'Fontaine', 'Fontette',
        'Fravaux', 'Gyé-sur-Seine', 'Jaucourt', 'Landreville', 'Lignol-le-Château', 'Loches-sur-Ource',
        'Merrey-sur-Arce', 'Meurville', 'Montgueux', "Montier-en-l'Isle", 'Mussy-sur-Seine', 'Neuville-sur-Seine',
        'Noé-les-Mallets', 'Plaines-Saint-Lange', 'Polisot', 'Polisy', 'Proverville', 'Riceys', 'Rouvres-les-Vignes',
        'Saint-Usage', 'Saulcy', 'Spoy', 'Trannes', 'Urville', 'Verpillières-sur-Ource', 'Villenauxe-la-Grande',
        'Ville-sur-Arce', 'Vitry-le-Croisé', 'Viviers-sur-Artaut', 'Voigny'],
    '52': [
        'Colombey les Deux Églises', 'Rizaucourt-Buchey'],
}

CHAMPAGNE = {
    'id': 'champagne', 'name': 'Champagne',
    'bounds': (3.05, 47.84, 5.12, 49.48),
    'rivers': ['Marne', 'Aube', 'Seine'],
    'municipalities': champagne,
    # Champagne (and its Grand Cru / Premier Cru aliases) lights the whole map
    'whole': ['champagne'],
    'sources': 'Natural Earth; IGN Admin Express',
    'titles': {'montagne-de-reims': 'Montagne de Reims', 'vallee-de-la-marne': 'Vallée de la Marne', 'cote-des-blancs': 'Côte des Blancs',
               'cote-de-sezanne': 'Côte de Sézanne', 'cote-des-bar': 'Côte des Bar'},
    # The badge for the whole area in the middle of the Vallée de la Marne (by Dormans), not in the Aube
    'label_at': {'coteaux-champenois': (3.70, 49.08)},
    # Drawn in this order: the whole area (Coteaux Champenois has the same area as Champagne), the sub-regions, the 17 Grand
    # Cru villages and Rosé des Riceys. The sub-regions follow the CIVC's division in their core: the Montagne de Reims is the
    # Grande and Petite Montagne (not the Saint-Thierry massif or the Ardre valley), the Vallée de la Marne runs from the
    # Grande Vallée by Aÿ and the slopes south of Épernay to Château-Thierry and Seine-et-Marne, and the Côte des Bar is the
    # Aube vineyard but Montgueux and Villenauxe-la-Grande (Côte de Sézanne). Municipalities that are in none of them (the
    # Vitryat, Val du Petit Morin, Ardre valley and Saint-Thierry massif) are part of the whole area only.
    'areas': {
        'coteaux-champenois': [n for dep in CHAMPAGNE_ZONE.values() for n in dep],
        'montagne-de-reims': [
            'Verzenay', 'Verzy', 'Mailly-Champagne', 'Sillery', 'Puisieulx', 'Beaumont-sur-Vesle', 'Villers-Marmery',
            'Trépail', 'Ambonnay', 'Bouzy', 'Val de Livre', 'Vaudemange', 'Billy-le-Grand', 'Ludes',
            'Chigny-les-Roses', 'Rilly-la-Montagne', 'Villers-Allerand', 'Montbré', 'Taissy', 'Trois-Puits',
            'Cormontreuil', "Nogent-l'Abbesse", 'Berru', 'Cernay-lès-Reims', 'Villers-aux-Nœuds', 'Sermiers',
            'Chamery', 'Écueil', 'Sacy', 'Ville-Dommange', 'Jouy-lès-Reims', 'Pargny-lès-Reims',
            'Coulommes-la-Montagne', 'Vrigny', 'Mesneux', 'Ormes (51)', 'Bezannes', 'Gueux', 'Courmas', 'Bouilly (51)',
            'Saint-Euphraise-et-Clairizet', 'Courtagnon', 'Nanteuil-la-Forêt'],
        'vallee-de-la-marne': [
            'Aÿ-Champagne', 'Dizy', 'Hautvillers', 'Cumières', 'Mutigny', "Avenay-Val-d'Or", 'Champillon',
            'Fontaine-sur-Ay', 'Tours-sur-Marne', 'Épernay', 'Mardeuil', 'Damery', 'Venteuil', 'Romery (51)',
            'Cormoyeux', 'Fleury-la-Rivière', 'Reuil', 'Binson-et-Orquigny', 'Villers-sous-Châtillon',
            'Châtillon-sur-Marne', 'Belval-sous-Châtillon', 'Baslieux-sous-Châtillon', 'Cuchery', 'Cuisles',
            'Jonquery', 'Vandières', 'Verneuil', 'Vincelles', 'Passy-Grigny', 'Sainte-Gemme', 'Olizy', 'Champvoisy',
            'Leuvrigny', 'Mareuil-le-Port', 'Œuilly (51)', 'Troissy', 'Dormans', 'Courthiézy', 'Festigny',
            'Nesle-le-Repons', 'Igny-Comblizy', 'Le Breuil', 'Boursault', 'Vauciennes', 'Moussy', 'Pierry',
            'Chavot-Courcourt', 'Mancy', 'Monthelon', 'Brugny-Vaudancourt', "Saint-Martin-d'Ablois", 'Morangis',
            'Moslins', 'Vinay'] + CHAMPAGNE_ZONE['02'] + CHAMPAGNE_ZONE['77'],
        'cote-des-blancs': [
            'Chouilly', 'Oiry', 'Cramant', 'Avize', 'Oger', 'Mesnil-sur-Oger', 'Vertus', 'Bergères-lès-Vertus',
            'Voipreux', 'Villeneuve-Renneville-Chevigny', 'Cuis', 'Grauves', 'Val-des-Marais', 'Étréchy'],
        'cote-de-sezanne': [
            'Sézanne', 'Allemant (51)', 'Barbonne-Fayel', 'Bethon', 'Broyes', 'Celle-sous-Chantemerle', 'Chantemerle',
            'Fontaine-Denis-Nuisy', 'Mondement-Montgivroux', 'Montgenost', 'Saudoy', 'Vindey', 'Villenauxe-la-Grande'],
        'cote-des-bar': [n for n in CHAMPAGNE_ZONE['10'] if n not in ('Montgueux', 'Villenauxe-la-Grande')] + CHAMPAGNE_ZONE['52'],
    },
    'towns': [('Reims', 4.0317, 49.2583, 'big'), ('Épernay', 3.9563, 49.0402, 'mid'), ('Châlons-en-Champagne', 4.3653, 48.9566, 'mid'),
              ('Troyes', 4.0744, 48.2973, 'mid'), ('Bar-sur-Seine', 4.3747, 48.1127, 'small'), ('Bar-sur-Aube', 4.7086, 48.2331, 'small'),
              ('Château-Thierry', 3.4028, 49.0464, 'small'), ('Sézanne', 3.7225, 48.7208, 'small'), ('Vertus', 4.0017, 48.9064, 'small'),
              ('Les Riceys', 4.3700, 47.9947, 'small')],
}
# Grand Cru villages (INAO: Ambonnay, Avize, Ay, Beaumont-sur-Vesle, Bouzy, Chouilly, Cramant, Louvois, Mailly-Champagne,
# Le Mesnil-sur-Oger, Oger, Oiry, Puisieulx, Sillery, Tours-sur-Marne, Verzenay, Verzy). Ay and Louvois are drawn with the
# municipalities they now belong to (Aÿ-Champagne with Bisseuil and Mareuil-sur-Ay, Val de Livre with Tauxières-Mutry).
CHAMPAGNE['areas']['ambonnay'] = ['Ambonnay']
CHAMPAGNE['areas']['avize'] = ['Avize']
CHAMPAGNE['areas']['ay'] = ['Aÿ-Champagne']
CHAMPAGNE['areas']['beaumont-sur-vesle'] = ['Beaumont-sur-Vesle']
CHAMPAGNE['areas']['bouzy'] = ['Bouzy']
CHAMPAGNE['areas']['chouilly'] = ['Chouilly']
CHAMPAGNE['areas']['cramant'] = ['Cramant']
CHAMPAGNE['areas']['louvois'] = ['Val de Livre']
CHAMPAGNE['areas']['mailly-champagne'] = ['Mailly-Champagne']
CHAMPAGNE['areas']['le-mesnil-sur-oger'] = ['Mesnil-sur-Oger']
CHAMPAGNE['areas']['oger'] = ['Oger']
CHAMPAGNE['areas']['oiry'] = ['Oiry']
CHAMPAGNE['areas']['puisieulx'] = ['Puisieulx']
CHAMPAGNE['areas']['sillery'] = ['Sillery']
CHAMPAGNE['areas']['tours-sur-marne'] = ['Tours-sur-Marne']
CHAMPAGNE['areas']['verzenay'] = ['Verzenay']
CHAMPAGNE['areas']['verzy'] = ['Verzy']
CHAMPAGNE['areas']['rose-des-riceys'] = ['Riceys']

# ---------- Roussillon ----------
def roussillon():
    """Municipalities of Pyrénées-Orientales (66) and Aude (11), named as in Bourgogne ('Bages (66)' when a name is
    found in both)."""
    out, seen = {}, {}
    for dep in ('66', '11'):
        for f in load(f'communes-{dep}.geojson')['features']:
            name = f['properties']['nom']
            g = shape(f['geometry'])
            out[f'{name} ({dep})'] = g
            seen.setdefault(name, []).append(g)
    out.update({n: gs[0] for n, gs in seen.items() if len(gs) == 1})
    return out

# The areas by the municipalities INAO lists in the cahiers des charges, with Admin Express names (articles dropped:
# 'Boulou', 'Soler', 'Cluses', 'Vivier', 'Palme'). Municipalities listed 'en partie' (e.g. Perpignan and Millas only
# north of the Têt for Côtes du Roussillon Villages) are drawn whole.
# Rivesaltes (cahier des charges of 14 June 2023): 9 Aude and 86 Pyrénées-Orientales municipalities.
RIVESALTES = [
    'Cascastel-des-Corbières', 'Caves', 'Fitou', 'Leucate', 'Palme', 'Paziols', 'Treilles', 'Tuchan', 'Villeneuve-les-Corbières',
    'Argelès-sur-Mer', 'Bages (66)', 'Baho', 'Baixas', 'Banyuls-dels-Aspres', 'Bélesta', 'Boulou', 'Brouilla', 'Cabestany',
    'Caixas', 'Calce', 'Camélas', 'Canet-en-Roussillon', 'Canohès', 'Cases-de-Pène', 'Cassagnes', 'Castelnou', 'Céret',
    'Claira', 'Cluses', 'Corbère', 'Corbère-les-Cabanes', 'Corneilla-del-Vercol', 'Corneilla-la-Rivière', 'Elne',
    "Espira-de-l'Agly", 'Estagel', 'Fourques', 'Ille-sur-Têt', 'Laroque-des-Albères', 'Latour-Bas-Elne', 'Latour-de-France',
    'Lesquerde', 'Llauro', 'Llupia', 'Maureillas-las-Illas', 'Maury', 'Millas', 'Montauriol (66)', 'Montescot',
    'Montesquieu-des-Albères', 'Montner', 'Néfiach', 'Opoul-Périllos', 'Ortaffa', 'Palau-del-Vidre', 'Passa', 'Perpignan',
    'Peyrestortes', 'Pézilla-la-Rivière', 'Pia', 'Planèzes', 'Pollestres', 'Ponteilla', 'Rasiguères', 'Reynès', 'Rivesaltes',
    'Saint-André', 'Sainte-Colombe-de-la-Commanderie', 'Saint-Estève', "Saint-Féliu-d'Amont", "Saint-Féliu-d'Avall",
    'Saint-Génis-des-Fontaines', 'Saint-Hippolyte', 'Saint-Jean-Lasseille', 'Saint-Jean-Pla-de-Corts', 'Saint-Nazaire',
    'Saint-Paul-de-Fenouillet', 'Saleilles', 'Salses-le-Château', 'Soler', 'Sorède', 'Tautavel', 'Terrats', 'Thuir',
    'Tordères', 'Toulouges', 'Tresserre', 'Trouillas', 'Villelongue-dels-Monts', 'Villemolaque', 'Villeneuve-de-la-Raho',
    'Villeneuve-la-Rivière', 'Vingrau', 'Vivès']
# Banyuls, Banyuls Grand Cru and Collioure: the four municipalities of the Côte Vermeille
BANYULS = ['Banyuls-sur-Mer', 'Cerbère', 'Collioure', 'Port-Vendres']
# Côtes du Roussillon Villages (cahier des charges, IV 1° a): 51 municipalities or parts of them
CDR_VILLAGES = [
    'Ansignan', 'Bages (66)', 'Baho', 'Baixas', 'Banyuls-dels-Aspres', 'Bélesta', 'Brouilla', 'Calce', 'Caramany',
    'Cases-de-Pène', 'Cassagnes', 'Corneilla-la-Rivière', 'Elne', "Espira-de-l'Agly", 'Estagel', 'Fourques', 'Lansac',
    'Latour-de-France', 'Lesquerde', 'Llupia', 'Maury', 'Millas', 'Montalba-le-Château', 'Montauriol (66)', 'Montner',
    'Opoul-Périllos', 'Ortaffa', 'Passa', 'Perpignan', 'Peyrestortes', 'Pézilla-la-Rivière', 'Planèzes', 'Ponteilla',
    'Rasiguères', 'Rivesaltes', 'Saint-Arnac', 'Saint-Estève', 'Saint-Jean-Lasseille', 'Sainte-Colombe-de-la-Commanderie',
    'Saint-Paul-de-Fenouillet', 'Salses-le-Château', 'Tautavel', 'Terrats', 'Thuir', 'Tordères', 'Tresserre', 'Trouillas',
    'Villemolaque', 'Villeneuve-la-Rivière', 'Vingrau', 'Vivès']

ROUSSILLON = {
    'id': 'roussillon', 'name': 'Roussillon',
    'bounds': (2.15, 42.38, 3.25, 43.0),
    # The Têt, Agly and Tech are not in Natural Earth (10m); the map has no rivers
    'rivers': ['Têt', 'Agly', 'Tech'],
    'municipalities': roussillon,
    'whole': ['roussillon'],
    'sources': 'Natural Earth; IGN Admin Express',
    # Badges by the towns the appellations are named after, not in the middle of the large areas
    'label_at': {'rivesaltes': (2.80, 42.76), 'muscat-de-rivesaltes': (2.86, 42.72), 'grand-roussillon': (2.92, 42.66),
                 'cotes-du-roussillon': (2.72, 42.58), 'cotes-du-roussillon-villages': (2.66, 42.72)},
    # Drawn in this order: the large areas first (Côtes du Roussillon, Muscat de Rivesaltes and Grand Roussillon, then
    # Rivesaltes), the Villages and their five named villages, Maury and the Côte Vermeille.
    'areas': {
        # Côtes du Roussillon (cahier des charges of 22 March 2022): Pyrénées-Orientales only; Arboussols, Estoher,
        # Finestret, Ille-sur-Têt and Vivier only in part
        'cotes-du-roussillon': [
            'Ansignan', 'Arboussols', 'Argelès-sur-Mer', 'Bages (66)', 'Baho', 'Baixas', 'Banyuls-dels-Aspres', 'Bélesta',
            'Boulou', 'Brouilla', 'Cabestany', 'Calce', 'Camélas', 'Canet-en-Roussillon', 'Canohès', 'Caramany',
            'Cases-de-Pène', 'Cassagnes', 'Castelnou', 'Caudiès-de-Fenouillèdes', 'Céret', 'Claira', 'Corbère',
            'Corbère-les-Cabanes', 'Corneilla-del-Vercol', 'Corneilla-la-Rivière', 'Elne', 'Espira-de-Conflent',
            "Espira-de-l'Agly", 'Estagel', 'Estoher', 'Felluns', 'Finestret', 'Fourques', 'Ille-sur-Têt', 'Lansac',
            'Laroque-des-Albères', 'Latour-de-France', 'Lesquerde', 'Llauro', 'Llupia', 'Maureillas-las-Illas', 'Maury',
            'Millas', 'Montalba-le-Château', 'Montauriol (66)', 'Montescot', 'Montesquieu-des-Albères', 'Montner',
            'Néfiach', 'Oms', 'Opoul-Périllos', 'Ortaffa', 'Palau-del-Vidre', 'Passa', 'Perpignan', 'Peyrestortes',
            'Pézilla-la-Rivière', 'Pia', 'Planèzes', 'Pollestres', 'Ponteilla', 'Prugnanes', 'Rasiguères', 'Rigarda',
            'Rivesaltes', 'Rodès', 'Saint-André', 'Saint-Arnac', 'Saint-Estève', "Saint-Féliu-d'Amont",
            "Saint-Féliu-d'Avall", 'Saint-Génis-des-Fontaines', 'Saint-Hippolyte', 'Saint-Jean-Lasseille',
            'Saint-Jean-Pla-de-Corts', 'Saint-Martin-de-Fenouillet', 'Saint-Nazaire', 'Saint-Paul-de-Fenouillet',
            'Sainte-Colombe-de-la-Commanderie', 'Saleilles', 'Salses-le-Château', 'Soler', 'Sorède', 'Tarerach', 'Tautavel',
            'Terrats', 'Thuir', 'Tordères', 'Toulouges', 'Tresserre', 'Trévillach', 'Trilla', 'Trouillas',
            'Villelongue-dels-Monts', 'Villemolaque', 'Villeneuve-de-la-Raho', 'Villeneuve-la-Rivière', 'Vinça', 'Vingrau',
            'Vivès', 'Vivier'],
        # Muscat de Rivesaltes (EU single document): the Rivesaltes area and the Côte Vermeille
        'muscat-de-rivesaltes': RIVESALTES + BANYULS,
        # Grand Roussillon: no cahier des charges found online; drawn with the Muscat de Rivesaltes area (the Rivesaltes,
        # Maury and Banyuls areas together, as it is usually described)
        'grand-roussillon': RIVESALTES + BANYULS,
        'rivesaltes': RIVESALTES,
        'cotes-du-roussillon-villages': CDR_VILLAGES,
        'les-aspres': [
            'Bages (66)', 'Banyuls-dels-Aspres', 'Brouilla', 'Elne', 'Fourques', 'Llupia', 'Montauriol (66)', 'Ortaffa',
            'Passa', 'Ponteilla', 'Saint-Jean-Lasseille', 'Sainte-Colombe-de-la-Commanderie', 'Terrats', 'Thuir', 'Tordères',
            'Tresserre', 'Trouillas', 'Villemolaque', 'Vivès'],
        'latour-de-france': ['Cassagnes', 'Estagel', 'Latour-de-France', 'Montner', 'Planèzes'],
        'caramany': ['Bélesta', 'Caramany', 'Cassagnes'],
        'lesquerde': ['Lansac', 'Lesquerde', 'Rasiguères'],
        'tautavel': ['Tautavel', 'Vingrau'],
        # Maury, doux and sec (INAO product sheets): four municipalities
        'maury': ['Maury', 'Tautavel', 'Saint-Paul-de-Fenouillet', 'Rasiguères'],
        'banyuls': BANYULS,
        'banyuls-grand-cru': BANYULS,
        'collioure': BANYULS,
    },
    'towns': [('Perpignan', 2.8954, 42.6986, 'big'), ('Rivesaltes', 2.8742, 42.7689, 'mid'), ('Banyuls-sur-Mer', 3.1289, 42.4833, 'small'),
              ('Collioure', 3.0831, 42.5253, 'small'), ('Maury', 2.6081, 42.8086, 'small'), ('Tautavel', 2.7464, 42.8158, 'small'),
              ('Céret', 2.7481, 42.4856, 'small'), ('Thuir', 2.7556, 42.6322, 'small'), ('Estagel', 2.6967, 42.7728, 'small'),
              ('Saint-Paul-de-Fenouillet', 2.5050, 42.8100, 'small'), ('Argelès-sur-Mer', 3.0236, 42.5461, 'small')],
}

# ---------- Rhône ----------
def rhone():
    """Municipalities of Rhône (69), Loire (42), Ardèche (07), Drôme (26), Vaucluse (84) and Gard (30), named as in
    Bourgogne ('Lemps (07)', 'Comps (30)', 'Rochegude (26)' when a name is found in more than one of them)."""
    out, seen = {}, {}
    for dep in ('69', '42', '07', '26', '84', '30'):
        for f in load(f'communes-{dep}.geojson')['features']:
            name = f['properties']['nom']
            g = shape(f['geometry'])
            out[f'{name} ({dep})'] = g
            seen.setdefault(name, []).append(g)
    out.update({n: gs[0] for n, gs in seen.items() if len(gs) == 1})
    return out

# Côtes du Rhône Villages (cahier des charges, IV 1° a): 95 municipalities in Ardèche, Drôme, Gard and Vaucluse
CDR_VILLAGES_RHONE = [
    # Ardèche
    'Bourg-Saint-Andéol', "Saint-Just-d'Ardèche", "Saint-Marcel-d'Ardèche", "Saint-Martin-d'Ardèche",
    # Drôme
    'Bouchet', 'Mérindol-les-Oliviers', 'Mirabel-aux-Baronnies', 'Mollans-sur-Ouvèze', 'Montbrison-sur-Lez', 'Nyons',
    'Pègue', 'Piégon', 'Rochegude (26)', 'Rousset-les-Vignes', 'Saint-Maurice-sur-Eygues', 'Saint-Pantaléon-les-Vignes',
    'Suze-la-Rousse', 'Taulignan', 'Tulette', 'Venterol', 'Vinsobres',
    # Gard
    'Aiguèze', 'Bagnols-sur-Cèze', 'Castillon-du-Gard', 'Cavillargues', 'Chusclan', 'Codolet', 'Comps (30)', 'Cornillon',
    'Domazan', 'Estézargues', 'Fournès', 'Gaujac', 'Laudun-l\'Ardoise', 'Montfrin', 'Orsan', 'Pont-Saint-Esprit',
    'Pujaut', 'Rochefort-du-Gard', 'Sabran', 'Saint-Alexandre', 'Saint-Étienne-des-Sorts', 'Saint-Gervais',
    "Saint-Hilaire-d'Ozilhan", 'Saint-Marcel-de-Careiret', "Saint-Michel-d'Euzet", 'Saint-Nazaire', 'Saint-Pons-la-Calm',
    'Saint-Victor-la-Coste', 'Sauveterre', 'Saze', 'Tresques', 'Valliguières', 'Vénéjan',
    # Vaucluse
    'Beaumes-de-Venise', 'Bédarrides', 'Bollène', 'Buisson', 'Cairanne', 'Camaret-sur-Aigues', 'Caumont-sur-Durance',
    'Châteauneuf-de-Gadagne', 'Courthézon', 'Faucon', 'Grillon', 'Jonquières', 'Roque-Alric', 'Lafare',
    'Lagarde-Paréol', 'Mondragon', 'Morières-lès-Avignon', 'Orange', 'Piolenc', 'Puyméras', 'Rasteau', 'Richerenches',
    'Roaix', 'Sablet', 'Saint-Marcellin-lès-Vaison', 'Saint-Romain-en-Viennois', 'Saint-Roman-de-Malegarde',
    'Saint-Saturnin-lès-Avignon', 'Sainte-Cécile-les-Vignes', 'Séguret', 'Sérignan-du-Comtat', 'Sorgues', 'Suzette',
    'Travaillan', 'Uchaux', 'Vaison-la-Romaine', 'Valréas', 'Vedène', 'Villedieu', 'Violès', 'Visan']

RHONE = {
    'id': 'rhone', 'name': 'Rhône',
    # From Vienne to Avignon: the northern Rhône (Côte-Rôtie to Saint-Péray) and the southern Rhône (Vinsobres to
    # Tavel) about 60 km apart, with room on both sides of the river so the map is not too narrow
    'bounds': (4.05, 43.79, 5.62, 45.58),
    # The Isère, Drôme and Ardèche are not in Natural Earth (10m)
    'rivers': ['Rhône', 'Durance', 'Isère', 'Drôme', 'Ardèche'],
    'municipalities': rhone,
    # Côtes du Rhône (the generic appellation of the whole valley) lights the whole map
    'whole': ['cotes-du-rhone'],
    'sources': 'Natural Earth; IGN Admin Express',
    # The Villages badge on the Plan de Dieu, in the middle of the southern Villages, not by the Gard or Ardèche edge
    'label_at': {'cotes-du-rhone-villages': (4.93, 44.20)},
    # The areas by the municipalities INAO lists in the cahiers des charges, with Admin Express names (articles dropped:
    # 'Pègue', 'Roque-Alric', 'Roche-de-Glun'). Municipalities that are only partly in an appellation are drawn whole.
    # Drawn in this order: Côtes du Rhône Villages (which also covers the municipalities of Cairanne, Rasteau and
    # Beaumes-de-Venise), then the crus from north to south, the wider ones before those they share municipalities with.
    'areas': {
        'cotes-du-rhone-villages': CDR_VILLAGES_RHONE,
        # North
        # Saint-Joseph (26 municipalities) before Condrieu, which shares Chavanay, Malleval, Saint-Pierre-de-Bœuf and Limony
        'saint-joseph': [
            'Andance', 'Ardoix', 'Arras-sur-Rhône', 'Champagne', 'Charnas', 'Châteaubourg', 'Félines', 'Glun',
            'Guilherand-Granges', 'Lemps (07)', 'Limony', 'Mauves', 'Ozon', 'Peyraud', 'Saint-Désirat', 'Saint-Étienne-de-Valoux',
            'Saint-Jean-de-Muzols', 'Sarras', 'Sécheras', 'Serrières', 'Talencieux', 'Tournon-sur-Rhône', 'Vion',
            'Chavanay', 'Malleval', 'Saint-Pierre-de-Bœuf'],
        'cote-rotie': ['Ampuis', 'Saint-Cyr-sur-le-Rhône', 'Tupin-et-Semons'],
        'condrieu': ['Condrieu', 'Saint-Michel-sur-Rhône', 'Vérin', 'Chavanay', 'Malleval', 'Saint-Pierre-de-Bœuf', 'Limony'],
        'chateau-grillet': ['Saint-Michel-sur-Rhône', 'Vérin'],
        'crozes-hermitage': ['Beaumont-Monteux', 'Chanos-Curson', 'Crozes-Hermitage', 'Érôme', 'Gervans', 'Larnage',
                             'Mercurol-Veaunes', "Pont-de-l'Isère", 'Roche-de-Glun', 'Serves-sur-Rhône', "Tain-l'Hermitage"],
        'hermitage': ["Tain-l'Hermitage", 'Crozes-Hermitage', 'Larnage'],
        'cornas': ['Cornas'],
        'saint-peray': ['Saint-Péray', 'Toulaud'],
        # South
        'vinsobres': ['Vinsobres'],
        'cairanne': ['Cairanne'],
        'rasteau': ['Rasteau'],
        'gigondas': ['Gigondas'],
        'vacqueyras': ['Vacqueyras', 'Sarrians'],
        'beaumes-de-venise': ['Beaumes-de-Venise', 'Lafare', 'Roque-Alric', 'Suzette'],
        'chateauneuf-du-pape': ['Châteauneuf-du-Pape', 'Orange', 'Courthézon', 'Bédarrides', 'Sorgues'],
        'lirac': ['Lirac', 'Roquemaure', 'Saint-Geniès-de-Comolas', 'Saint-Laurent-des-Arbres'],
        'tavel': ['Tavel'],
    },
    'towns': [('Vienne', 4.8742, 45.5253, 'mid'), ('Ampuis', 4.8108, 45.4894, 'small'), ("Tain-l'Hermitage", 4.8456, 45.0700, 'small'),
              ('Tournon-sur-Rhône', 4.8331, 45.0672, 'small'), ('Valence', 4.8917, 44.9334, 'big'), ('Montélimar', 4.7507, 44.5581, 'mid'),
              ('Orange', 4.8089, 44.1381, 'mid'), ('Avignon', 4.8055, 43.9493, 'big'), ('Châteauneuf-du-Pape', 4.8322, 44.0567, 'small'),
              ('Gigondas', 5.0047, 44.1636, 'small'), ('Nyons', 5.1400, 44.3606, 'small'), ('Condrieu', 4.7667, 45.4631, 'small')],
}

# ---------- Toscana ----------
def comuni(name):
    """Italian municipalities (comuni) of one region, ISTAT boundaries as published by openpolis/geojson-italy
    (geojson/limits_R_<region code>_municipalities.geojson), by name. Names are unique within a region."""
    return {f['properties']['name']: shape(f['geometry']) for f in load(name)['features']}


def toscana():
    """The comuni of Toscana (limits_R_9, saved as it-toscana-comuni.geojson). These are today's comuni: merged ones are
    drawn whole (Barberino Tavarnelle, 2019, from Barberino Val d'Elsa and Tavarnelle Val di Pesa; Montalcino, 2017,
    with San Giovanni d'Asso)."""
    return comuni('it-toscana-comuni.geojson')

# Chianti DOCG: the disciplinare (Art. 3, after the D.P.R. of 9 August 1967 and the D.M. of 31 July 1932) draws the zone by
# boundary lines, not as a list of comuni. Drawn here with the comuni those lines run through or enclose, by province
# (Colli Aretini and Valdarno/Valdichiana; Colli Fiorentini, Rufina, Montespertoli and Montalbano; Colline Pisane; Colli
# Senesi), without the four comuni that lie wholly in Chianti Classico. An approximation: many comuni are only partly in it.
CHIANTI = [
    # Arezzo
    'Arezzo', 'Bucine', 'Capolona', 'Castelfranco Piandiscò', 'Castiglion Fibocchi', 'Castiglion Fiorentino', 'Cavriglia',
    'Civitella in Val di Chiana', 'Cortona', 'Foiano della Chiana', 'Laterina Pergine Valdarno', 'Loro Ciuffenna',
    'Lucignano', 'Marciano della Chiana', 'Monte San Savino', 'Montevarchi', 'San Giovanni Valdarno', 'Subbiano',
    'Terranuova Bracciolini',
    # Firenze and Prato
    'Bagno a Ripoli', 'Barberino Tavarnelle', 'Capraia e Limite', 'Carmignano', 'Castelfiorentino', 'Cerreto Guidi',
    'Certaldo', 'Dicomano', 'Empoli', 'Fiesole', 'Figline e Incisa Valdarno', 'Firenze', 'Fucecchio', 'Gambassi Terme',
    'Impruneta', 'Lastra a Signa', 'Londa', 'Montaione', 'Montelupo Fiorentino', 'Montespertoli', 'Pelago', 'Pontassieve',
    'Reggello', "Rignano sull'Arno", 'Rufina', 'San Casciano in Val di Pesa', 'San Godenzo', 'Scandicci', 'Signa',
    'Vicchio', 'Vinci', 'Poggio a Caiano', 'Montemurlo', 'Prato',
    # Pisa
    'Capannoli', 'Casciana Terme Lari', 'Chianni', 'Crespina Lorenzana', 'Fauglia', 'Montopoli in Val d\'Arno',
    'Orciano Pisano', 'Palaia', 'Peccioli', 'Ponsacco', 'San Miniato', 'Santa Luce', 'Terricciola',
    # Pistoia
    'Lamporecchio', 'Larciano', 'Monsummano Terme', 'Pistoia', 'Quarrata', 'Serravalle Pistoiese',
    # Siena
    'Asciano', 'Buonconvento', "Casole d'Elsa", 'Castelnuovo Berardenga', 'Cetona', 'Chianciano Terme', 'Chiusi',
    "Colle di Val d'Elsa", 'Montalcino', 'Montepulciano', 'Monteriggioni', "Monteroni d'Arbia", 'Murlo', 'Pienza',
    'Poggibonsi', 'Rapolano Terme', 'San Gimignano', 'Sarteano', 'Siena', 'Sinalunga', 'Sovicille', 'Torrita di Siena',
    'Trequanda']

# Maremma Toscana DOC: the whole province of Grosseto
MAREMMA = ['Arcidosso', 'Campagnatico', 'Capalbio', 'Castel del Piano', "Castell'Azzara", 'Castiglione della Pescaia',
           'Cinigiano', 'Civitella Paganico', 'Follonica', 'Gavorrano', 'Grosseto', 'Isola del Giglio', 'Magliano in Toscana',
           'Manciano', 'Massa Marittima', 'Monte Argentario', 'Monterotondo Marittimo', 'Montieri', 'Orbetello', 'Pitigliano',
           'Roccalbegna', 'Roccastrada', 'Santa Fiora', 'Scansano', 'Scarlino', 'Seggiano', 'Semproniano', 'Sorano']

TOSCANA = {
    'id': 'toscana', 'name': 'Toscana',
    # From Pistoia and Prato to the Lazio border, the coast from Pisa to the Argentario with Elba
    'bounds': (10.0, 42.33, 12.25, 44.05),
    # The Ombrone is not in Natural Earth (10m)
    'rivers': ['Arno', 'Ombrone'],
    'municipalities': toscana,
    # Toscana IGT (and 'Toscana', 'Tuscany') lights the whole map
    'whole': ['toscana-igt', 'toscana', 'tuscany'],
    'sources': 'Natural Earth; ISTAT (openpolis)',
    # Badges by the places the appellations are known by, not in the middle of the large areas
    'label_at': {'chianti': (11.05, 43.62), 'vin-santo-del-chianti': (11.05, 43.62), 'maremma': (11.05, 42.95),
                 'montecucco': (11.42, 42.90), 'chianti-classico': (11.33, 43.50), 'morellino-di-scansano': (11.30, 42.68)},
    # The areas by the comuni the disciplinari di produzione list (Art. 3); comuni only partly in an appellation are drawn
    # whole. Drawn in this order: the wide areas (Maremma Toscana, Montecucco, Chianti), then the smaller ones on top.
    'areas': {
        'maremma': MAREMMA,
        # Montecucco DOC / Sangiovese DOCG: Cinigiano and Civitella Paganico wholly, the others in part
        'montecucco': ['Arcidosso', 'Campagnatico', 'Castel del Piano', 'Cinigiano', 'Civitella Paganico', 'Roccalbegna',
                       'Seggiano'],
        'chianti': CHIANTI,
        # Vin Santo del Chianti: the Chianti zone
        'vin-santo-del-chianti': CHIANTI,
        # Chianti Classico: Castellina, Gaiole, Greve and Radda wholly; Barberino Tavarnelle, Castelnuovo Berardenga,
        # Poggibonsi and San Casciano in Val di Pesa in part (drawn whole)
        'chianti-classico': ['Castellina in Chianti', 'Gaiole in Chianti', 'Greve in Chianti', 'Radda in Chianti',
                             'Barberino Tavarnelle', 'Castelnuovo Berardenga', 'Poggibonsi', 'San Casciano in Val di Pesa'],
        'carmignano': ['Carmignano', 'Poggio a Caiano'],
        'vernaccia-di-san-gimignano': ['San Gimignano'],
        # The comune of Montalcino before it took in San Giovanni d'Asso (2017); drawn as today's comune
        'brunello-di-montalcino': ['Montalcino'],
        'rosso-di-montalcino': ['Montalcino'],
        'vino-nobile-di-montepulciano': ['Montepulciano'],
        'rosso-di-montepulciano': ['Montepulciano'],
        # Morellino di Scansano: Scansano wholly; Campagnatico, Grosseto, Magliano in Toscana, Manciano, Roccalbegna
        # and Semproniano in part
        'morellino-di-scansano': ['Scansano', 'Campagnatico', 'Grosseto', 'Magliano in Toscana', 'Manciano', 'Roccalbegna',
                                  'Semproniano'],
        # Bolgheri: part of Castagneto Carducci (drawn whole)
        'bolgheri': ['Castagneto Carducci'],
    },
    'towns': [('Firenze', 11.2558, 43.7696, 'big'), ('Siena', 11.3308, 43.3188, 'big'), ('Pisa', 10.4017, 43.7228, 'mid'),
              ('Livorno', 10.3167, 43.5485, 'mid'), ('Grosseto', 11.1139, 42.7635, 'mid'), ('Montalcino', 11.4889, 43.0586, 'small'),
              ('Montepulciano', 11.7820, 43.0927, 'small'), ('San Gimignano', 11.0433, 43.4677, 'small'),
              ('Bolgheri', 10.6136, 43.2306, 'small'), ('Scansano', 11.3326, 42.6879, 'small')],
}

# ---------- Piemonte ----------
# Barbaresco and Asti / Moscato d'Asti take in only the south-eastern frazioni of Alba (San Rocco Seno d'Elvio, and
# Como for Asti). They are drawn as the part of the comune of Alba east of 8.055° E and south of 44.695° N, an
# approximation of those frazioni (the comune itself is in Langhe, Barbera d'Alba and Dolcetto d'Alba).
ALBA_SE = "Alba (San Rocco Seno d'Elvio)"

def piemonte():
    """The comuni of Piemonte (limits_R_1, saved as it-piemonte-comuni.geojson), plus the south-east of Alba."""
    out = comuni('it-piemonte-comuni.geojson')
    out[ALBA_SE] = out['Alba'].intersection(box(8.055, 44.60, 8.20, 44.695))
    return out

# The comuni as the disciplinari di produzione list them (Art. 3), with ISTAT names ('S. Stefano Belbo' → 'Santo Stefano
# Belbo', 'Acqui' → 'Acqui Terme', 'Calliano' → 'Calliano Monferrato'). Comuni listed only in part are drawn whole. Merged
# comuni are drawn whole: Camo is part of Santo Stefano Belbo (2019), Moransengo and Tonengo are Moransengo-Tonengo (2023),
# Lu and Cuccaro Monferrato are Lu e Cuccaro Monferrato (2019).
# Langhe DOC: 94 comuni in the province of Cuneo (the list for all types but Arneis)
LANGHE = [
    'Alba', 'Albaretto della Torre', 'Arguello', "Baldissero d'Alba", 'Barbaresco', 'Barolo', 'Bastia Mondovì',
    'Belvedere Langhe', 'Benevello', 'Bergolo', 'Bonvicino', 'Borgomale', 'Bosia', 'Bossolasco', 'Bra', 'Briaglia',
    'Canale', 'Carrù', 'Castagnito', 'Castellinaldo d\'Alba', 'Castellino Tanaro', 'Castiglione Falletto',
    'Castiglione Tinella', 'Castino', 'Cerretto Langhe', 'Cherasco', 'Cigliè', 'Cissone', 'Clavesana',
    "Corneliano d'Alba", 'Cortemilia', 'Cossano Belbo', 'Cravanzana', "Diano d'Alba", 'Dogliani', 'Farigliano',
    'Feisoglio', 'Gorzegno', 'Govone', 'Grinzane Cavour', 'Guarene', 'Igliano', 'La Morra', 'Lequio Berria', 'Levice',
    'Magliano Alfieri', 'Mango', 'Marsaglia', 'Mombarcaro', 'Monchiero', 'Mondovì', "Monforte d'Alba", 'Montà',
    'Montaldo Roero', 'Montelupo Albese', 'Monteu Roero', "Monticello d'Alba", 'Murazzano', 'Narzole', 'Neive',
    'Neviglie', 'Niella Belbo', 'Niella Tanaro', 'Novello', 'Perletto', 'Pezzolo Valle Uzzone', "Piobesi d'Alba",
    'Piozzo', 'Pocapaglia', 'Priocca', 'Prunetto', 'Roascio', 'Rocca Cigliè', 'Rocchetta Belbo', 'Roddi', 'Roddino',
    'Rodello', 'San Benedetto Belbo', 'San Michele Mondovì', "Santa Vittoria d'Alba", 'Santo Stefano Belbo',
    'Santo Stefano Roero', "Serralunga d'Alba", 'Serravalle Langhe', 'Sinio', 'Somano', 'Sommariva Perno',
    'Torre Bormida', 'Treiso', 'Trezzo Tinella', 'Verduno', "Vezza d'Alba", 'Vicoforte']

# Barbera d'Asti DOCG: 116 comuni in the province of Asti and 51 in Alessandria (Coniolo, Casale Monferrato, Occimiano and
# Mirabello Monferrato only on the hills south of the Po).
BARBERA_D_ASTI = [
    # Asti
    'Agliano Terme', 'Albugnano', 'Antignano', 'Aramengo', 'Asti', "Azzano d'Asti", 'Baldichieri d\'Asti', 'Belveglio',
    'Berzano di San Pietro', 'Bruno', 'Bubbio', "Buttigliera d'Asti", 'Calamandrana', 'Calliano Monferrato', 'Calosso',
    'Camerano Casasco', 'Canelli', 'Cantarana', 'Capriglio', 'Casorzo Monferrato', 'Cassinasco', 'Castagnole delle Lanze',
    'Castagnole Monferrato', 'Castel Boglione', "Castell'Alfero", 'Castellero', 'Castelletto Molina',
    "Castello di Annone", 'Castelnuovo Belbo', 'Castelnuovo Calcea', 'Castelnuovo Don Bosco', 'Castel Rocchero',
    'Celle Enomondo', "Cerreto d'Asti", 'Cerro Tanaro', 'Cessole', "Chiusano d'Asti", 'Cinaglio', "Cisterna d'Asti",
    'Coazzolo', 'Cocconato', 'Corsione', 'Cortandone', 'Cortanze', 'Cortazzone', 'Cortiglione', 'Cossombrato',
    "Costigliole d'Asti", 'Cunico', 'Dusino San Michele', 'Ferrere', 'Fontanile', 'Frinco', 'Grana Monferrato', 'Grazzano Badoglio',
    'Incisa Scapaccino', "Isola d'Asti", 'Loazzolo', 'Maranzana', 'Maretto', 'Moasca', 'Mombaldone', 'Mombaruzzo',
    'Mombercelli', 'Monale', 'Monastero Bormida', 'Moncalvo', 'Moncucco Torinese', 'Mongardino', 'Montabone', 'Montafia',
    'Montaldo Scarampi', "Montechiaro d'Asti", "Montegrosso d'Asti", 'Montemagno Monferrato', 'Montiglio Monferrato', 'Moransengo-Tonengo',
    'Nizza Monferrato', 'Olmo Gentile', 'Passerano Marmorito', 'Penango', 'Piea', "Pino d'Asti", 'Piovà Massaia',
    'Portacomaro', 'Quaranti', 'Refrancore', "Revigliasco d'Asti", 'Roatto', 'Robella', "Rocca d'Arazzo",
    'Roccaverano', 'Rocchetta Palafea', 'Rocchetta Tanaro', "San Damiano d'Asti", 'San Giorgio Scarampi',
    'San Martino Alfieri', 'San Marzano Oliveto', 'San Paolo Solbrito', 'Scurzolengo', 'Serole', 'Sessame', 'Settime',
    'Soglio', 'Tigliole', 'Tonco', 'Vaglio Serra', 'Valfenera', 'Vesime', "Viale", 'Viarigi', 'Vigliano d\'Asti',
    "Villafranca d'Asti", 'Villa San Secondo', 'Vinchio',
    # Alessandria
    'Acqui Terme', 'Alfiano Natta', 'Alice Bel Colle', 'Altavilla Monferrato', 'Bergamasco', 'Bistagno',
    'Borgoratto Alessandrino', 'Camagna Monferrato', 'Camino', 'Carentino', 'Casale Monferrato', 'Cassine',
    'Castelletto Merli', 'Cella Monte', 'Cereseto', 'Cerrina Monferrato', 'Coniolo', 'Conzano', 'Lu e Cuccaro Monferrato',
    'Frascaro', 'Frassinello Monferrato', 'Fubine Monferrato', 'Gabiano', 'Gamalero', 'Mirabello Monferrato',
    'Mombello Monferrato', 'Moncestino', 'Murisengo Monferrato', 'Occimiano', 'Odalengo Grande', 'Odalengo Piccolo', 'Olivola',
    'Ottiglio', 'Ozzano Monferrato', 'Pontestura', 'Ponzano Monferrato', 'Ricaldone', 'Rosignano Monferrato',
    'Sala Monferrato', 'San Giorgio Monferrato', 'San Salvatore Monferrato', 'Serralunga di Crea', 'Solonghello',
    'Strevi', 'Terruggia', 'Terzo', 'Treville', 'Vignale Monferrato', 'Villadeati', 'Villamiroglio']

# Asti and Moscato d'Asti DOCG: 9 comuni in Alessandria, 28 in Asti and 13 in Cuneo, and the frazioni Como and San Rocco
# Seno d'Elvio of Alba
ASTI = [
    'Acqui Terme', 'Alice Bel Colle', 'Bistagno', 'Cassine', 'Grognardo', 'Ricaldone', 'Strevi', 'Terzo', 'Visone',
    'Bubbio', 'Calamandrana', 'Calosso', 'Canelli', 'Cassinasco', 'Castagnole delle Lanze', 'Castel Boglione',
    'Castelletto Molina', 'Castelnuovo Belbo', 'Castel Rocchero', 'Cessole', 'Coazzolo', "Costigliole d'Asti", 'Fontanile',
    'Incisa Scapaccino', 'Loazzolo', 'Maranzana', 'Mombaruzzo', 'Monastero Bormida', 'Montabone', 'Nizza Monferrato',
    'Quaranti', 'San Marzano Oliveto', 'Moasca', 'Sessame', 'Vesime', 'Rocchetta Palafea', 'San Giorgio Scarampi',
    'Castiglione Tinella', 'Cossano Belbo', 'Mango', 'Neive', 'Neviglie', 'Rocchetta Belbo', "Serralunga d'Alba",
    'Santo Stefano Belbo', "Santa Vittoria d'Alba", 'Treiso', 'Trezzo Tinella', 'Castino', 'Perletto', ALBA_SE]

PIEMONTE = {
    'id': 'piemonte', 'name': 'Piemonte',
    # The Langhe, Roero and Monferrato with Gavi by the Ligurian border, and Gattinara and Ghemme in the north; Torino on
    # the western edge, not the Alps
    'bounds': (7.55, 44.30, 9.0, 45.70),
    'rivers': ['Tanaro', 'Po'],
    'municipalities': piemonte,
    # Piemonte DOC (and 'Piedmont') lights the whole map
    'whole': ['piemonte', 'piedmont'],
    'sources': 'Natural Earth; ISTAT (openpolis)',
    # Badges for the wide areas by the places they are known by, apart from those of the smaller areas within them
    'label_at': {'langhe': (8.06, 44.54), 'barbera-d-alba': (8.03, 44.655), 'dolcetto-d-alba': (8.12, 44.62),
                 'nebbiolo-d-alba': (7.93, 44.75), 'roero': (8.04, 44.80), 'barbera-d-asti': (8.30, 45.00),
                 'moscato-d-asti': (8.22, 44.68), 'asti': (8.22, 44.68),
                 'barbaresco': (8.11, 44.72)},
    # Drawn in this order: the wide areas (Langhe, Barbera d'Asti, Asti, the Alba DOCs), then the smaller ones on top
    'areas': {
        'langhe': LANGHE,
        'barbera-d-asti': BARBERA_D_ASTI,
        'moscato-d-asti': ASTI,
        'asti': ASTI,
        # Barbera d'Alba DOC: 41 comuni wholly; Baldissero d'Alba, Bra, Cortemilia, Cherasco, La Morra, Monchiero, Montà,
        # Montaldo Roero, Monteu Roero, Narzole, Pocapaglia, Santo Stefano Roero and Sommariva Perno in part
        'barbera-d-alba': [
            'Alba', 'Albaretto della Torre', 'Barbaresco', 'Barolo', 'Borgomale', 'Canale', 'Castagnito',
            "Castellinaldo d'Alba", 'Castiglione Falletto', 'Castiglione Tinella', 'Castino', "Corneliano d'Alba",
            'Cossano Belbo', "Diano d'Alba", 'Govone', 'Grinzane Cavour', 'Guarene', 'Magliano Alfieri', 'Mango',
            "Monforte d'Alba", 'Montelupo Albese', "Monticello d'Alba", 'Neive', 'Neviglie', 'Novello', 'Perletto',
            "Piobesi d'Alba", 'Priocca', 'Rocchetta Belbo', 'Roddi', 'Roddino', 'Rodello', "Santa Vittoria d'Alba",
            'Santo Stefano Belbo', "Serralunga d'Alba", 'Sinio', 'Treiso', 'Trezzo Tinella', 'Verduno', "Vezza d'Alba",
            "Baldissero d'Alba", 'Bra', 'Cortemilia', 'Cherasco', 'La Morra', 'Monchiero', 'Montà', 'Montaldo Roero',
            'Monteu Roero', 'Narzole', 'Pocapaglia', 'Santo Stefano Roero', 'Sommariva Perno'],
        # Dolcetto d'Alba DOC: 24 comuni in Cuneo and Coazzolo (Asti) wholly; Barbaresco, Cherasco, Narzole, Neive,
        # Novello, La Morra, Roddi and Verduno south of the Tanaro, and parts of Roddino, Torre Bormida and Cortemilia
        'dolcetto-d-alba': [
            'Alba', 'Albaretto della Torre', 'Arguello', 'Barolo', 'Benevello', 'Borgomale', 'Bosia',
            'Castiglione Falletto', 'Castiglione Tinella', 'Castino', 'Cossano Belbo', 'Grinzane Cavour', 'Lequio Berria',
            'Mango', "Monforte d'Alba", 'Montelupo Albese', 'Neviglie', 'Rocchetta Belbo', 'Rodello', 'Santo Stefano Belbo',
            "Serralunga d'Alba", 'Sinio', 'Treiso', 'Trezzo Tinella', 'Coazzolo',
            'Barbaresco', 'Cherasco', 'Narzole', 'Neive', 'Novello', 'La Morra', 'Roddi', 'Verduno', 'Roddino',
            'Torre Bormida', 'Cortemilia'],
        # Nebbiolo d'Alba DOC: 9 comuni wholly, 23 in part (mostly the Roero and the comuni north of the Barolo zone)
        'nebbiolo-d-alba': [
            'Canale', "Castellinaldo d'Alba", "Corneliano d'Alba", "Monticello d'Alba", "Piobesi d'Alba", 'Priocca',
            "Santa Vittoria d'Alba", "Vezza d'Alba", 'Sinio', 'Govone',
            'Alba', 'Bra', "Baldissero d'Alba", 'Castagnito', "Diano d'Alba", 'Grinzane Cavour', 'Guarene', 'La Morra',
            'Magliano Alfieri', 'Monchiero', "Monforte d'Alba", 'Montà', 'Montaldo Roero', 'Montelupo Albese',
            'Monteu Roero', 'Novello', 'Pocapaglia', 'Roddi', 'Roddino', 'Santo Stefano Roero', 'Sommariva Perno',
            'Verduno'],
        # Roero DOCG: Canale, Corneliano d'Alba, Piobesi d'Alba and Vezza d'Alba wholly, 15 comuni in part
        'roero': [
            'Canale', "Corneliano d'Alba", "Piobesi d'Alba", "Vezza d'Alba",
            "Baldissero d'Alba", 'Castagnito', "Castellinaldo d'Alba", 'Govone', 'Guarene', 'Magliano Alfieri', 'Montà',
            'Montaldo Roero', 'Monteu Roero', "Monticello d'Alba", 'Pocapaglia', 'Priocca', "Santa Vittoria d'Alba",
            'Santo Stefano Roero', 'Sommariva Perno'],
        # Dogliani DOCG: 14 comuni wholly; Carrù, Mondovì, Murazzano, Roddino, San Michele Mondovì, Somano and Vicoforte
        # in part
        'dogliani': [
            'Bastia Mondovì', 'Belvedere Langhe', 'Briaglia', 'Castellino Tanaro', 'Cigliè', 'Clavesana', 'Dogliani',
            'Farigliano', 'Igliano', 'Marsaglia', 'Monchiero', 'Niella Tanaro', 'Piozzo', 'Rocca Cigliè',
            'Carrù', 'Mondovì', 'Murazzano', 'Roddino', 'San Michele Mondovì', 'Somano', 'Vicoforte'],
        # Nizza DOCG: 18 comuni around Nizza Monferrato
        'nizza': [
            'Agliano Terme', 'Belveglio', 'Calamandrana', 'Castel Boglione', 'Castelnuovo Belbo', 'Castelnuovo Calcea',
            'Castel Rocchero', 'Cortiglione', 'Incisa Scapaccino', 'Mombaruzzo', 'Mombercelli', 'Nizza Monferrato',
            'Vaglio Serra', 'Vinchio', 'Bruno', 'Rocchetta Palafea', 'Moasca', 'San Marzano Oliveto'],
        # Barolo DOCG: Barolo, Castiglione Falletto and Serralunga d'Alba wholly; Monforte d'Alba, La Morra, Verduno,
        # Grinzane Cavour, Diano d'Alba, Novello, Cherasco and Roddi in part
        'barolo': ['Barolo', 'Castiglione Falletto', "Serralunga d'Alba", "Monforte d'Alba", 'La Morra', 'Verduno',
                   'Grinzane Cavour', "Diano d'Alba", 'Novello', 'Cherasco', 'Roddi'],
        # Barbaresco DOCG: Barbaresco, Neive and Treiso, and San Rocco Seno d'Elvio, the part of Alba they border
        'barbaresco': ['Barbaresco', 'Neive', 'Treiso', ALBA_SE],
        # Gavi or Cortese di Gavi DOCG: the 11 comuni of its Allegato 1 (Novi Ligure and Serravalle Scrivia in part)
        'gavi': ['Bosio', 'Carrosio', "Capriata d'Orba", 'Francavilla Bisio', 'Gavi', 'Novi Ligure', 'Parodi Ligure',
                 'Pasturana', 'San Cristoforo', 'Serravalle Scrivia', 'Tassarolo'],
        # Gattinara DOCG: the comune of Gattinara (Vercelli). Ghemme DOCG: Ghemme and part of Romagnano Sesia (Novara)
        'gattinara': ['Gattinara'],
        'ghemme': ['Ghemme', 'Romagnano Sesia'],
    },
    'towns': [('Torino', 7.6869, 45.0703, 'big'), ('Alba', 8.0353, 44.7009, 'mid'), ('Asti', 8.2068, 44.9008, 'mid'),
              ('Novara', 8.6219, 45.4469, 'mid'), ('Bra', 7.8550, 44.6990, 'small'), ('Barolo', 7.9429, 44.6107, 'small'),
              ('Barbaresco', 8.0812, 44.7262, 'small'), ('Nizza Monferrato', 8.3570, 44.7746, 'small'),
              ('Canelli', 8.2928, 44.7213, 'small'), ('Dogliani', 7.9453, 44.5303, 'small'), ('Gavi', 8.8065, 44.6884, 'small'),
              ('Gattinara', 8.3700, 45.6170, 'small')],
}

# ---------- Rioja ----------
def municipios(provinces):
    """Spanish municipalities (municipios) of the given provinces (INE codes, e.g. '26'), IGN boundaries as published by
    es-atlas (TopoJSON, es/municipalities.json, saved as es-municipalities.json), by INE name ('Oyón-Oion',
    'Labastida/Bastida'). A name found in more than one of the provinces is only available with its code: 'Leza (01)'."""
    topo = load('es-municipalities.json')
    sx, sy = topo['transform']['scale']
    tx, ty = topo['transform']['translate']
    arcs = []
    for arc in topo['arcs']:  # delta-encoded, quantized positions → lon/lat
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        pts = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a if not pts else a[1:])
        return pts

    def poly(rings):
        # Simplification can leave a ring with fewer than four points (a sliver); it is left out
        rs = [ring(r) for r in rings]
        return Polygon(rs[0], [r for r in rs[1:] if len(r) >= 4]) if len(rs[0]) >= 4 else Polygon()

    out, seen = {}, {}
    for o in topo['objects']['municipalities']['geometries']:
        prov = str(o['id'])[:2]
        if prov not in provinces:
            continue
        g = poly(o['arcs']) if o['type'] == 'Polygon' else MultiPolygon([poly(p) for p in o['arcs']])
        name = o['properties']['name']
        out[f'{name} ({prov})'] = g.buffer(0)
        seen.setdefault(name, []).append(out[f'{name} ({prov})'])
    out.update({n: gs[0] for n, gs in seen.items() if len(gs) == 1})
    return out

EL_TERNERO = 'El Ternero (Miranda de Ebro)'

def rioja():
    """The municipios of La Rioja (26), Álava/Araba (01) and Navarra (31), plus the enclaves of Miranda de Ebro (Burgos,
    09) within La Rioja: El Ternero by Sajazarra and a small piece west of it (the parts of the municipio south of 42.64° N)."""
    out = municipios(('26', '01', '31', '09'))
    out[EL_TERNERO] = unary_union([g for g in out['Miranda de Ebro'].geoms if g.centroid.y < 42.64])
    return out

# The 144 municipios of the DOCa Rioja by sub-zone, as the Reglamento (Orden APA/3465/2004, Art. 4.2; BOE 27 Oct 2004)
# lists them: 118 in La Rioja, 18 in Álava and 8 in Navarra. Rioja Oriental is the Rioja Baja of the Reglamento (renamed
# 2018). With today's INE names: Albelda → Albelda de Iregua, Bergasilla → Bergasillas Bajera, Canillas → Canillas de Río
# Tuerto; Ocón (La Villa) and Molinos de Ocón are the municipio of Ocón; Santa Engracia del Jubera only in its north (drawn
# whole). In Álava, Barriobusto and Labraza are part of Oyón-Oion and Salinillas de Buradón of Labastida. Rioja Alta also
# takes in 'El Ternero', an enclave of Miranda de Ebro (Burgos), drawn with the municipio's enclaves within La Rioja.
RIOJA = {
    'id': 'rioja', 'name': 'Rioja',
    # The Ebro valley from the Conchas de Haro to Alfaro, with the Sierra de Cantabria in the north and the Cameros and
    # the Sierra de la Demanda foothills in the south
    'bounds': (-3.20, 41.88, -1.62, 42.72),
    # The Ebro and the lowest stretch of the Aragón; the Oja, Najerilla, Iregua, Cidacos and Alhama are not in Natural
    # Earth (10m). Natural Earth names the Aragón 'Alagón'.
    'rivers': ['Ebro', 'Aragón'],
    'river_parts': {'Aragón': ['Alagón']},
    'municipalities': rioja,
    # Rioja DOCa (and 'La Rioja') lights the whole map
    'whole': ['rioja', 'rioja-doca', 'la-rioja'],
    'sources': 'Natural Earth; IGN (es-atlas)',
    'titles': {'rioja-alta': 'Rioja Alta', 'rioja-alavesa': 'Rioja Alavesa', 'rioja-oriental': 'Rioja Oriental'},
    # Badges in the heart of the vineyards, not in the hills of the large southern municipios
    'label_at': {'rioja-alta': (-2.78, 42.47), 'rioja-alavesa': (-2.56, 42.57), 'rioja-oriental': (-2.02, 42.27)},
    'areas': {
        'rioja-alta': [
            'Ábalos', 'Alesanco', 'Alesón', 'Anguciana', 'Arenzana de Abajo', 'Arenzana de Arriba', 'Azofra', 'Badarán',
            'Bañares', 'Baños de Río Tobía', 'Baños de Rioja', 'Berceo', 'Bezares', 'Bobadilla', 'Briñas', 'Briones',
            'Camprovín', 'Canillas de Río Tuerto', 'Cañas', 'Cárdenas', 'Casalarreina', 'Castañares de Rioja', 'Cellorigo',
            'Cenicero', 'Cidamón', 'Cihuri', 'Cirueña', 'Cordovín', 'Cuzcurrita de Río Tirón', 'Daroca de Rioja', 'Entrena',
            'Estollo', 'Foncea', 'Fonzaleche', 'Fuenmayor', 'Galbárruli', 'Gimileo', 'Haro', 'Hervías', 'Herramélluri',
            'Hormilla', 'Hormilleja', 'Hornos de Moncalvillo', 'Huércanos', 'Lardero', 'Leiva', 'Logroño', 'Manjarrés',
            'Matute', 'Medrano', 'Nájera', 'Navarrete', 'Ochánduri', 'Ollauri', 'Rodezno', 'Sajazarra', 'San Asensio',
            'San Millán de Yécora', 'San Torcuato', 'San Vicente de la Sonsierra', 'Santa Coloma', 'Sojuela', 'Sorzano',
            'Sotés', 'Tirgo', 'Tormantos', 'Torrecilla sobre Alesanco', 'Torremontalbo', 'Treviana', 'Tricio', 'Uruñuela',
            'Ventosa', 'Villalba de Rioja', 'Villar de Torre', 'Villarejo', 'Zarratón', EL_TERNERO],
        'rioja-alavesa': [
            'Baños de Ebro/Mañueta', 'Kripan', 'Elciego', 'Elvillar/Bilar', 'Labastida/Bastida', 'Laguardia',
            'Lanciego/Lantziego', 'Lapuebla de Labarca', 'Leza', 'Moreda de Álava/Moreda Araba', 'Navaridas', 'Oyón-Oion',
            'Samaniego', 'Villabuena de Álava/Eskuernaga', 'Yécora/Iekora'],
        'rioja-oriental': [
            'Agoncillo', 'Aguilar del Río Alhama', 'Albelda de Iregua', 'Alberite', 'Alcanadre', 'Aldeanueva de Ebro', 'Alfaro',
            'Arnedillo', 'Arnedo', 'Arrúbal', 'Ausejo', 'Autol', 'Bergasa', 'Bergasillas Bajera', 'Calahorra',
            'Cervera del Río Alhama', 'Clavijo', 'Corera', 'Cornago', 'El Redal', 'El Villar de Arnedo', 'Galilea', 'Grávalos',
            'Herce', 'Igea', 'Lagunilla del Jubera', 'Leza de Río Leza', 'Murillo de Río Leza', 'Muro de Aguas', 'Nalda',
            'Ocón', 'Pradejón', 'Préjano', 'Quel', 'Ribafrecha', 'Rincón de Soto', 'Santa Engracia del Jubera',
            'Santa Eulalia Bajera', 'Tudelilla', 'Villamediana de Iregua', 'Villarroya',
            # Navarra
            'Andosilla', 'Aras', 'Azagra', 'Bargota', 'Mendavia', 'San Adrián', 'Sartaguda', 'Viana'],
    },
    'towns': [('Logroño', -2.4450, 42.4650, 'big'), ('Haro', -2.8475, 42.5775, 'mid'), ('Calahorra', -1.9650, 42.3050, 'mid'),
              ('Alfaro', -1.7500, 42.1800, 'mid'), ('Laguardia', -2.5847, 42.5536, 'small'), ('Cenicero', -2.6440, 42.4800, 'small'),
              ('Elciego', -2.6170, 42.5150, 'small'), ('Briones', -2.7850, 42.5440, 'small')],
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for r in (BORDEAUX, DOURO, BOURGOGNE, CHAMPAGNE, ROUSSILLON, RHONE, TOSCANA, PIEMONTE, RIOJA):
        build(r)
