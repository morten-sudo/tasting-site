#!/usr/bin/env python3
"""Town names per language on the overview maps (WIN-259).

public/maps/places.json is Natural Earth's populated places as [lon, lat, name, scalerank, capital], the bigger
first. The name is Natural Earth's English one (and sometimes the local one, e.g. "København"). This script adds an
optional sixth item to the towns whose name differs on Danish or Icelandic (or whose English name needs a fix):
{"da": "Wien", "is": "Vín"}; since WIN-313 also German, Spanish, French, Italian, Dutch and
Polish (MORE). Readers that know only five items keep working (the app reads the file from the live
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

# WIN-313: the names in German, Spanish, French, Italian, Dutch and Polish – only where they differ from the English
# name (a fix above, else Natural Earth's). Common exonyms as in each language's atlases and Wikipedia; a town whose
# name is in doubt is left English.
MORE: dict[str, dict[str, str]] = {
    'St.  Petersburg': {'de': 'Sankt Petersburg', 'es': 'San Petersburgo', 'fr': 'Saint-Pétersbourg', 'it': 'San Pietroburgo', 'nl': 'Sint-Petersburg', 'pl': 'Petersburg'},
    'København': {'de': 'Kopenhagen', 'es': 'Copenhague', 'fr': 'Copenhague', 'it': 'Copenaghen', 'nl': 'Kopenhagen', 'pl': 'Kopenhaga'},
    'Göteborg': {'de': 'Göteborg', 'es': 'Gotemburgo', 'fr': 'Göteborg', 'it': 'Göteborg', 'nl': 'Göteborg', 'pl': 'Göteborg'},
    'Antwerpen': {'de': 'Antwerpen', 'es': 'Amberes', 'fr': 'Anvers', 'it': 'Anversa', 'nl': 'Antwerpen', 'pl': 'Antwerpia'},
    'Nürnberg': {'de': 'Nürnberg', 'es': 'Núremberg', 'it': 'Norimberga', 'nl': 'Neurenberg', 'pl': 'Norymberga'},
    'Brugge': {'de': 'Brügge', 'es': 'Brujas', 'nl': 'Brugge', 'pl': 'Brugia'},
    'Pizen': {'de': 'Pilsen', 'es': 'Pilsen', 'nl': 'Pilsen', 'pl': 'Pilzno'},
    # Europe
    'London': {'es': 'Londres', 'fr': 'Londres', 'it': 'Londra', 'nl': 'Londen', 'pl': 'Londyn'},
    'Moscow': {'de': 'Moskau', 'es': 'Moscú', 'fr': 'Moscou', 'it': 'Mosca', 'nl': 'Moskou', 'pl': 'Moskwa'},
    'Rome': {'de': 'Rom', 'es': 'Roma', 'it': 'Roma', 'pl': 'Rzym'},
    'Paris': {'es': 'París', 'it': 'Parigi', 'nl': 'Parijs', 'pl': 'Paryż'},
    'Istanbul': {'es': 'Estambul', 'nl': 'Istanboel', 'pl': 'Stambuł'},
    'Kyiv': {'de': 'Kiew', 'es': 'Kiev', 'it': 'Kiev', 'pl': 'Kijów'},
    'Stockholm': {'es': 'Estocolmo', 'it': 'Stoccolma', 'pl': 'Sztokholm'},
    'Berlin': {'es': 'Berlín', 'it': 'Berlino', 'nl': 'Berlijn'},
    'Athens': {'de': 'Athen', 'es': 'Atenas', 'fr': 'Athènes', 'it': 'Atene', 'nl': 'Athene', 'pl': 'Ateny'},
    'Vienna': {'de': 'Wien', 'es': 'Viena', 'fr': 'Vienne', 'nl': 'Wenen', 'pl': 'Wiedeń'},
    'Geneva': {'de': 'Genf', 'es': 'Ginebra', 'fr': 'Genève', 'it': 'Ginevra', 'nl': 'Genève', 'pl': 'Genewa'},
    'Budapest': {'pl': 'Budapeszt'},
    'Bucharest': {'de': 'Bukarest', 'es': 'Bucarest', 'fr': 'Bucarest', 'it': 'Bucarest', 'nl': 'Boekarest', 'pl': 'Bukareszt'},
    'Lisbon': {'de': 'Lissabon', 'es': 'Lisboa', 'fr': 'Lisbonne', 'it': 'Lisbona', 'nl': 'Lissabon', 'pl': 'Lizbona'},
    'Warsaw': {'de': 'Warschau', 'es': 'Varsovia', 'fr': 'Varsovie', 'it': 'Varsavia', 'nl': 'Warschau', 'pl': 'Warszawa'},
    'Dublin': {'es': 'Dublín', 'it': 'Dublino'},
    'Prague': {'de': 'Prag', 'es': 'Praga', 'it': 'Praga', 'nl': 'Praag', 'pl': 'Praga'},
    'Brussels': {'de': 'Brüssel', 'es': 'Bruselas', 'fr': 'Bruxelles', 'it': 'Bruxelles', 'nl': 'Brussel', 'pl': 'Bruksela'},
    'Algiers': {'de': 'Algier', 'es': 'Argel', 'fr': 'Alger', 'it': 'Algeri', 'pl': 'Algier'},
    'Barcelona': {'fr': 'Barcelone', 'it': 'Barcellona'},
    'Naples': {'de': 'Neapel', 'es': 'Nápoles', 'it': 'Napoli', 'nl': 'Napels', 'pl': 'Neapol'},
    'Milan': {'de': 'Mailand', 'es': 'Milán', 'it': 'Milano', 'nl': 'Milaan', 'pl': 'Mediolan'},
    'Hamburg': {'es': 'Hamburgo', 'fr': 'Hambourg', 'it': 'Amburgo'},
    'Munich': {'de': 'München', 'es': 'Múnich', 'it': 'Monaco di Baviera', 'nl': 'München', 'pl': 'Monachium'},
    'Tunis': {'es': 'Túnez', 'it': 'Tunisi'},
    'Belgrade': {'de': 'Belgrad', 'es': 'Belgrado', 'it': 'Belgrado', 'nl': 'Belgrado', 'pl': 'Belgrad'},
    'Yerevan': {'de': 'Jerewan', 'es': 'Ereván', 'fr': 'Erevan', 'it': 'Erevan', 'nl': 'Jerevan', 'pl': 'Erywań'},
    'Sofia': {'es': 'Sofía'},
    'Seville': {'de': 'Sevilla', 'es': 'Sevilla', 'fr': 'Séville', 'it': 'Siviglia', 'nl': 'Sevilla', 'pl': 'Sewilla'},
    'Ljubljana': {'es': 'Liubliana', 'it': 'Lubiana', 'pl': 'Lublana'},
    'The Hague': {'de': 'Den Haag', 'es': 'La Haya', 'fr': 'La Haye', 'it': "L'Aia", 'nl': 'Den Haag', 'pl': 'Haga'},
    'Odessa': {'es': 'Odesa'},
    'Kraków': {'de': 'Krakau', 'es': 'Cracovia', 'fr': 'Cracovie', 'it': 'Cracovia', 'nl': 'Krakau'},
    'Florence': {'de': 'Florenz', 'es': 'Florencia', 'it': 'Firenze', 'pl': 'Florencja'},
    'Venice': {'de': 'Venedig', 'es': 'Venecia', 'fr': 'Venise', 'it': 'Venezia', 'nl': 'Venetië', 'pl': 'Wenecja'},
    'Turin': {'es': 'Turín', 'it': 'Torino', 'nl': 'Turijn', 'pl': 'Turyn'},
    'Genoa': {'de': 'Genua', 'es': 'Génova', 'fr': 'Gênes', 'it': 'Genova', 'nl': 'Genua', 'pl': 'Genua'},
    'Cologne': {'de': 'Köln', 'es': 'Colonia', 'it': 'Colonia', 'nl': 'Keulen', 'pl': 'Kolonia'},
    'Hanover': {'de': 'Hannover', 'es': 'Hannover', 'fr': 'Hanovre', 'it': 'Hannover', 'nl': 'Hannover', 'pl': 'Hanower'},
    'Luxembourg': {'de': 'Luxemburg', 'es': 'Luxemburgo', 'it': 'Lussemburgo', 'nl': 'Luxemburg', 'pl': 'Luksemburg'},
    'Edinburgh': {'es': 'Edimburgo', 'fr': 'Édimbourg', 'it': 'Edimburgo', 'pl': 'Edynburg'},
    'Rodos': {'de': 'Rhodos', 'es': 'Rodas', 'it': 'Rodi', 'nl': 'Rhodos', 'pl': 'Rodos'},
    'Kerkira': {'de': 'Korfu', 'es': 'Corfú', 'fr': 'Corfou', 'it': 'Corfù', 'nl': 'Korfoe', 'pl': 'Korfu'},
    # Further away
    'Cairo': {'de': 'Kairo', 'es': 'El Cairo', 'fr': 'Le Caire', 'it': 'Il Cairo', 'nl': 'Caïro', 'pl': 'Kair'},
    'Beijing': {'de': 'Peking', 'es': 'Pekín', 'fr': 'Pékin', 'it': 'Pechino', 'nl': 'Peking', 'pl': 'Pekin'},
    'Tokyo': {'de': 'Tokio', 'es': 'Tokio', 'nl': 'Tokio', 'pl': 'Tokio'},
    'Cape Town': {'de': 'Kapstadt', 'es': 'Ciudad del Cabo', 'fr': 'Le Cap', 'it': 'Città del Capo', 'nl': 'Kaapstad', 'pl': 'Kapsztad'},
    'Johannesburg': {'es': 'Johannesburgo'},
    'Mexico City': {'de': 'Mexiko-Stadt', 'es': 'Ciudad de México', 'fr': 'Mexico', 'it': 'Città del Messico', 'nl': 'Mexico-Stad', 'pl': 'Meksyk'},
    'New Delhi': {'de': 'Neu-Delhi', 'es': 'Nueva Delhi', 'it': 'Nuova Delhi', 'pl': 'Nowe Delhi'},
    'Tehran': {'de': 'Teheran', 'es': 'Teherán', 'fr': 'Téhéran', 'it': 'Teheran', 'nl': 'Teheran', 'pl': 'Teheran'},
    'Baghdad': {'de': 'Bagdad', 'es': 'Bagdad', 'fr': 'Bagdad', 'nl': 'Bagdad', 'pl': 'Bagdad'},
    'Damascus': {'de': 'Damaskus', 'es': 'Damasco', 'fr': 'Damas', 'it': 'Damasco', 'pl': 'Damaszek'},
    'Havana': {'de': 'Havanna', 'es': 'La Habana', 'fr': 'La Havane', 'it': "L'Avana", 'pl': 'Hawana'},
}

# Names Natural Earth has more than once: translate only the one meant (by its rough place)
ONLY_NEAR = {'Santiago': (-70.7, -33.4), 'Odessa': (30.7, 46.5), 'Florence': (11.3, 43.8), 'Naples': (14.3, 40.9), 'Athens': (23.7, 38.0)}


def main():
    for ne, more in MORE.items():
        english = NAMES.get(ne, {}).get('en', ne)
        same = [l for l, v in more.items() if v == english]
        if same:
            raise SystemExit(f'{ne}: same as the English name in {same} – leave it out')
    towns = json.loads(PLACES.read_text(encoding='utf-8'))
    seen = set()
    for t in towns:
        del t[5:]  # start from Natural Earth's five items each time
        names = {**NAMES.get(t[2], {}), **MORE.get(t[2], {})}
        if not names:
            continue
        near = ONLY_NEAR.get(t[2])
        if near and (abs(t[0] - near[0]) > 2 or abs(t[1] - near[1]) > 2):
            continue
        seen.add(t[2])
        t.append(names)
    missing = sorted((set(NAMES) | set(MORE)) - seen)
    if missing:
        raise SystemExit(f'not in places.json: {missing}')
    PLACES.write_text(json.dumps(towns, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{sum(len(t) > 5 for t in towns)} towns with names per language')


if __name__ == '__main__':
    main()
