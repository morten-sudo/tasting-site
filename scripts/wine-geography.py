#!/usr/bin/env python3
"""The wine world as Country → Region → Appellation (with an optional subregion on each appellation).

Writes supabase/migrations/20261101_wine_geography.sql: the wine_regions table with the regions of
each country (centre for the maps), the subregion column on appellations, the new appellations and
the subregions of the ones that were already there. Coordinates are the main village or town of the
appellation; check them with --check (needs the Natural Earth countries in a folder given by GEO).

    python3 scripts/wine-geography.py [--check]
"""
import json, os, re, sys, unicodedata

# Regions: country → [(name, lat, lon, aliases)]
REGIONS = {
    'FR': [('Alsace', 48.2, 7.35, []), ('Beaujolais', 46.1, 4.65, []), ('Bordeaux', 44.85, -0.45, []),
           ('Bourgogne', 47.05, 4.85, ['Burgundy']), ('Champagne', 49.05, 4.0, []), ('Corse', 42.15, 9.1, ['Corsica']),
           ('Jura', 46.75, 5.75, []), ('Languedoc', 43.5, 3.3, ['Languedoc-Roussillon']), ('Loire', 47.3, 0.5, ['Val de Loire', 'Loire Valley']),
           ('Provence', 43.45, 6.2, []), ('Rhône', 44.5, 4.8, ['Rhone', 'Vallée du Rhône', 'Rhône Valley']),
           ('Roussillon', 42.65, 2.75, []), ('Savoie', 45.55, 6.0, []), ('Sud-Ouest', 44.0, 0.8, ['South West France'])],
    'IT': [('Abruzzo', 42.3, 14.0, []), ('Basilicata', 40.9, 15.7, []), ('Campania', 41.0, 14.8, []),
           ('Emilia-Romagna', 44.6, 11.0, []), ('Friuli-Venezia Giulia', 46.0, 13.3, ['Friuli']), ('Lazio', 41.9, 12.6, []),
           ('Lombardia', 45.6, 9.9, ['Lombardy']), ('Marche', 43.4, 13.2, []), ('Piemonte', 44.7, 8.0, ['Piedmont']),
           ('Puglia', 40.9, 16.8, ['Apulia']), ('Sardegna', 40.0, 9.0, ['Sardinia']), ('Sicilia', 37.5, 14.0, ['Sicily']),
           ('Toscana', 43.4, 11.2, ['Tuscany']), ('Trentino-Alto Adige', 46.4, 11.2, ['Südtirol', 'Trentino']),
           ('Umbria', 42.95, 12.5, []), ('Veneto', 45.5, 11.5, [])],
    'ES': [('Andalucía', 36.9, -5.5, ['Andalusia']), ('Aragón', 41.6, -1.2, []), ('Castilla y León', 41.6, -4.5, []),
           ('Castilla-La Mancha', 39.3, -3.0, []), ('Cataluña', 41.6, 1.3, ['Catalunya', 'Catalonia']),
           ('Galicia', 42.4, -8.2, []), ('Islas Baleares', 39.6, 2.9, ['Mallorca']), ('Islas Canarias', 28.3, -16.5, ['Canary Islands']),
           ('Levante', 38.8, -1.0, ['Valencia', 'Murcia']), ('Navarra', 42.6, -1.7, []), ('País Vasco', 43.2, -2.5, ['Basque Country']),
           ('Rioja', 42.45, -2.45, ['La Rioja'])],
    'DE': [('Ahr', 50.53, 7.0, []), ('Baden', 48.3, 7.8, []), ('Franken', 49.8, 10.0, ['Franconia']),
           ('Hessische Bergstraße', 49.7, 8.6, []), ('Mittelrhein', 50.2, 7.65, []), ('Mosel', 49.9, 7.0, ['Mosel-Saar-Ruwer']),
           ('Nahe', 49.8, 7.75, []), ('Pfalz', 49.35, 8.15, ['Palatinate']), ('Rheingau', 50.0, 8.0, []),
           ('Rheinhessen', 49.85, 8.15, []), ('Saale-Unstrut', 51.2, 11.8, []), ('Sachsen', 51.1, 13.6, ['Saxony']),
           ('Württemberg', 49.0, 9.2, [])],
    'PT': [('Açores', 38.46, -28.35, ['Azores']), ('Alentejo', 38.5, -7.8, []), ('Algarve', 37.15, -8.3, []),
           ('Bairrada', 40.45, -8.45, []), ('Beira Interior', 40.5, -7.2, []), ('Dão', 40.55, -7.9, ['Dao']),
           ('Douro', 41.15, -7.6, ['Douro Valley']), ('Lisboa', 39.1, -9.2, ['Lisbon']), ('Madeira', 32.7, -16.95, []),
           ('Península de Setúbal', 38.55, -8.9, ['Setúbal']), ('Tejo', 39.3, -8.6, []),
           ('Trás-os-Montes', 41.7, -7.2, []), ('Vinho Verde', 41.7, -8.4, ['Minho'])],
    'AT': [('Burgenland', 47.7, 16.7, []), ('Niederösterreich', 48.3, 15.6, ['Lower Austria']),
           ('Steiermark', 46.8, 15.5, ['Styria']), ('Wien', 48.25, 16.37, ['Vienna'])],
    'US': [('California', 37.5, -120.5, ['Californien']), ('New York', 42.6, -76.9, []),
           ('Oregon', 44.8, -123.0, []), ('Washington', 46.3, -119.5, ['Washington State'])],
    'AU': [('New South Wales', -33.0, 149.5, []), ('Queensland', -28.7, 151.9, []), ('South Australia', -34.8, 138.8, []),
           ('Tasmania', -41.9, 147.0, []), ('Victoria', -37.5, 145.0, []), ('Western Australia', -33.9, 115.2, [])],
    'ZA': [('Breede River Valley', -33.8, 19.9, []), ('Cape South Coast', -34.3, 19.3, []),
           ('Coastal Region', -33.7, 18.8, ['Western Cape']), ('Klein Karoo', -33.6, 21.5, []), ('Olifants River', -31.8, 18.6, [])],
    'CL': [('Aconcagua', -33.0, -71.2, []), ('Coquimbo', -30.5, -71.2, []), ('Sur', -37.0, -72.5, ['Southern Region']),
           ('Valle Central', -34.5, -71.2, ['Central Valley'])],
    'AR': [('Mendoza', -33.0, -68.8, []), ('Patagonia', -39.0, -68.0, []), ('Salta', -26.0, -65.9, []), ('San Juan', -31.5, -68.5, [])],
    'NZ': [('Auckland', -36.85, 174.5, []), ('Canterbury', -43.2, 172.6, []), ('Central Otago', -45.0, 169.2, []),
           ('Gisborne', -38.65, 178.0, []), ("Hawke's Bay", -39.6, 176.8, []), ('Marlborough', -41.5, 173.8, []),
           ('Nelson', -41.3, 173.0, []), ('Wairarapa', -41.2, 175.5, ['Martinborough'])],
}

# Appellations to add: (country, region) → [(name, lat, lon, subregion, aliases)]
NEW = {
    ('FR', 'Alsace'): [('Alsace', 48.2, 7.35, None, ['Alsace AOC', "Vin d'Alsace"]), ('Alsace Grand Cru', 48.15, 7.3, None, []),
                       ('Crémant d’Alsace', 48.2, 7.35, None, ["Cremant d'Alsace", "Crémant d'Alsace"])],
    ('FR', 'Beaujolais'): [('Beaujolais', 46.0, 4.6, None, ['Beaujolais Nouveau']), ('Beaujolais-Villages', 46.15, 4.65, None, []),
                           ('Brouilly', 46.11, 4.68, 'Crus du Beaujolais', []), ('Chénas', 46.22, 4.72, 'Crus du Beaujolais', []),
                           ('Chiroubles', 46.18, 4.66, 'Crus du Beaujolais', []), ('Côte de Brouilly', 46.10, 4.67, 'Crus du Beaujolais', []),
                           ('Fleurie', 46.19, 4.70, 'Crus du Beaujolais', []), ('Juliénas', 46.24, 4.71, 'Crus du Beaujolais', []),
                           ('Morgon', 46.16, 4.69, 'Crus du Beaujolais', []), ('Moulin-à-Vent', 46.21, 4.73, 'Crus du Beaujolais', []),
                           ('Régnié', 46.14, 4.64, 'Crus du Beaujolais', []), ('Saint-Amour', 46.26, 4.70, 'Crus du Beaujolais', [])],
    ('FR', 'Bourgogne'): [('Auxey-Duresses', 46.98, 4.74, 'Côte de Beaune', []), ('Marsannay', 47.27, 5.0, 'Côte de Nuits', []),
                          ('Fixin', 47.24, 4.97, 'Côte de Nuits', []), ('Monthélie', 46.99, 4.76, 'Côte de Beaune', []),
                          ('Montagny', 46.71, 4.73, 'Côte Chalonnaise', []), ('Pernand-Vergelesses', 47.08, 4.85, 'Côte de Beaune', []),
                          ('Saint-Aubin', 46.95, 4.70, 'Côte de Beaune', []), ('Saint-Romain', 46.99, 4.70, 'Côte de Beaune', []),
                          ('Savigny-lès-Beaune', 47.06, 4.82, 'Côte de Beaune', []), ('Viré-Clessé', 46.42, 4.86, 'Mâconnais', []),
                          ('Chorey-lès-Beaune', 47.04, 4.87, 'Côte de Beaune', []), ('Crémant de Bourgogne', 47.0, 4.8, None, []),
                          ('Bouzeron', 46.88, 4.72, 'Côte Chalonnaise', [])],
    ('FR', 'Champagne'): [('Rosé des Riceys', 47.99, 4.37, 'Côte des Bar', [])],
    ('FR', 'Jura'): [('Arbois', 46.90, 5.77, None, ['Arbois Pupillin']), ('Château-Chalon', 46.75, 5.62, None, []),
                     ('Côtes du Jura', 46.67, 5.55, None, []), ("L'Étoile", 46.72, 5.53, None, []),
                     ('Crémant du Jura', 46.75, 5.6, None, []), ('Macvin du Jura', 46.75, 5.6, None, [])],
    ('FR', 'Languedoc'): [('Languedoc', 43.5, 3.3, None, ['Coteaux du Languedoc']), ('Cabardès', 43.33, 2.25, None, []),
                          ('Corbières', 43.05, 2.75, None, []), ('Faugères', 43.57, 3.18, None, []), ('Fitou', 42.89, 2.98, None, []),
                          ('La Clape', 43.17, 3.10, None, []), ('Limoux', 43.05, 2.22, None, ['Blanquette de Limoux', 'Crémant de Limoux']),
                          ('Minervois', 43.3, 2.7, None, ['Minervois-La Livinière']), ('Pic Saint-Loup', 43.78, 3.82, None, []),
                          ('Picpoul de Pinet', 43.40, 3.52, None, []), ('Saint-Chinian', 43.42, 2.95, None, []),
                          ('Terrasses du Larzac', 43.75, 3.45, None, []), ("Pays d'Oc", 43.5, 3.3, None, ["IGP Pays d'Oc", "Vin de Pays d'Oc"])],
    ('FR', 'Loire'): [('Anjou', 47.35, -0.55, 'Anjou-Saumur', []), ('Bonnezeaux', 47.27, -0.45, 'Anjou-Saumur', []),
                      ('Bourgueil', 47.28, 0.17, 'Touraine', []), ('Cheverny', 47.50, 1.46, 'Touraine', []),
                      ('Chinon', 47.17, 0.24, 'Touraine', []), ('Coteaux du Layon', 47.25, -0.60, 'Anjou-Saumur', []),
                      ('Crémant de Loire', 47.3, -0.1, None, []), ('Menetou-Salon', 47.23, 2.48, 'Centre-Loire', []),
                      ('Montlouis-sur-Loire', 47.39, 0.83, 'Touraine', ['Montlouis']),
                      ('Muscadet Sèvre et Maine', 47.15, -1.40, 'Pays Nantais', ['Muscadet', 'Muscadet Sèvre-et-Maine']),
                      ('Pouilly-Fumé', 47.29, 2.95, 'Centre-Loire', ['Blanc Fumé de Pouilly']), ('Quarts de Chaume', 47.30, -0.63, 'Anjou-Saumur', []),
                      ('Quincy', 47.13, 2.16, 'Centre-Loire', []), ('Reuilly', 47.08, 2.04, 'Centre-Loire', []),
                      ('Saint-Nicolas-de-Bourgueil', 47.29, 0.12, 'Touraine', []), ('Sancerre', 47.33, 2.84, 'Centre-Loire', []),
                      ('Saumur', 47.26, -0.08, 'Anjou-Saumur', []), ('Saumur-Champigny', 47.24, -0.02, 'Anjou-Saumur', []),
                      ('Savennières', 47.38, -0.66, 'Anjou-Saumur', []), ('Touraine', 47.3, 1.0, 'Touraine', []),
                      ('Vouvray', 47.41, 0.80, 'Touraine', [])],
    ('FR', 'Provence'): [('Bandol', 43.14, 5.75, None, []), ('Bellet', 43.73, 7.20, None, []), ('Cassis', 43.22, 5.54, None, []),
                         ("Coteaux d'Aix-en-Provence", 43.55, 5.35, None, []), ('Coteaux Varois en Provence', 43.40, 6.0, None, ['Coteaux Varois']),
                         ('Côtes de Provence', 43.40, 6.30, None, []), ('Palette', 43.50, 5.50, None, [])],
    ('FR', 'Rhône'): [('Beaumes-de-Venise', 44.12, 5.03, 'Rhône Sud', ['Muscat de Beaumes-de-Venise']),
                      ('Cairanne', 44.23, 4.93, 'Rhône Sud', []), ('Château-Grillet', 45.33, 4.79, 'Rhône Nord', []),
                      ('Clairette de Die', 44.75, 5.37, None, []), ('Costières de Nîmes', 43.75, 4.40, 'Rhône Sud', []),
                      ('Grignan-les-Adhémar', 44.42, 4.90, 'Rhône Sud', []), ('Luberon', 43.80, 5.35, 'Rhône Sud', []),
                      ('Saint-Péray', 44.95, 4.85, 'Rhône Nord', []), ('Ventoux', 44.10, 5.15, 'Rhône Sud', []),
                      ('Vinsobres', 44.33, 5.06, 'Rhône Sud', [])],
    ('FR', 'Savoie'): [('Savoie', 45.55, 5.95, None, ['Vin de Savoie']), ('Roussette de Savoie', 45.6, 5.9, None, []),
                       ('Crémant de Savoie', 45.55, 5.95, None, [])],
    ('FR', 'Sud-Ouest'): [('Bergerac', 44.85, 0.48, None, []), ('Buzet', 44.25, 0.30, None, []), ('Cahors', 44.45, 1.44, None, []),
                          ('Côtes de Gascogne', 43.7, 0.2, None, ['IGP Côtes de Gascogne']), ('Fronton', 43.84, 1.39, None, []),
                          ('Gaillac', 43.90, 1.90, None, []), ('Irouléguy', 43.18, -1.32, None, []), ('Jurançon', 43.28, -0.39, None, []),
                          ('Madiran', 43.55, -0.06, None, []), ('Marcillac', 44.48, 2.46, None, []), ('Monbazillac', 44.80, 0.49, None, []),
                          ('Pacherenc du Vic-Bilh', 43.55, -0.06, None, []), ('Pécharmant', 44.87, 0.53, None, []),
                          ('Saint-Mont', 43.65, 0.15, None, [])],
    ('FR', 'Corse'): [('Ajaccio', 41.93, 8.74, None, []), ('Muscat du Cap Corse', 42.9, 9.4, None, []),
                      ('Patrimonio', 42.70, 9.36, None, []), ('Vin de Corse', 42.15, 9.1, None, ['Corse'])],
    ('FR', 'Roussillon'): [],
    ('IT', 'Piemonte'): [('Alta Langa', 44.6, 8.1, 'Langhe', []), ('Asti', 44.90, 8.21, 'Monferrato', ['Asti Spumante DOCG']),
                         ('Barbera del Monferrato', 45.0, 8.4, 'Monferrato', []), ('Gattinara', 45.62, 8.37, 'Alto Piemonte', []),
                         ('Ghemme', 45.60, 8.42, 'Alto Piemonte', []), ('Ruchè di Castagnole Monferrato', 44.98, 8.30, 'Monferrato', [])],
    ('IT', 'Toscana'): [('Montecucco', 42.88, 11.43, 'Maremma', []), ('Vin Santo del Chianti', 43.55, 11.3, 'Chianti', [])],
    ('IT', 'Veneto'): [('Amarone della Valpolicella', 45.55, 10.90, 'Valpolicella', ['Amarone']), ('Bardolino', 45.55, 10.72, None, []),
                       ('Bianco di Custoza', 45.38, 10.80, None, ['Custoza']),
                       ('Conegliano Valdobbiadene Prosecco Superiore', 45.90, 12.10, None, ['Prosecco Superiore', 'Valdobbiadene']),
                       ('Lugana', 45.45, 10.60, None, []), ('Prosecco', 45.85, 12.2, None, ['Prosecco DOC']),
                       ('Recioto della Valpolicella', 45.55, 10.90, 'Valpolicella', []), ('Soave', 45.42, 11.25, None, ['Soave Classico']),
                       ('Valpolicella', 45.55, 10.90, 'Valpolicella', ['Valpolicella Classico']),
                       ('Valpolicella Ripasso', 45.55, 10.90, 'Valpolicella', ['Ripasso'])],
    ('IT', 'Friuli-Venezia Giulia'): [('Collio', 45.95, 13.55, None, ['Collio Goriziano']), ('Friuli Colli Orientali', 46.1, 13.4, None, ['Colli Orientali del Friuli']),
                                      ('Friuli Grave', 45.95, 12.85, None, ['Grave del Friuli']), ('Friuli Isonzo', 45.85, 13.45, None, ['Isonzo'])],
    ('IT', 'Trentino-Alto Adige'): [('Alto Adige', 46.5, 11.35, None, ['Südtirol', 'Südtiroler']), ('Teroldego Rotaliano', 46.20, 11.10, None, []),
                                    ('Trentino', 46.07, 11.12, None, []), ('Trento', 46.07, 11.12, None, ['Trentodoc', 'Trento DOC'])],
    ('IT', 'Lombardia'): [('Franciacorta', 45.60, 10.0, None, []), ('Oltrepò Pavese', 44.95, 9.2, None, []),
                          ('Sforzato di Valtellina', 46.17, 9.87, 'Valtellina', ['Sfursat']),
                          ('Valtellina Superiore', 46.17, 9.87, 'Valtellina', ['Valtellina'])],
    ('IT', 'Emilia-Romagna'): [('Colli Piacentini', 44.9, 9.6, None, []), ('Lambrusco di Sorbara', 44.76, 11.0, None, []),
                               ('Lambrusco Grasparossa di Castelvetro', 44.50, 10.95, None, []), ('Romagna Sangiovese', 44.2, 12.0, None, ['Sangiovese di Romagna'])],
    ('IT', 'Marche'): [('Rosso Conero', 43.55, 13.55, None, ['Conero']), ('Verdicchio dei Castelli di Jesi', 43.52, 13.24, None, []),
                       ('Verdicchio di Matelica', 43.25, 13.0, None, [])],
    ('IT', 'Abruzzo'): [("Cerasuolo d'Abruzzo", 42.35, 14.0, None, []), ("Montepulciano d'Abruzzo", 42.35, 14.0, None, []),
                        ("Trebbiano d'Abruzzo", 42.35, 14.0, None, [])],
    ('IT', 'Campania'): [('Falanghina del Sannio', 41.2, 14.6, None, []), ('Fiano di Avellino', 40.95, 14.8, None, []),
                         ('Greco di Tufo', 41.01, 14.88, None, []), ('Taurasi', 41.01, 14.96, None, [])],
    ('IT', 'Puglia'): [('Castel del Monte', 41.08, 16.27, None, []), ('Primitivo di Manduria', 40.40, 17.63, None, []),
                       ('Salice Salentino', 40.38, 17.96, None, []), ('Salento', 40.3, 18.0, None, ['IGP Salento', 'Puglia IGP'])],
    ('IT', 'Sicilia'): [('Cerasuolo di Vittoria', 36.95, 14.53, None, []), ('Etna', 37.75, 15.0, None, ['Etna Rosso', 'Etna Bianco']),
                        ('Marsala', 37.80, 12.44, None, []), ('Noto', 36.89, 15.07, None, []),
                        ('Passito di Pantelleria', 36.83, 11.95, None, ['Pantelleria']), ('Sicilia DOC', 37.5, 14.0, None, ['Terre Siciliane'])],
    ('IT', 'Sardegna'): [('Cannonau di Sardegna', 40.0, 9.3, None, ['Cannonau']), ('Carignano del Sulcis', 39.1, 8.6, None, []),
                         ('Vermentino di Gallura', 40.95, 9.3, None, []), ('Vermentino di Sardegna', 40.0, 9.0, None, [])],
    ('IT', 'Umbria'): [('Montefalco Sagrantino', 42.89, 12.65, None, ['Sagrantino di Montefalco']), ('Orvieto', 42.72, 12.11, None, []),
                       ('Torgiano', 43.03, 12.43, None, [])],
    ('IT', 'Lazio'): [('Cesanese del Piglio', 41.83, 13.13, None, []), ('Frascati', 41.81, 12.68, None, [])],
    ('IT', 'Basilicata'): [('Aglianico del Vulture', 40.95, 15.63, None, [])],
    ('ES', 'Castilla y León'): [('Arribes', 41.2, -6.4, None, []), ('Bierzo', 42.6, -6.7, None, []), ('Cigales', 41.76, -4.70, None, []),
                                ('Ribera del Duero', 41.65, -3.70, None, ['Ribera']), ('Rueda', 41.41, -4.96, None, []),
                                ('Toro', 41.52, -5.39, None, []), ('Vino de la Tierra de Castilla y León', 41.6, -4.5, None, ['VdT Castilla y León'])],
    ('ES', 'Galicia'): [('Monterrei', 41.95, -7.45, None, []), ('Rías Baixas', 42.4, -8.7, None, ['Rias Baixas']),
                        ('Ribeira Sacra', 42.45, -7.6, None, []), ('Ribeiro', 42.3, -8.15, None, []), ('Valdeorras', 42.4, -7.0, None, [])],
    ('ES', 'Cataluña'): [('Alella', 41.49, 2.30, None, []), ('Cava', 41.43, 1.80, None, ['Cava DO']), ('Catalunya', 41.6, 1.3, None, ['DO Catalunya']),
                         ('Conca de Barberà', 41.4, 1.2, None, []), ('Corpinnat', 41.43, 1.80, None, []),
                         ('Costers del Segre', 41.6, 0.9, None, []), ('Empordà', 42.3, 3.0, None, ['Emporda']),
                         ('Montsant', 41.22, 0.85, None, []), ('Penedès', 41.35, 1.70, None, ['Penedes']),
                         ('Priorat', 41.18, 0.75, None, ['Priorato']), ('Terra Alta', 41.05, 0.42, None, [])],
    ('ES', 'Andalucía'): [('Condado de Huelva', 37.35, -6.6, None, []),
                          ('Jerez-Xérès-Sherry', 36.68, -6.13, None, ['Jerez', 'Sherry', 'Xérès', 'Fino', 'Oloroso', 'Amontillado']),
                          ('Málaga', 36.72, -4.42, None, []), ('Manzanilla-Sanlúcar de Barrameda', 36.78, -6.35, None, ['Manzanilla']),
                          ('Montilla-Moriles', 37.58, -4.64, None, [])],
    ('ES', 'Navarra'): [('Navarra', 42.5, -1.7, None, ['Navarre'])],
    ('ES', 'Aragón'): [('Calatayud', 41.35, -1.64, None, []), ('Campo de Borja', 41.83, -1.53, None, []),
                       ('Cariñena', 41.34, -1.22, None, []), ('Somontano', 42.04, 0.13, None, [])],
    ('ES', 'Castilla-La Mancha'): [('La Mancha', 39.3, -3.1, None, []), ('Manchuela', 39.4, -1.8, None, []),
                                   ('Méntrida', 40.24, -4.19, None, []), ('Valdepeñas', 38.76, -3.38, None, []),
                                   ('Vino de la Tierra de Castilla', 39.3, -3.0, None, ['VdT Castilla'])],
    ('ES', 'Levante'): [('Alicante', 38.35, -0.6, None, []), ('Bullas', 38.05, -1.67, None, []), ('Jumilla', 38.47, -1.33, None, []),
                        ('Utiel-Requena', 39.57, -1.2, None, []), ('Valencia', 39.5, -0.6, None, ['DO Valencia']), ('Yecla', 38.61, -1.12, None, [])],
    ('ES', 'Islas Canarias'): [('Lanzarote', 29.0, -13.65, None, []), ('Tacoronte-Acentejo', 28.47, -16.4, None, []),
                               ('Valle de la Orotava', 28.38, -16.52, None, [])],
    ('ES', 'País Vasco'): [('Bizkaiko Txakolina', 43.25, -2.9, None, ['Txakoli de Bizkaia']),
                           ('Getariako Txakolina', 43.30, -2.2, None, ['Txakoli', 'Txakolina', 'Txakoli de Getaria'])],
    ('ES', 'Islas Baleares'): [('Binissalem', 39.69, 2.84, None, []), ('Pla i Llevant', 39.6, 3.1, None, [])],
    ('DE', 'Mosel'): [('Bernkastel', 49.92, 7.07, 'Bernkastel', ['Bernkastel-Kues', 'Bernkasteler']), ('Brauneberg', 49.90, 6.98, 'Bernkastel', ['Brauneberger']),
                      ('Erden', 49.97, 7.03, 'Bernkastel', ['Erdener']), ('Graach', 49.93, 7.07, 'Bernkastel', ['Graacher']),
                      ('Piesport', 49.88, 6.92, 'Bernkastel', ['Piesporter']), ('Trittenheim', 49.82, 6.90, 'Bernkastel', ['Trittenheimer']),
                      ('Ürzig', 49.98, 7.01, 'Bernkastel', ['Ürziger', 'Uerzig']), ('Wehlen', 49.94, 7.04, 'Bernkastel', ['Wehlener']),
                      ('Wiltingen', 49.66, 6.59, 'Saar', ['Wiltinger', 'Scharzhofberg']), ('Zeltingen', 49.95, 7.02, 'Bernkastel', ['Zeltinger'])],
    ('DE', 'Rheingau'): [('Rheingau', 50.0, 8.0, None, []), ('Erbach', 50.02, 8.08, None, ['Erbacher']), ('Hattenheim', 50.01, 8.06, None, ['Hattenheimer']),
                         ('Hochheim', 50.01, 8.35, None, ['Hochheimer']), ('Johannisberg', 50.0, 7.98, None, ['Johannisberger', 'Schloss Johannisberg']),
                         ('Kiedrich', 50.04, 8.08, None, ['Kiedricher']), ('Rauenthal', 50.05, 8.13, None, ['Rauenthaler']),
                         ('Rüdesheim', 49.98, 7.92, None, ['Rüdesheimer']), ('Winkel', 50.0, 8.02, None, ['Winkeler'])],
    ('DE', 'Rheinhessen'): [('Rheinhessen', 49.85, 8.15, None, []), ('Nackenheim', 49.92, 8.34, None, ['Nackenheimer']),
                            ('Nierstein', 49.87, 8.34, None, ['Niersteiner']), ('Siefersheim', 49.80, 7.95, None, []),
                            ('Westhofen', 49.70, 8.25, None, ['Westhofener'])],
    ('DE', 'Pfalz'): [('Pfalz', 49.35, 8.15, None, []), ('Bad Dürkheim', 49.46, 8.17, 'Mittelhaardt', ['Dürkheimer']),
                      ('Birkweiler', 49.20, 8.04, 'Südliche Weinstraße', []), ('Deidesheim', 49.41, 8.18, 'Mittelhaardt', ['Deidesheimer']),
                      ('Forst', 49.42, 8.19, 'Mittelhaardt', ['Forster']), ('Kallstadt', 49.49, 8.17, 'Mittelhaardt', ['Kallstadter']),
                      ('Siebeldingen', 49.21, 8.05, 'Südliche Weinstraße', []), ('Ungstein', 49.48, 8.17, 'Mittelhaardt', ['Ungsteiner']),
                      ('Wachenheim', 49.44, 8.18, 'Mittelhaardt', ['Wachenheimer'])],
    ('DE', 'Nahe'): [('Nahe', 49.8, 7.75, None, []), ('Bad Kreuznach', 49.84, 7.87, None, ['Kreuznacher']), ('Monzingen', 49.79, 7.59, None, ['Monzinger']),
                     ('Niederhausen', 49.80, 7.75, None, ['Niederhäuser']), ('Schlossböckelheim', 49.80, 7.73, None, ['Schlossböckelheimer'])],
    ('DE', 'Baden'): [('Baden', 48.3, 7.8, None, []), ('Kaiserstuhl', 48.10, 7.65, 'Kaiserstuhl', []), ('Markgräflerland', 47.8, 7.6, 'Markgräflerland', []),
                      ('Ortenau', 48.55, 8.05, 'Ortenau', [])],
    ('DE', 'Franken'): [('Franken', 49.8, 10.0, None, ['Frankenwein']), ('Escherndorf', 49.86, 10.18, None, ['Escherndorfer']),
                        ('Iphofen', 49.70, 10.26, None, ['Iphöfer']), ('Randersacker', 49.76, 9.98, None, ['Randersackerer']),
                        ('Würzburg', 49.79, 9.94, None, ['Würzburger', 'Würzburger Stein'])],
    ('DE', 'Württemberg'): [('Württemberg', 49.0, 9.2, None, [])],
    ('DE', 'Ahr'): [('Ahr', 50.53, 7.0, None, [])],
    ('DE', 'Mittelrhein'): [('Mittelrhein', 50.2, 7.65, None, [])],
    ('DE', 'Sachsen'): [('Sachsen', 51.1, 13.6, None, [])],
    ('DE', 'Saale-Unstrut'): [('Saale-Unstrut', 51.2, 11.8, None, [])],
    ('DE', 'Hessische Bergstraße'): [('Hessische Bergstraße', 49.7, 8.6, None, [])],
    ('PT', 'Vinho Verde'): [('Vinho Verde', 41.7, -8.4, None, []), ('Monção e Melgaço', 42.05, -8.4, None, ['Alvarinho Monção e Melgaço'])],
    ('PT', 'Dão'): [('Dão', 40.55, -7.9, None, ['Dao'])],
    ('PT', 'Bairrada', ): [('Bairrada', 40.45, -8.45, None, [])],
    ('PT', 'Alentejo'): [('Alentejo', 38.5, -7.8, None, ['Alentejano', 'Vinho Regional Alentejano'])],
    ('PT', 'Lisboa'): [('Lisboa', 39.1, -9.2, None, ['Vinho Regional Lisboa']), ('Bucelas', 38.90, -9.12, None, []),
                       ('Carcavelos', 38.69, -9.33, None, []), ('Colares', 38.80, -9.45, None, [])],
    ('PT', 'Tejo'): [('Tejo', 39.3, -8.6, None, ['Vinho Regional Tejo'])],
    ('PT', 'Península de Setúbal'): [('Moscatel de Setúbal', 38.55, -8.9, None, ['Setúbal']), ('Palmela', 38.57, -8.9, None, [])],
    ('PT', 'Madeira'): [('Madeira', 32.7, -16.95, None, ['Madeira Wine', 'Sercial', 'Bual', 'Malmsey'])],
    ('PT', 'Açores'): [('Pico', 38.45, -28.4, None, [])],
    ('PT', 'Algarve'): [('Lagos', 37.10, -8.67, None, []), ('Algarve', 37.15, -8.3, None, ['Vinho Regional Algarve'])],
    ('PT', 'Trás-os-Montes'): [('Trás-os-Montes', 41.7, -7.2, None, [])],
    ('PT', 'Beira Interior'): [('Beira Interior', 40.5, -7.2, None, [])],
    ('AT', 'Niederösterreich'): [('Carnuntum', 48.08, 16.85, None, []), ('Kamptal', 48.47, 15.70, None, []), ('Kremstal', 48.40, 15.60, None, []),
                                 ('Thermenregion', 47.98, 16.25, None, []), ('Traisental', 48.30, 15.68, None, []),
                                 ('Wachau', 48.37, 15.42, None, ['Smaragd', 'Federspiel']), ('Wagram', 48.40, 15.85, None, []),
                                 ('Weinviertel', 48.60, 16.30, None, [])],
    ('AT', 'Burgenland'): [('Eisenberg', 47.20, 16.35, None, []), ('Leithaberg', 47.90, 16.62, None, []), ('Mittelburgenland', 47.50, 16.50, None, []),
                           ('Neusiedlersee', 47.85, 16.85, None, []), ('Rosalia', 47.75, 16.40, None, []), ('Ruster Ausbruch', 47.80, 16.67, None, [])],
    ('AT', 'Steiermark'): [('Südsteiermark', 46.70, 15.50, None, []), ('Vulkanland Steiermark', 46.85, 15.90, None, []),
                           ('Weststeiermark', 46.85, 15.25, None, ['Schilcher'])],
    ('AT', 'Wien'): [('Wien', 48.25, 16.37, None, ['Vienna']), ('Wiener Gemischter Satz', 48.25, 16.37, None, ['Gemischter Satz'])],
    ('US', 'California'): [('Alexander Valley', 38.70, -122.85, 'Sonoma County', []), ('Anderson Valley', 39.05, -123.45, 'Mendocino', []),
                           ('Atlas Peak', 38.42, -122.24, 'Napa Valley', []), ('Central Coast', 36.0, -121.0, 'Central Coast', []),
                           ('Coombsville', 38.31, -122.25, 'Napa Valley', []), ('Diamond Mountain District', 38.56, -122.57, 'Napa Valley', ['Diamond Mountain']),
                           ('Dry Creek Valley', 38.68, -122.95, 'Sonoma County', []), ('Livermore Valley', 37.68, -121.77, 'Central Coast', []),
                           ('Lodi', 38.13, -121.27, 'Central Valley', []), ('Mendocino', 39.2, -123.3, 'Mendocino', ['Mendocino County']),
                           ('Monterey', 36.4, -121.4, 'Central Coast', ['Monterey County']), ('Mount Veeder', 38.35, -122.39, 'Napa Valley', []),
                           ('North Coast', 38.8, -122.9, 'North Coast', []), ('Oak Knoll District', 38.35, -122.32, 'Napa Valley', []),
                           ('Paso Robles', 35.63, -120.69, 'Central Coast', []), ('Russian River Valley', 38.48, -122.85, 'Sonoma County', ['Russian River']),
                           ('Santa Barbara County', 34.7, -120.2, 'Central Coast', ['Santa Barbara']), ('Santa Cruz Mountains', 37.15, -122.05, 'Central Coast', []),
                           ('Santa Maria Valley', 34.92, -120.40, 'Central Coast', []), ('Sta. Rita Hills', 34.62, -120.35, 'Central Coast', ['Santa Rita Hills']),
                           ('Sierra Foothills', 38.5, -120.8, 'Sierra Foothills', []), ('Sonoma Coast', 38.4, -123.0, 'Sonoma County', []),
                           ('Sonoma County', 38.5, -122.8, 'Sonoma County', ['Sonoma']), ('Sonoma Valley', 38.30, -122.48, 'Sonoma County', []),
                           ('Spring Mountain District', 38.52, -122.53, 'Napa Valley', ['Spring Mountain']), ('Yountville', 38.40, -122.36, 'Napa Valley', [])],
    ('US', 'Oregon'): [('Chehalem Mountains', 45.36, -122.95, 'Willamette Valley', []), ('Dundee Hills', 45.27, -123.03, 'Willamette Valley', []),
                       ('Eola-Amity Hills', 45.03, -123.17, 'Willamette Valley', []), ('Ribbon Ridge', 45.35, -123.07, 'Willamette Valley', []),
                       ('Rogue Valley', 42.4, -122.9, 'Southern Oregon', []), ('Umpqua Valley', 43.2, -123.35, 'Southern Oregon', []),
                       ('Willamette Valley', 45.05, -123.05, 'Willamette Valley', ['Willamette']), ('Yamhill-Carlton', 45.30, -123.18, 'Willamette Valley', [])],
    ('US', 'Washington'): [('Columbia Valley', 46.3, -119.5, 'Columbia Valley', []), ('Horse Heaven Hills', 46.0, -119.7, 'Columbia Valley', []),
                           ('Red Mountain', 46.29, -119.45, 'Columbia Valley', []), ('Walla Walla Valley', 46.06, -118.4, 'Columbia Valley', ['Walla Walla']),
                           ('Yakima Valley', 46.4, -120.3, 'Columbia Valley', [])],
    ('US', 'New York'): [('Finger Lakes', 42.6, -76.9, None, []), ('Hudson River Region', 41.8, -73.95, None, ['Hudson Valley']),
                         ('Long Island', 40.95, -72.6, None, ['North Fork of Long Island'])],
    ('AU', 'South Australia'): [('Adelaide Hills', -34.95, 138.80, 'Mount Lofty Ranges', []), ('Barossa Valley', -34.55, 138.95, 'Barossa', ['Barossa']),
                                ('Clare Valley', -33.83, 138.6, 'Mount Lofty Ranges', []), ('Coonawarra', -37.29, 140.83, 'Limestone Coast', []),
                                ('Eden Valley', -34.65, 139.1, 'Barossa', []), ('Langhorne Creek', -35.30, 139.05, 'Fleurieu', []),
                                ('McLaren Vale', -35.22, 138.55, 'Fleurieu', []), ('Padthaway', -36.6, 140.5, 'Limestone Coast', []),
                                ('Riverland', -34.2, 140.6, 'Lower Murray', [])],
    ('AU', 'Victoria'): [('Beechworth', -36.36, 146.69, 'North East Victoria', []), ('Geelong', -38.1, 144.35, 'Port Phillip', []),
                         ('Grampians', -37.15, 142.8, 'Western Victoria', []), ('Heathcote', -36.92, 144.7, 'Central Victoria', []),
                         ('Macedon Ranges', -37.4, 144.6, 'Port Phillip', []), ('Mornington Peninsula', -38.35, 145.05, 'Port Phillip', []),
                         ('Rutherglen', -36.05, 146.46, 'North East Victoria', []), ('Yarra Valley', -37.7, 145.45, 'Port Phillip', [])],
    ('AU', 'New South Wales'): [('Canberra District', -35.2, 149.1, None, []), ('Hunter Valley', -32.8, 151.3, 'Hunter Valley', ['Hunter']),
                                ('Mudgee', -32.6, 149.6, None, []), ('Orange', -33.28, 149.1, None, []), ('Riverina', -34.3, 146.0, None, [])],
    ('AU', 'Western Australia'): [('Great Southern', -34.6, 117.6, None, ['Frankland River', 'Mount Barker']), ('Margaret River', -33.95, 115.07, None, []),
                                  ('Pemberton', -34.45, 116.03, None, []), ('Swan Valley', -31.85, 116.0, None, [])],
    ('AU', 'Tasmania'): [('Tasmania', -41.9, 147.0, None, ['Tasmanian'])],
    ('AU', 'Queensland'): [('Granite Belt', -28.7, 151.9, None, [])],
    ('ZA', 'Coastal Region'): [('Cape Town', -33.9, 18.5, None, []), ('Constantia', -34.03, 18.42, 'Cape Town', []),
                               ('Darling', -33.38, 18.38, None, []), ('Durbanville', -33.83, 18.65, 'Cape Town', []),
                               ('Franschhoek', -33.91, 19.12, None, ['Franschhoek Valley']), ('Paarl', -33.73, 18.97, None, []),
                               ('Stellenbosch', -33.93, 18.86, None, []), ('Swartland', -33.35, 18.7, None, []),
                               ('Tulbagh', -33.29, 19.14, None, []), ('Wellington', -33.64, 19.0, None, [])],
    ('ZA', 'Cape South Coast'): [('Cape Agulhas', -34.6, 19.75, None, ['Elim']), ('Elgin', -34.15, 19.05, None, []),
                                 ('Hemel-en-Aarde', -34.38, 19.27, 'Walker Bay', ['Hemel-en-Aarde Valley', 'Hemel-en-Aarde Ridge']),
                                 ('Walker Bay', -34.4, 19.3, 'Walker Bay', [])],
    ('ZA', 'Breede River Valley'): [('Breedekloof', -33.55, 19.3, None, []), ('Robertson', -33.8, 19.88, None, []), ('Worcester', -33.65, 19.45, None, [])],
    ('ZA', 'Olifants River'): [('Citrusdal Mountain', -32.6, 19.0, None, ['Citrusdal'])],
    ('ZA', 'Klein Karoo'): [('Calitzdorp', -33.53, 21.69, None, [])],
    ('CL', 'Aconcagua'): [('Aconcagua Valley', -32.8, -70.8, None, ['Valle de Aconcagua']), ('Casablanca Valley', -33.32, -71.41, None, ['Casablanca', 'Valle de Casablanca']),
                          ('Leyda Valley', -33.6, -71.5, 'San Antonio', ['Leyda', 'Valle de Leyda']), ('San Antonio Valley', -33.6, -71.6, 'San Antonio', ['Valle de San Antonio'])],
    ('CL', 'Valle Central'): [('Cachapoal Valley', -34.3, -70.8, 'Rapel', ['Cachapoal', 'Valle del Cachapoal']),
                              ('Colchagua Valley', -34.65, -71.25, 'Rapel', ['Colchagua', 'Valle de Colchagua']),
                              ('Curicó Valley', -35.0, -71.2, None, ['Curicó', 'Valle de Curicó']), ('Maipo Valley', -33.65, -70.65, None, ['Maipo', 'Valle del Maipo']),
                              ('Maule Valley', -35.6, -71.6, None, ['Maule', 'Valle del Maule']), ('Rapel Valley', -34.3, -71.1, 'Rapel', ['Rapel', 'Valle del Rapel'])],
    ('CL', 'Coquimbo'): [('Choapa Valley', -31.7, -71.0, None, []), ('Elqui Valley', -30.0, -70.7, None, ['Elqui']), ('Limarí Valley', -30.6, -71.2, None, ['Limarí'])],
    ('CL', 'Sur'): [('Bío Bío Valley', -37.3, -72.3, None, ['Bío Bío']), ('Itata Valley', -36.6, -72.4, None, ['Itata']), ('Malleco Valley', -38.0, -72.5, None, ['Malleco'])],
    ('AR', 'Mendoza'): [('Agrelo', -33.12, -68.88, 'Luján de Cuyo', []), ('Gualtallary', -33.4, -69.25, 'Valle de Uco', []),
                        ('Las Compuertas', -33.05, -68.98, 'Luján de Cuyo', []), ('Luján de Cuyo', -33.03, -68.88, 'Luján de Cuyo', []),
                        ('Maipú', -32.98, -68.78, None, []), ('Paraje Altamira', -33.75, -69.15, 'Valle de Uco', ['Altamira']),
                        ('San Carlos', -33.78, -69.05, 'Valle de Uco', []), ('Tunuyán', -33.58, -69.02, 'Valle de Uco', []),
                        ('Tupungato', -33.37, -69.15, 'Valle de Uco', []), ('Valle de Uco', -33.6, -69.2, 'Valle de Uco', ['Uco Valley'])],
    ('AR', 'Salta'): [('Cafayate', -26.07, -65.98, 'Valles Calchaquíes', []), ('Valles Calchaquíes', -25.5, -66.2, 'Valles Calchaquíes', ['Calchaquí Valley'])],
    ('AR', 'San Juan'): [('Pedernal', -31.98, -68.78, None, []), ('Valle de Tulum', -31.5, -68.5, None, ['Tulum'])],
    ('AR', 'Patagonia'): [('Neuquén', -38.95, -68.06, None, []), ('Río Negro', -39.1, -67.5, None, [])],
    ('NZ', 'Marlborough'): [('Awatere Valley', -41.65, 174.1, None, []), ('Southern Valleys', -41.6, 173.75, None, []), ('Wairau Valley', -41.52, 173.85, None, [])],
    ('NZ', 'Central Otago'): [('Alexandra', -45.25, 169.38, None, []), ('Bannockburn', -45.08, 169.16, None, []), ('Bendigo', -44.93, 169.35, None, []),
                              ('Gibbston', -45.02, 168.88, None, ['Gibbston Valley']), ('Wanaka', -44.7, 169.13, None, [])],
    ("NZ", "Hawke's Bay"): [('Bridge Pa Triangle', -39.65, 176.78, None, ['Bridge Pa']), ('Gimblett Gravels', -39.62, 176.75, None, [])],
    ('NZ', 'Wairarapa'): [('Martinborough', -41.22, 175.46, None, [])],
    ('NZ', 'Canterbury'): [('Waipara Valley', -43.06, 172.75, None, ['Waipara', 'North Canterbury'])],
    ('NZ', 'Auckland'): [('Kumeu', -36.78, 174.55, None, []), ('Waiheke Island', -36.8, 175.08, None, ['Waiheke'])],
    ('NZ', 'Nelson'): [('Moutere Hills', -41.25, 173.0, None, ['Moutere'])],
}

# The appellations already in the database: their subregion (and US ones move under California)
EXISTING = {
    'Médoc': ['medoc', 'haut-medoc', 'margaux', 'pauillac', 'saint-julien', 'saint-estephe', 'listrac-medoc', 'moulis'],
    'Graves & Sauternais': ['graves', 'pessac-leognan', 'sauternes', 'barsac'],
    'Libournais': ['saint-emilion', 'saint-emilion-grand-cru', 'saint-emilion-satellites', 'pomerol', 'lalande-de-pomerol', 'fronsac', 'canon-fronsac'],
    'Entre-Deux-Mers': ['entre-deux-mers'],
    'Côtes de Bordeaux': ['blaye', 'cadillac', 'castillon', 'cotes-de-bourg', 'francs'],
    'Côte de Nuits': ['chambolle-musigny', 'cote-de-nuits-villages', 'gevrey-chambertin', 'morey-saint-denis', 'nuits-saint-georges', 'vosne-romanee', 'vougeot'],
    'Côte de Beaune': ['beaune', 'chassagne-montrachet', 'corton', 'meursault', 'pommard', 'puligny-montrachet', 'santenay', 'volnay'],
    'Chablis': ['chablis', 'chablis-grand-cru'],
    'Côte Chalonnaise': ['mercurey'],
    'Mâconnais': ['macon', 'pouilly-fuisse'],
    'Rhône Nord': ['condrieu', 'cornas', 'cote-rotie', 'crozes-hermitage', 'hermitage', 'saint-joseph'],
    'Rhône Sud': ['chateauneuf-du-pape', 'gigondas', 'lirac', 'rasteau', 'tavel', 'vacqueyras', 'cotes-du-rhone-villages'],
    'Langhe': ['barolo', 'barbaresco', 'barbera-d-alba', 'dolcetto-d-alba', 'langhe', 'nebbiolo-d-alba'],
    'Roero': ['roero'],
    'Monferrato': ['barbera-d-asti', 'moscato-d-asti', 'gavi'],
    'Chianti': ['chianti', 'chianti-classico'],
    'Montalcino': ['brunello-di-montalcino', 'rosso-di-montalcino'],
    'Montepulciano': ['vino-nobile-di-montepulciano'],
    'Costa Toscana': ['bolgheri'],
    'Maremma': ['maremma'],
    'Bernkastel': [],
    'Saar': ['saar'], 'Ruwer': ['ruwer'],
    'Rioja Alta': ['rioja-alta'], 'Rioja Alavesa': ['rioja-alavesa'], 'Rioja Oriental': ['rioja-oriental'],
    'Napa Valley': ['calistoga', 'howell-mountain', 'los-carneros', 'oakville', 'rutherford', 'st-helena', 'stags-leap-district'],
    'North Coast': ['napa-valley'],
}


def slug(s):
    s = unicodedata.normalize('NFKD', s.replace('ß', 'ss')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def q(s):
    return 'null' if s is None else "'" + s.replace("'", "''") + "'"


def arr(a):
    return "'{}'::text[]" if not a else 'array[' + ', '.join(q(x) for x in a) + ']::text[]'


def rows():
    regions = [(slug(f'{c}-{n}'), c, n, la, lo, al) for c, rs in REGIONS.items() for (n, la, lo, al) in rs]
    apps = []
    for (c, r), items in NEW.items():
        for (n, la, lo, sub, al) in items:
            apps.append((slug(n) if slug(n) not in {'savoie', 'alsace', 'nahe'} else slug(n) + '-aoc', n, r, c, sub, al, la, lo))
    return regions, apps


def check(regions, apps):
    """Every coordinate inside its country (Natural Earth admin 0, 50 m)."""
    from shapely.geometry import shape, Point
    geo = os.environ.get('GEO', 'geo')
    feats = json.load(open(os.path.join(geo, 'ne_50m_admin_0_countries.geojson')))['features']
    shapes = {}
    for f in feats:
        code = f['properties'].get('ISO_A2_EH') or f['properties'].get('ISO_A2')
        shapes.setdefault(code, []).append(shape(f['geometry']).buffer(0.08))
    # Small islands (Waiheke) are missing at 50 m: accept 10 m land within 0.3° of the country
    land = [shape(f['geometry']) for f in json.load(open(os.path.join(geo, 'ne_10m_land.geojson')))['features']]
    near = {c: [s.buffer(0.3) for s in ss] for c, ss in shapes.items()}
    def inside(c, la, lo):
        p = Point(lo, la)
        return any(s.contains(p) for s in shapes.get(c, [])) or (
            any(s.contains(p) for s in near.get(c, [])) and any(l.contains(p) for l in land))
    bad = 0
    for (rid, c, n, la, lo, _) in regions:
        if not inside(c, la, lo):
            print('REGION outside', c, n, la, lo); bad += 1
    for (aid, n, r, c, sub, al, la, lo) in apps:
        if not inside(c, la, lo):
            print('APP outside', c, r, n, la, lo); bad += 1
    print('checked', len(regions), 'regions,', len(apps), 'appellations;', bad, 'outside')
    return bad


def main():
    regions, apps = rows()
    ids = [a[0] for a in apps]
    dup = {i for i in ids if ids.count(i) > 1}
    assert not dup, dup
    if '--check' in sys.argv:
        sys.exit(1 if check(regions, apps) else 0)
    out = ['-- Wine geography: Country → Region → Appellation (+ subregion). Generated by scripts/wine-geography.py.',
           'create table if not exists wine_regions (',
           '  id text primary key, country text not null, name text not null, aliases text[] not null default \'{}\',',
           '  lat double precision, lon double precision);',
           'alter table wine_regions enable row level security;',
           'drop policy if exists read_all on wine_regions;',
           'create policy read_all on wine_regions for select to anon, authenticated using (true);',
           'grant select on wine_regions to anon, authenticated;',
           'alter table appellations add column if not exists subregion text;',
           '',
           'insert into wine_regions (id, country, name, aliases, lat, lon) values']
    out.append(',\n'.join(f"  ({q(i)}, {q(c)}, {q(n)}, {arr(al)}, {la}, {lo})" for (i, c, n, la, lo, al) in regions))
    out.append('on conflict (id) do update set country = excluded.country, name = excluded.name, aliases = excluded.aliases, lat = excluded.lat, lon = excluded.lon;')
    out.append('')
    out.append('insert into appellations (id, name, region, country, subregion, aliases, lat, lon) values')
    out.append(',\n'.join(f"  ({q(i)}, {q(n)}, {q(r)}, {q(c)}, {q(s)}, {arr(al)}, {la}, {lo})" for (i, n, r, c, s, al, la, lo) in apps))
    out.append('on conflict (id) do update set name = excluded.name, region = excluded.region, country = excluded.country, subregion = excluded.subregion, aliases = excluded.aliases, lat = excluded.lat, lon = excluded.lon;')
    out.append('')
    for sub, ids_ in EXISTING.items():
        if ids_:
            out.append(f"update appellations set subregion = {q(sub)} where id in ({', '.join(q(i) for i in ids_)});")
    out.append("update appellations set region = 'California' where country = 'US' and region = 'Napa Valley';")
    out.append("update wines set region = 'California' where country = 'US' and region = 'Napa Valley';")
    out.append('-- Wines whose appellation is now known get linked (the wines_origin trigger sets name, region and country)')
    out.append('update wines set appellation = appellation where appellation_id is null and match_appellation(appellation) is not null;')
    path = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations', '20261101_wine_geography.sql')
    open(path, 'w').write('\n'.join(out) + '\n')
    print('wrote', path, len(regions), 'regions,', len(apps), 'appellations')


if __name__ == '__main__':
    main()
