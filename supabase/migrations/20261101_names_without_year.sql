-- Wine names without the vintage year (it is shown from the vintage): "Château Fombrauge 2020" → "Château Fombrauge"
update wines
set name = btrim(regexp_replace(regexp_replace(name, '(^|[\s,–—-]+)' || vintage || '(?=$|[\s,–—-])', ' ', 'g'), '\s{2,}', ' ', 'g'), ' ,–—-')
where vintage ~ '^\d{4}$' and name ~ ('(^|[\s,–—-])' || vintage || '($|[\s,–—-])');
