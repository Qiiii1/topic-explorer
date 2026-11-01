-- Run once in the Supabase SQL editor. No project text or generated cards are stored here.
begin;
create table if not exists public.topic_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation_limit integer not null default 30 check (generation_limit >= 0),
  used integer not null default 0 check (used >= 0),
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.topic_generation_requests (
  user_id uuid not null references public.topic_accounts(user_id) on delete cascade,
  request_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('pending', 'succeeded', 'failed')),
  lease_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
create index if not exists topic_pending_requests on public.topic_generation_requests(user_id, expires_at) where state = 'pending';
alter table public.topic_accounts enable row level security;
alter table public.topic_generation_requests enable row level security;
revoke all on public.topic_accounts, public.topic_generation_requests from public, anon, authenticated;
grant select, update on public.topic_accounts to service_role;

create or replace function public.topic_quota(p_user_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'limit', a.generation_limit, 'used', a.used, 'blocked', a.blocked,
    'pending', (select count(*) from public.topic_generation_requests r where r.user_id = a.user_id and r.state = 'pending' and r.expires_at > now()),
    'remaining', greatest(0, a.generation_limit - a.used - (select count(*) from public.topic_generation_requests r where r.user_id = a.user_id and r.state = 'pending' and r.expires_at > now()))
  ) from public.topic_accounts a where a.user_id = p_user_id;
$$;

create or replace function public.topic_account(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.topic_accounts(user_id) values (p_user_id) on conflict do nothing;
  return public.topic_quota(p_user_id);
end;
$$;

create or replace function public.topic_reserve(p_user_id uuid, p_request_id uuid, p_fingerprint text, p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.topic_accounts;
  r public.topic_generation_requests;
  q jsonb;
begin
  if p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'invalid fingerprint'; end if;
  insert into public.topic_accounts(user_id) values (p_user_id) on conflict do nothing;
  -- All reservations and completions for one account serialize on this row.
  select * into a from public.topic_accounts where user_id = p_user_id for update;
  update public.topic_generation_requests set state = 'failed', updated_at = now()
    where user_id = p_user_id and state = 'pending' and expires_at <= now();
  q := public.topic_quota(p_user_id);
  select * into r from public.topic_generation_requests where user_id = p_user_id and request_id = p_request_id;
  if found then
    if r.fingerprint <> p_fingerprint then return jsonb_build_object('status', 'conflict', 'quota', q); end if;
    if r.state = 'succeeded' then return jsonb_build_object('status', 'completed', 'quota', q); end if;
    if r.state = 'pending' then return jsonb_build_object('status', 'pending', 'quota', q); end if;
  end if;
  if a.blocked then return jsonb_build_object('status', 'blocked', 'quota', q); end if;
  if (q->>'remaining')::integer <= 0 then return jsonb_build_object('status', 'exhausted', 'quota', q); end if;
  if (q->>'pending')::integer >= 2 then return jsonb_build_object('status', 'busy', 'quota', q); end if;
  insert into public.topic_generation_requests(user_id, request_id, fingerprint, state, lease_id, expires_at)
    values (p_user_id, p_request_id, p_fingerprint, 'pending', p_lease_id, now() + interval '180 seconds')
    on conflict (user_id, request_id) do update set state = 'pending', lease_id = p_lease_id, expires_at = now() + interval '180 seconds', updated_at = now();
  return jsonb_build_object('status', 'reserved', 'quota', public.topic_quota(p_user_id));
end;
$$;

create or replace function public.topic_finish(p_user_id uuid, p_request_id uuid, p_lease_id uuid, p_success boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.topic_generation_requests;
begin
  perform 1 from public.topic_accounts where user_id = p_user_id for update;
  select * into r from public.topic_generation_requests where user_id = p_user_id and request_id = p_request_id;
  -- A late attempt may never charge or release a newer reservation.
  if not found or r.lease_id <> p_lease_id then
    return jsonb_build_object('status', 'stale', 'quota', public.topic_quota(p_user_id));
  end if;
  if r.state <> 'pending' then
    return jsonb_build_object('status', r.state, 'quota', public.topic_quota(p_user_id));
  end if;
  if r.expires_at <= now() then
    update public.topic_generation_requests set state = 'failed', updated_at = now() where user_id = p_user_id and request_id = p_request_id;
    return jsonb_build_object('status', 'stale', 'quota', public.topic_quota(p_user_id));
  end if;
  update public.topic_generation_requests set state = case when p_success then 'succeeded' else 'failed' end, updated_at = now()
    where user_id = p_user_id and request_id = p_request_id;
  if p_success then update public.topic_accounts set used = used + 1 where user_id = p_user_id; end if;
  return jsonb_build_object('status', case when p_success then 'succeeded' else 'failed' end, 'quota', public.topic_quota(p_user_id));
end;
$$;

revoke all on function public.topic_quota(uuid), public.topic_account(uuid), public.topic_reserve(uuid,uuid,text,uuid), public.topic_finish(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.topic_quota(uuid), public.topic_account(uuid), public.topic_reserve(uuid,uuid,text,uuid), public.topic_finish(uuid,uuid,uuid,boolean) to service_role;
commit;
