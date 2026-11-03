-- The database calls the iOS app (ios/) uses. Apps in people's phones cannot be changed along with the database, so these
-- calls must keep their arguments and columns. Read-only. Run after every database change; expect 'app contract passed'.
-- Need something else? Add a new optional argument with a default (and update the list here) or a new function.
do $$
declare r record; res text; missing text := '';
begin
  for r in select * from (values
    ('get_invite','code text','name,status,note,email'),
    ('get_tasting','code text, slug text',''),
    ('get_wines','code text','id,sort_order,name,producer,style,vintage,abv,price_dkk,retail_price_dkk,description,image_url,details,country,region,appellation,producer_website,producer_address,grapes,food_pairing,serving,blind,appellation_id,producer_lat,producer_lon,orderable,ordered,price_tiers'),
    ('get_my_ratings','code text','wine_id,rating,note'),
    ('rate_wine','code text, w_id integer, stars integer, note text',''),
    ('respond_invite','code text, attending boolean, diet text, note text',''),
    ('set_my_email','code text, e text',''),
    ('my_tastings','','code,slug,title,starts_at,place,status'),
    ('login_email_known','e text',''),
    ('invite_is_mine','code text',''),
    ('link_me_tastings','',''),
    ('my_wine_book','codes text[]','wine_id,name,producer,vintage,style,image_url,appellation,region,country,slug,title,starts_at,sort_order,rating,note,rated_at,bought'),
    ('get_my_orders','code text','order_id,created_at,paid,wine_id,wine_name,quantity,unit_price'),
    ('my_orders','','order_id,created_at,paid,slug,title,wine_name,quantity,unit_price'),
    ('my_profile','',''),
    ('get_tasting_payment','code text','amount,paid'),
    ('get_quiz','code text','id,sort_order,question,options,correct_key,explanation'),
    ('get_my_answers','code text','question_id,answer_key'),
    ('submit_answer','code text, q_id integer, a_key text',''),
    ('tasting_leaderboard','code text, slug text','name,points,answered'),
    ('get_chat','code text, after_id bigint','id,author,body,created_at,from_host,mine'),
    ('post_chat','code text, body text',''),
    ('place_order','code text, items jsonb',''),
    ('log_usage','feature text, model text, tokens_in integer, tokens_out integer, estimated boolean, n integer','')
  ) as t(fn,args,cols) loop
    select pg_get_function_result(p.oid) into res from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.fn and pg_get_function_identity_arguments(p.oid) = r.args;
    if res is null then missing := missing || ' ' || r.fn || '(' || r.args || ')'; continue; end if;
    if r.cols <> '' and not (select bool_and(res ~ ('\m' || c || '\M')) from unnest(string_to_array(r.cols, ',')) c) then
      missing := missing || ' ' || r.fn || ' columns';
    end if;
  end loop;
  if missing <> '' then raise exception 'app contract broken:%', missing; end if;
  -- The shared lists the app reads straight from their tables for the maps (as the site does)
  if not (has_table_privilege('anon', 'appellations', 'select') and has_table_privilege('anon', 'wine_regions', 'select')
          and has_table_privilege('anon', 'appellation_guesses', 'select')) then
    raise exception 'app contract broken: the map lists are not readable';
  end if;
  if not (select has_function_privilege('anon', 'get_invite(text)', 'execute') and has_function_privilege('anon', 'rate_wine(text,int,int,text)', 'execute')) then
    raise exception 'app contract broken: anon access';
  end if;
  raise notice 'app contract passed';
end $$;
