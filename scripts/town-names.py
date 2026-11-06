#!/usr/bin/env python3
"""Town names per language on the overview maps (WIN-259).

public/maps/places.json is Natural Earth's populated places as [lon, lat, name, scalerank, capital], the bigger
first. The name is Natural Earth's English one (and sometimes the local one, e.g. "København"). This script adds an
optional sixth item to the towns whose name differs on Danish or Icelandic (or whose English name needs a fix):
{"da": "Wien", "is": "Vín"}. Readers that know only five items keep working (the app reads the file from the live
site). A language that is missing falls back to the English name.

Run it again after changing the names below: python3 scripts/town-names.py
"""
import json
from pathlib import Path

PLACES = Path(__file__).resolve().parent.parent / 'public' / 'maps' / 'places.json'

# Natural Earth name -> names that differ from it, per language. Only names used in those languages today;
# a town that is called the same is left out (it falls back to the English name).
NAMES: dict[str, dict[str, str]] = {
    # Fixes to Natural Earth's English names (double spaces, local spellings, a stray mark)
    'Washington,  D.C.': {'en': 'Washington, D.C.', 'da': 'Washington, D.C.', 'is': 'Washington, D.C.'},
    'St.  Petersburg': {'en': 'St. Petersburg', 'da': 'Sankt Petersborg', 'is': 'Sankti Pétursborg'},
    'Granada‎': {'en': 'Granada', 'da': 'Granada', 'is': 'Granada'},
    'København': {'en': 'Copenhagen', 'is': 'Kaupmannahöfn'},
    'Göteborg': {'en': 'Gothenburg', 'is': 'Gautaborg'},
    'Århus': {'en': 'Aarhus', 'da': 'Aarhus', 'is': 'Árósar'},
    'Antwerpen': {'en': 'Antwerp'},
    'Nürnberg': {'en': 'Nuremberg'},
    'Brugge': {'en': 'Bruges'},
    'Pizen': {'en': 'Plzeň', 'da': 'Plzeň', 'is': 'Plzeň'},
    # Europe
    'London': {'is': 'Lundúnir'},
    'Moscow': {'da': 'Moskva', 'is': 'Moskva'},
    'Rome': {'da': 'Rom', 'is': 'Róm'},
    'Paris': {'is': 'París'},
    'Istanbul': {'is': 'Istanbúl'},
    'Kyiv': {'is': 'Kænugarður'},
    'Madrid': {'is': 'Madríd'},
    'Stockholm': {'is': 'Stokkhólmur'},
    'Berlin': {'is': 'Berlín'},
    'Athens': {'da': 'Athen', 'is': 'Aþena'},
    'Vienna': {'da': 'Wien', 'is': 'Vín'},
    'Geneva': {'da': 'Genève', 'is': 'Genf'},
    'Budapest': {'is': 'Búdapest'},
    'Bucharest': {'da': 'Bukarest', 'is': 'Búkarest'},
    'Lisbon': {'da': 'Lissabon', 'is': 'Lissabon'},
    'Oslo': {'is': 'Ósló'},
    'Warsaw': {'da': 'Warszawa', 'is': 'Varsjá'},
    'Dublin': {'is': 'Dyflinn'},
    'Prague': {'da': 'Prag', 'is': 'Prag'},
    'Brussels': {'da': 'Bruxelles', 'is': 'Brussel'},
    'Algiers': {'da': 'Algier', 'is': 'Algeirsborg'},
    'Barcelona': {'is': 'Barselóna'},
    'Naples': {'da': 'Napoli', 'is': 'Napólí'},
    'Milan': {'da': 'Milano', 'is': 'Mílanó'},
    'Hamburg': {'is': 'Hamborg'},
    'Munich': {'da': 'München', 'is': 'München'},
    'Tunis': {'is': 'Túnis'},
    'Belgrade': {'da': 'Beograd', 'is': 'Belgrad'},
    'Yerevan': {'da': 'Jerevan', 'is': 'Jerevan'},
    'Sofia': {'is': 'Sófía'},
    'Seville': {'da': 'Sevilla', 'is': 'Sevilla'},
    'Bergen': {'is': 'Björgvin'},
    'Trondheim': {'is': 'Þrándheimur'},
    'Ljubljana': {'is': 'Ljúblíana'},
    'The Hague': {'da': 'Haag', 'is': 'Haag'},
    'Odessa': {'da': 'Odesa', 'is': 'Ódessa'},
    'Kraków': {'is': 'Kraká'},
    'Florence': {'da': 'Firenze', 'is': 'Flórens'},
    'Venice': {'da': 'Venedig', 'is': 'Feneyjar'},
    'Turin': {'da': 'Torino', 'is': 'Tórínó'},
    'Genoa': {'da': 'Genova', 'is': 'Genúa'},
    'Cologne': {'da': 'Köln', 'is': 'Köln'},
    'Hanover': {'da': 'Hannover', 'is': 'Hannover'},
    'Luxembourg': {'is': 'Lúxemborg'},
    'Tórshavn': {'is': 'Þórshöfn'},
    'Edinburgh': {'is': 'Edinborg'},
    'Malmö': {'is': 'Málmey'},
    'Helsingborg': {'is': 'Helsingjaborg'},
    'Uppsala': {'is': 'Uppsalir'},
    'Odense': {'is': 'Óðinsvé'},
    'Aalborg': {'is': 'Álaborg'},
    'Rodos': {'en': 'Rhodes', 'da': 'Rhodos', 'is': 'Ródos'},
    'Kerkira': {'en': 'Corfu', 'da': 'Korfu', 'is': 'Korfú'},
    # Further away
    'Cairo': {'da': 'Kairo', 'is': 'Kaíró'},
    'Beijing': {'is': 'Peking'},
    'Tokyo': {'is': 'Tókýó'},
    'Cape Town': {'da': 'Kapstaden', 'is': 'Höfðaborg'},
    'Johannesburg': {'is': 'Jóhannesarborg'},
    'Mexico City': {'is': 'Mexíkóborg'},
    'New Delhi': {'is': 'Nýja-Delí'},
    'Tehran': {'da': 'Teheran', 'is': 'Teheran'},
    'Baghdad': {'da': 'Bagdad', 'is': 'Bagdad'},
    'Damascus': {'da': 'Damaskus', 'is': 'Damaskus'},
    'Havana': {'da': 'Havanna', 'is': 'Havana'},
    'Bogota': {'en': 'Bogotá', 'da': 'Bogotá', 'is': 'Bógóta'},
    'Santiago': {'is': 'Santíagó'},
    'Rio de Janeiro': {'is': 'Ríó de Janeiró'},
}

# Names Natural Earth has more than once: translate only the one meant (by its rough place)
ONLY_NEAR = {'Santiago': (-70.7, -33.4), 'Odessa': (30.7, 46.5), 'Florence': (11.3, 43.8), 'Naples': (14.3, 40.9), 'Athens': (23.7, 38.0)}


def main():
    towns = json.loads(PLACES.read_text(encoding='utf-8'))
    seen = set()
    for t in towns:
        del t[5:]  # start from Natural Earth's five items each time
        names = NAMES.get(t[2])
        if not names:
            continue
        near = ONLY_NEAR.get(t[2])
        if near and (abs(t[0] - near[0]) > 2 or abs(t[1] - near[1]) > 2):
            continue
        seen.add(t[2])
        t.append(names)
    missing = sorted(set(NAMES) - seen)
    if missing:
        raise SystemExit(f'not in places.json: {missing}')
    PLACES.write_text(json.dumps(towns, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{sum(len(t) > 5 for t in towns)} towns with names per language')


if __name__ == '__main__':
    main()
