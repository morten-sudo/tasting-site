-- A tasting's hosts can reset the quiz: every guest's answer to its questions is deleted (the questions stay).
create or replace function public.reset_quiz(t_id uuid)
returns int language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if current_host_id() is null or not is_tasting_host(t_id) then raise exception 'not allowed'; end if;
  delete from quiz_answers a using quiz_questions q where q.id = a.question_id and q.tasting_id = t_id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.reset_quiz(uuid) from public;
revoke execute on function public.reset_quiz(uuid) from anon;
grant execute on function public.reset_quiz(uuid) to authenticated;
