#!/usr/bin/env python3
"""Builds the region maps (public/maps/<region>.json) from open geodata.

Sources (downloaded into a data folder given as the first argument):
- Natural Earth 10m land, coastline, rivers and country borders (public domain) – github.com/nvkelso/natural-earth-vector
- Gironde municipalities (IGN Admin Express, Licence ouverte) – github.com/gregoiredavid/france-geojson- Burgundy municipalities from the same repository: departements/{21-cote-d-or,71-saone-et-loire,89-yonne}/
  communes-<dep>-<name>.geojson, saved as communes-21.geojson, communes-71.geojson and communes-89.geojson
- Champagne municipalities from the same repository, departments 51, 10, 02, 52 and 77, saved as communes-<dep>.geojson,
  plus the Marne file as of commit cd65fc6 (2017, before Blancs-Coteaux) saved as communes-51-2017.geojson
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

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for r in (BORDEAUX, DOURO, BOURGOGNE, CHAMPAGNE):
        build(r)
