#!/usr/bin/env python3
"""LWIN (Liv-ex Wine Identification Number, CC BY) → compact data files for the "Search wine" list.

Reads the LWIN database as downloaded from liv-ex.com (xlsx) and writes public/lwin/part-NN.json:
live wines and fortified wines only, each mapped to our country codes, regions and appellations
(supabase/migrations) and to our wine types. The superadmin page "LWIN" loads the files into the
database. Run it again with a newer file to update.

    python3 scripts/lwin.py LWINdatabase.xlsx
"""
import json, os, re, sys, unicodedata
import importlib.util

import openpyxl

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'public', 'lwin')
PER_FILE = 20000

COUNTRY = {
    'France': 'FR', 'United States': 'US', 'Italy': 'IT', 'Australia': 'AU', 'Spain': 'ES', 'Germany': 'DE',
    'South Africa': 'ZA', 'Portugal': 'PT', 'Argentina': 'AR', 'New Zealand': 'NZ', 'Austria': 'AT', 'Chile': 'CL',
    'Canada': 'CA', 'Switzerland': 'CH', 'United Kingdom': 'GB', 'Luxembourg': 'LU', 'Mexico': 'MX', 'Greece': 'GR',
    'Hungary': 'HU', 'Slovenia': 'SI', 'Lebanon': 'LB', 'Israel': 'IL', 'Georgia': 'GE', 'Moldova': 'MD',
    'Croatia': 'HR', 'China': 'CN', 'Japan': 'JP', 'Denmark': 'DK', 'Bulgaria': 'BG', 'Ukraine': 'UA',
    'Uruguay': 'UY', 'Romania': 'RO', 'Morocco': 'MA', 'Slovakia': 'SK', 'Brazil': 'BR', 'Armenia': 'AM',
    'Netherlands': 'NL', 'North Macedonia': 'MK', 'Belgium': 'BE', 'Czech Republic': 'CZ', 'Cyprus': 'CY',
    'Turkey': 'TR', 'Serbia': 'RS', 'Thailand': 'TH', 'Peru': 'PE', 'Bosnia and Herzegovina': 'BA', 'Malta': 'MT',
    'India': 'IN', 'Sweden': 'SE', 'Poland': 'PL', 'Syria': 'SY', 'Hong Kong': 'HK', 'Tunisia': 'TN',
    'Russian Federation': 'RU', 'Bhutan': 'BT', 'Montenegro': 'ME', 'Indonesia': 'ID', 'Ecuador': 'EC', 'Albania': 'AL',
}
# LWIN writes without accents; the common words get theirs back
ACCENTS = {'Chateau': 'Château', 'Cote': 'Côte', 'Cotes': 'Côtes', 'Premiere': 'Première', 'Premieres': 'Premières',
           'Domaine': 'Domaine', 'Cremant': 'Crémant', 'Cuvee': 'Cuvée', 'Rose': 'Rosé', 'Reserve': 'Réserve',
           'Eleve': 'Élevé', 'Vieilles': 'Vieilles', 'Superieur': 'Supérieur', 'Classe': 'Classé', '1er': '1er',
           '2eme': '2ème', '3eme': '3ème', '4eme': '4ème', '5eme': '5ème', 'Medoc': 'Médoc', 'Emilion': 'Émilion',
           'Pessac-Leognan': 'Pessac-Léognan', 'Quinta': 'Quinta', 'Marques': 'Marqués', 'Vina': 'Viña'}


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    s = ' ' + re.sub(r'[^a-z0-9]+', ' ', s).strip() + ' '
    return re.sub(r'\s+', ' ', s.replace(' st ', ' saint ').replace(' ste ', ' sainte ')).strip()


def accents(s):
    return re.sub(r"[A-Za-z0-9][\w-]*", lambda m: ACCENTS.get(m.group(0), m.group(0)), s) if s else s


def na(v):
    v = '' if v is None else str(v).strip()
    return None if v in ('', 'NA') else v


def appellations():
    """Our appellations (id, name, region, country, aliases) from the migrations."""
    out = {}
    for f in ('20261031_wine_origin.sql', '20261101_wine_geography.sql'):
        sql = open(os.path.join(ROOT, 'supabase', 'migrations', f)).read()
        for m in re.finditer(r"^\s*\('([^']+)', '((?:[^']|'')+)', '((?:[^']|'')*)', '([A-Z]{2})', (?:(?:'[^']*'|null), )?(array\[[^\]]*\]::text\[\]|'\{[^}]*\}'(?:::text\[\])?)", sql, re.M):
            aid, name, region, country, al = m.groups()
            aliases = re.findall(r"'((?:[^']|'')+)'", al) if al.startswith('array') else [a for a in al.strip("'{}").split(',') if a]
            out[aid] = {'name': name.replace("''", "'"), 'region': region.replace("''", "'"), 'country': country,
                        'aliases': [a.replace("''", "'") for a in aliases]}
    for a in out.values():
        if a['country'] == 'US' and a['region'] == 'Napa Valley':
            a['region'] = 'California'
    return out


def regions():
    spec = importlib.util.spec_from_file_location('geo', os.path.join(os.path.dirname(__file__), 'wine-geography.py'))
    geo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(geo)
    return geo.REGIONS


def style(colour, typ, sub):
    if typ == 'Fortified Wine':
        return 'Fortified'
    if sub == 'Sparkling':
        return 'Sparkling'
    return {'Red': 'Red', 'White': 'WhiteWine', 'Rose': 'Rose'}.get(colour)


def main(path):
    apps = appellations()
    by_name = {}
    for aid, a in apps.items():
        for n in [a['name'], *a['aliases']]:
            by_name.setdefault((a['country'], norm(n)), aid)
    reg_names = {}
    for c, rs in regions().items():
        for (name, _lat, _lon, aliases) in rs:
            for n in [name, *aliases]:
                reg_names[(c, norm(n))] = name
    # LWIN's names for regions that are written differently
    extra = {('FR', 'sud ouest'): 'Sud-Ouest', ('PT', 'porto'): 'Douro', ('PT', 'alentejano'): 'Alentejo',
             ('IT', 'trentino alto adige'): 'Trentino-Alto Adige', ('IT', 'friuli venezia giulia'): 'Friuli-Venezia Giulia',
             ('IT', 'prosecco'): 'Veneto', ('ES', 'castilla la mancha'): 'Castilla-La Mancha', ('ES', 'valencia'): 'Levante',
             ('AT', 'niederosterreich'): 'Niederösterreich', ('FR', 'pays d oc'): 'Languedoc', ('CL', 'central valley'): 'Valle Central'}
    reg_names.update(extra)

    wb = openpyxl.load_workbook(path, read_only=True)
    rows = wb.active.iter_rows(values_only=True)
    head = next(rows)
    out, stats = [], {'wines': 0, 'appellation': 0, 'region': 0}
    for r in rows:
        d = dict(zip(head, r))
        if d['STATUS'] != 'Live' or d['TYPE'] not in ('Wine', 'Fortified Wine'):
            continue
        country = COUNTRY.get(d['COUNTRY'])
        producer = accents(' '.join(x for x in (na(d['PRODUCER_TITLE']), na(d['PRODUCER_NAME'])) if x))
        wine = accents(na(d['WINE']))
        if not producer and not wine:
            continue
        # Our appellation: the most specific LWIN place we know
        aid = None
        for place in (na(d['SITE']), na(d['SUB_REGION']), na(d['REGION'])):
            if place and country and (country, norm(place)) in by_name:
                aid = by_name[(country, norm(place))]
                break
        region = apps[aid]['region'] if aid else reg_names.get((country, norm(na(d['REGION']))))
        appellation = apps[aid]['name'] if aid else accents(na(d['SUB_REGION']))
        stats['wines'] += 1
        stats['appellation'] += bool(aid)
        stats['region'] += bool(region)
        out.append([
            int(d['LWIN']), accents(na(d['DISPLAY_NAME'])), producer, wine, country, region, appellation, aid,
            style(d['COLOUR'], d['TYPE'], d['SUB_TYPE']), accents(na(d['CLASSIFICATION'])),
        ])
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith('part-'):
            os.remove(os.path.join(OUT, f))
    parts = [out[i:i + PER_FILE] for i in range(0, len(out), PER_FILE)]
    for i, chunk in enumerate(parts, 1):
        with open(os.path.join(OUT, f'part-{i:02d}.json'), 'w') as fh:
            json.dump(chunk, fh, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump({'parts': len(parts), 'wines': len(out), 'columns': ['lwin', 'display_name', 'producer', 'wine', 'country', 'region', 'appellation', 'appellation_id', 'style', 'classification'],
                   'source': 'LWIN – Liv-ex Wine Identification Number, liv-ex.com, CC BY'}, fh)
    print(stats, len(parts), 'files')


if __name__ == '__main__':
    main(sys.argv[1])
