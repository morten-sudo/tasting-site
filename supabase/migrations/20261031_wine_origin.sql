-- Where a wine comes from: country (ISO code), region and appellation.
-- A shared reference list of appellations (with other spellings) turns free text from labels,
-- shop pages or the host into one known appellation, so maps can find it later.

create table if not exists appellations (
  id text primary key,            -- e.g. 'saint-emilion-grand-cru'
  name text not null,             -- display name, e.g. 'Saint-Émilion Grand Cru'
  region text not null,           -- e.g. 'Bordeaux'
  country text not null,          -- ISO 3166-1 alpha-2, e.g. 'FR'
  aliases text[] not null default '{}'
);
alter table appellations enable row level security;
drop policy if exists appellations_read on appellations;
create policy appellations_read on appellations for select to anon, authenticated using (true);
grant select on appellations to anon, authenticated;

alter table wines add column if not exists country text;
alter table wines add column if not exists region text;
alter table wines add column if not exists appellation text;
alter table wines add column if not exists appellation_id text references appellations(id) on delete set null;

-- Lower case, no accents or punctuation, "st"/"ste" written out: "St-Émilion" → "saint emilion"
create or replace function norm_origin(t text) returns text
language sql immutable set search_path = public as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(
    ' ' || regexp_replace(translate(lower(coalesce(t, '')),
      'àáâãäåāçćčèéêëēìíîïñńòóôõöøùúûüýÿšžß',
      'aaaaaaaccceeeeeiiiinnoooooouuuuyyszs'), '[^a-z0-9]+', ' ', 'g') || ' ',
    ' st ', ' saint ', 'g'), ' ste ', ' sainte ', 'g'), '\s+', ' ', 'g'));
$$;

-- The best known appellation in a piece of text: the longest name or alias it contains
create or replace function match_appellation(t text) returns text
language sql stable set search_path = public as $$
  select a.id
  from appellations a, unnest(array[a.name] || a.aliases) al
  where norm_origin(t) <> ''
    and ' ' || norm_origin(t) || ' ' like '% ' || norm_origin(al) || ' %'
  order by length(norm_origin(al)) desc, a.id
  limit 1;
$$;

-- Saving a wine: a known appellation sets the display name, region and country
create or replace function wines_origin() returns trigger
language plpgsql set search_path = public as $$
declare a appellations;
begin
  new.appellation := nullif(trim(new.appellation), '');
  new.region := nullif(trim(new.region), '');
  new.country := upper(nullif(trim(new.country), ''));
  if new.country is not null and new.country !~ '^[A-Z]{2}$' then new.country := null; end if;
  select * into a from appellations where id = match_appellation(new.appellation);
  if a.id is not null then
    new.appellation_id := a.id;
    new.appellation := a.name;
    new.region := a.region;
    new.country := a.country;
  else
    new.appellation_id := null;
  end if;
  return new;
end $$;
drop trigger if exists wines_origin on wines;
create trigger wines_origin before insert or update of appellation, region, country on wines
  for each row execute function wines_origin();

-- Guests: the wines of their tasting, now with origin
drop function if exists get_wines(text);
create function get_wines(code text)
 returns table(id integer, sort_order integer, name text, producer text, style text, vintage text, abv numeric,
   price_dkk numeric, description text, orderable boolean, image_url text, details text, retail_price_dkk numeric,
   price_tiers jsonb, country text, region text, appellation text, appellation_id text)
 language sql stable security definer set search_path to 'public'
as $function$
  select w.id, tw.sort_order, w.name, w.producer, w.style, w.vintage, w.abv,
         tw.price_dkk, w.description, tw.orderable, w.image_url, w.details, w.retail_price_dkk,
         coalesce((select jsonb_agg(e order by (e ->> 'qty')::int) from jsonb_array_elements(tw.price_tiers) e), '[]'::jsonb),
         w.country, w.region, w.appellation, w.appellation_id
  from tasting_wines tw
  join wines w on w.id = tw.wine_id
  where tw.revealed
    and tw.tasting_id = (select p.tasting_id from participants p where p.invite_code = code)
  order by tw.sort_order, w.id;
$function$;
grant execute on function get_wines(text) to anon, authenticated;

-- The reference list: the regions we plan maps for, plus their main appellations
insert into appellations (id, name, region, country, aliases) values
 -- Douro and port
 ('porto', 'Porto', 'Douro', 'PT', '{Port,Port Wine,Vinho do Porto,Portvin,Oporto,Vintage Port,Tawny Port,White Port}'),
 ('douro', 'Douro', 'Douro', 'PT', '{Douro DOC,Douro Valley}'),
 -- Roussillon
 ('rivesaltes', 'Rivesaltes', 'Roussillon', 'FR', '{Rivesaltes Ambré,Rivesaltes Tuilé,Rivesaltes Grenat}'),
 ('muscat-de-rivesaltes', 'Muscat de Rivesaltes', 'Roussillon', 'FR', '{}'),
 ('maury', 'Maury', 'Roussillon', 'FR', '{}'),
 ('banyuls', 'Banyuls', 'Roussillon', 'FR', '{Banyuls Grand Cru}'),
 ('collioure', 'Collioure', 'Roussillon', 'FR', '{}'),
 ('cotes-du-roussillon', 'Côtes du Roussillon', 'Roussillon', 'FR', '{Côtes du Roussillon Villages}'),
 -- Bordeaux
 ('bordeaux', 'Bordeaux', 'Bordeaux', 'FR', '{Bordeaux AOC,Bordeaux Rouge,Bordeaux Blanc}'),
 ('bordeaux-superieur', 'Bordeaux Supérieur', 'Bordeaux', 'FR', '{}'),
 ('medoc', 'Médoc', 'Bordeaux', 'FR', '{}'),
 ('haut-medoc', 'Haut-Médoc', 'Bordeaux', 'FR', '{}'),
 ('saint-estephe', 'Saint-Estèphe', 'Bordeaux', 'FR', '{}'),
 ('pauillac', 'Pauillac', 'Bordeaux', 'FR', '{Paulliac}'),
 ('saint-julien', 'Saint-Julien', 'Bordeaux', 'FR', '{}'),
 ('margaux', 'Margaux', 'Bordeaux', 'FR', '{}'),
 ('listrac-medoc', 'Listrac-Médoc', 'Bordeaux', 'FR', '{Listrac}'),
 ('moulis', 'Moulis-en-Médoc', 'Bordeaux', 'FR', '{Moulis}'),
 ('pessac-leognan', 'Pessac-Léognan', 'Bordeaux', 'FR', '{}'),
 ('graves', 'Graves', 'Bordeaux', 'FR', '{Graves Supérieures}'),
 ('sauternes', 'Sauternes', 'Bordeaux', 'FR', '{}'),
 ('barsac', 'Barsac', 'Bordeaux', 'FR', '{}'),
 ('entre-deux-mers', 'Entre-Deux-Mers', 'Bordeaux', 'FR', '{}'),
 ('saint-emilion', 'Saint-Émilion', 'Bordeaux', 'FR', '{}'),
 ('saint-emilion-grand-cru', 'Saint-Émilion Grand Cru', 'Bordeaux', 'FR', '{Saint-Émilion GC,Saint-Émilion Grand Cru Classé,Saint-Émilion 1er Grand Cru Classé,Saint-Émilion Premier Grand Cru Classé}'),
 ('pomerol', 'Pomerol', 'Bordeaux', 'FR', '{}'),
 ('lalande-de-pomerol', 'Lalande-de-Pomerol', 'Bordeaux', 'FR', '{}'),
 ('fronsac', 'Fronsac', 'Bordeaux', 'FR', '{}'),
 ('canon-fronsac', 'Canon-Fronsac', 'Bordeaux', 'FR', '{}'),
 ('saint-emilion-satellites', 'Satellites de Saint-Émilion', 'Bordeaux', 'FR', '{Montagne-Saint-Émilion,Lussac-Saint-Émilion,Puisseguin-Saint-Émilion,Saint-Georges-Saint-Émilion}'),
 ('castillon', 'Castillon Côtes de Bordeaux', 'Bordeaux', 'FR', '{Castillon,Côtes de Castillon,Castillon-Côtes de Bordeaux}'),
 ('francs', 'Francs Côtes de Bordeaux', 'Bordeaux', 'FR', '{Bordeaux Côtes de Francs}'),
 ('blaye', 'Blaye Côtes de Bordeaux', 'Bordeaux', 'FR', '{Blaye,Côtes de Blaye,Premières Côtes de Blaye}'),
 ('cotes-de-bourg', 'Côtes de Bourg', 'Bordeaux', 'FR', '{Bourg}'),
 ('cadillac', 'Cadillac Côtes de Bordeaux', 'Bordeaux', 'FR', '{Premières Côtes de Bordeaux}'),
 -- Bourgogne
 ('bourgogne', 'Bourgogne', 'Bourgogne', 'FR', '{Burgundy,Bourgogne Rouge,Bourgogne Blanc,Coteaux Bourguignons}'),
 ('chablis', 'Chablis', 'Bourgogne', 'FR', '{Petit Chablis,Chablis Premier Cru,Chablis 1er Cru}'),
 ('chablis-grand-cru', 'Chablis Grand Cru', 'Bourgogne', 'FR', '{}'),
 ('gevrey-chambertin', 'Gevrey-Chambertin', 'Bourgogne', 'FR', '{Chambertin}'),
 ('morey-saint-denis', 'Morey-Saint-Denis', 'Bourgogne', 'FR', '{}'),
 ('chambolle-musigny', 'Chambolle-Musigny', 'Bourgogne', 'FR', '{Musigny}'),
 ('vougeot', 'Vougeot', 'Bourgogne', 'FR', '{Clos de Vougeot}'),
 ('vosne-romanee', 'Vosne-Romanée', 'Bourgogne', 'FR', '{}'),
 ('nuits-saint-georges', 'Nuits-Saint-Georges', 'Bourgogne', 'FR', '{}'),
 ('cote-de-nuits-villages', 'Côte de Nuits-Villages', 'Bourgogne', 'FR', '{}'),
 ('corton', 'Corton', 'Bourgogne', 'FR', '{Corton-Charlemagne,Aloxe-Corton,Ladoix}'),
 ('beaune', 'Beaune', 'Bourgogne', 'FR', '{Côte de Beaune,Côte de Beaune-Villages}'),
 ('pommard', 'Pommard', 'Bourgogne', 'FR', '{}'),
 ('volnay', 'Volnay', 'Bourgogne', 'FR', '{}'),
 ('meursault', 'Meursault', 'Bourgogne', 'FR', '{}'),
 ('puligny-montrachet', 'Puligny-Montrachet', 'Bourgogne', 'FR', '{Montrachet,Bâtard-Montrachet}'),
 ('chassagne-montrachet', 'Chassagne-Montrachet', 'Bourgogne', 'FR', '{}'),
 ('santenay', 'Santenay', 'Bourgogne', 'FR', '{}'),
 ('mercurey', 'Mercurey', 'Bourgogne', 'FR', '{Côte Chalonnaise,Givry,Rully}'),
 ('macon', 'Mâcon', 'Bourgogne', 'FR', '{Mâcon-Villages}'),
 ('pouilly-fuisse', 'Pouilly-Fuissé', 'Bourgogne', 'FR', '{Saint-Véran}'),
 -- Champagne
 ('champagne', 'Champagne', 'Champagne', 'FR', '{Champagne AOC,Champagne Grand Cru,Champagne Premier Cru}'),
 ('coteaux-champenois', 'Coteaux Champenois', 'Champagne', 'FR', '{}'),
 -- Rhône
 ('cotes-du-rhone', 'Côtes du Rhône', 'Rhône', 'FR', '{}'),
 ('cotes-du-rhone-villages', 'Côtes du Rhône Villages', 'Rhône', 'FR', '{}'),
 ('chateauneuf-du-pape', 'Châteauneuf-du-Pape', 'Rhône', 'FR', '{}'),
 ('gigondas', 'Gigondas', 'Rhône', 'FR', '{}'),
 ('vacqueyras', 'Vacqueyras', 'Rhône', 'FR', '{}'),
 ('rasteau', 'Rasteau', 'Rhône', 'FR', '{}'),
 ('lirac', 'Lirac', 'Rhône', 'FR', '{}'),
 ('tavel', 'Tavel', 'Rhône', 'FR', '{}'),
 ('cote-rotie', 'Côte-Rôtie', 'Rhône', 'FR', '{}'),
 ('condrieu', 'Condrieu', 'Rhône', 'FR', '{}'),
 ('saint-joseph', 'Saint-Joseph', 'Rhône', 'FR', '{}'),
 ('hermitage', 'Hermitage', 'Rhône', 'FR', '{Ermitage}'),
 ('crozes-hermitage', 'Crozes-Hermitage', 'Rhône', 'FR', '{}'),
 ('cornas', 'Cornas', 'Rhône', 'FR', '{}'),
 -- Piemonte
 ('barolo', 'Barolo', 'Piemonte', 'IT', '{Barolo DOCG}'),
 ('barbaresco', 'Barbaresco', 'Piemonte', 'IT', '{Barbaresco DOCG}'),
 ('langhe', 'Langhe', 'Piemonte', 'IT', '{Langhe Nebbiolo}'),
 ('nebbiolo-d-alba', 'Nebbiolo d''Alba', 'Piemonte', 'IT', '{}'),
 ('barbera-d-alba', 'Barbera d''Alba', 'Piemonte', 'IT', '{}'),
 ('barbera-d-asti', 'Barbera d''Asti', 'Piemonte', 'IT', '{Nizza}'),
 ('dolcetto-d-alba', 'Dolcetto d''Alba', 'Piemonte', 'IT', '{Dogliani}'),
 ('roero', 'Roero', 'Piemonte', 'IT', '{Roero Arneis}'),
 ('gavi', 'Gavi', 'Piemonte', 'IT', '{Gavi di Gavi,Cortese di Gavi}'),
 ('moscato-d-asti', 'Moscato d''Asti', 'Piemonte', 'IT', '{Asti Spumante}'),
 ('piemonte', 'Piemonte', 'Piemonte', 'IT', '{Piemonte DOC,Piedmont}'),
 -- Toscana
 ('chianti', 'Chianti', 'Toscana', 'IT', '{Chianti Rufina,Chianti Colli Senesi}'),
 ('chianti-classico', 'Chianti Classico', 'Toscana', 'IT', '{Chianti Classico Riserva,Chianti Classico Gran Selezione}'),
 ('brunello-di-montalcino', 'Brunello di Montalcino', 'Toscana', 'IT', '{Brunello}'),
 ('rosso-di-montalcino', 'Rosso di Montalcino', 'Toscana', 'IT', '{}'),
 ('vino-nobile-di-montepulciano', 'Vino Nobile di Montepulciano', 'Toscana', 'IT', '{Rosso di Montepulciano}'),
 ('bolgheri', 'Bolgheri', 'Toscana', 'IT', '{Bolgheri Superiore,Bolgheri Rosso,Bolgheri Sassicaia}'),
 ('maremma', 'Maremma Toscana', 'Toscana', 'IT', '{Morellino di Scansano,Maremma}'),
 ('carmignano', 'Carmignano', 'Toscana', 'IT', '{}'),
 ('vernaccia-di-san-gimignano', 'Vernaccia di San Gimignano', 'Toscana', 'IT', '{}'),
 ('toscana-igt', 'Toscana IGT', 'Toscana', 'IT', '{Toscana,Tuscany,Super Tuscan,IGT Toscana}'),
 -- Rioja
 ('rioja', 'Rioja', 'Rioja', 'ES', '{Rioja DOCa,Rioja DOC,Rioja Crianza,Rioja Reserva,Rioja Gran Reserva}'),
 ('rioja-alta', 'Rioja Alta', 'Rioja', 'ES', '{}'),
 ('rioja-alavesa', 'Rioja Alavesa', 'Rioja', 'ES', '{}'),
 ('rioja-oriental', 'Rioja Oriental', 'Rioja', 'ES', '{Rioja Baja}'),
 -- Mosel
 ('mosel', 'Mosel', 'Mosel', 'DE', '{Mosel-Saar-Ruwer,Moselle Allemande}'),
 ('saar', 'Saar', 'Mosel', 'DE', '{}'),
 ('ruwer', 'Ruwer', 'Mosel', 'DE', '{}'),
 -- Napa Valley
 ('napa-valley', 'Napa Valley', 'Napa Valley', 'US', '{Napa}'),
 ('oakville', 'Oakville', 'Napa Valley', 'US', '{}'),
 ('rutherford', 'Rutherford', 'Napa Valley', 'US', '{}'),
 ('stags-leap-district', 'Stags Leap District', 'Napa Valley', 'US', '{Stag''s Leap District}'),
 ('howell-mountain', 'Howell Mountain', 'Napa Valley', 'US', '{}'),
 ('los-carneros', 'Los Carneros', 'Napa Valley', 'US', '{Carneros}'),
 ('st-helena', 'St. Helena', 'Napa Valley', 'US', '{Saint Helena}'),
 ('calistoga', 'Calistoga', 'Napa Valley', 'US', '{}')
on conflict (id) do update set name = excluded.name, region = excluded.region, country = excluded.country, aliases = excluded.aliases;
