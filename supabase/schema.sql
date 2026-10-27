-- Only the Edge Function can access these tables. Public editing is mediated
-- by its validation and compare-and-swap revision check.
create table public.shared_games (
  id text primary key check (id = 'main'),
  pack jsonb not null check (jsonb_typeof(pack) = 'object' and octet_length(pack::text) <= 5242880),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create table public.game_history (
  revision integer primary key,
  pack jsonb not null,
  saved_at timestamptz not null
);
alter table public.shared_games enable row level security;
alter table public.game_history enable row level security;
revoke all on public.shared_games, public.game_history from public, anon, authenticated;
grant select, insert, update on public.shared_games to service_role;
grant select, insert on public.game_history to service_role;
create function public.archive_shared_game() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'Revision must increase by one';
  end if;
  insert into public.game_history(revision, pack, saved_at)
  values (old.revision, old.pack, old.updated_at);
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.archive_shared_game() from public, anon, authenticated;
create trigger archive_before_save before update on public.shared_games
for each row execute function public.archive_shared_game();

