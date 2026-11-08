-- Hotel de Trânsito Rio Negro
-- Recepção interna. Sem reserva pública.
--
-- Autorização: só usuários presentes em public.staff.
-- Não usa user_metadata. A chave service_role não entra no cliente.
-- Sobreposição de quarto é impedida por EXCLUDE, não só pela tela.
-- Rode este arquivo inteiro no SQL Editor de um projeto Supabase novo
-- ou como migração. Não apaga tabelas de outros sistemas.

set search_path = public, extensions, pg_catalog;

create extension if not exists btree_gist with schema extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_len check (char_length(full_name) <= 120)
);

create table public.settings (
  id smallint primary key default 1,
  hotel_name text not null default 'Hotel de Trânsito Rio Negro',
  exemption_age integer not null default 6,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1),
  constraint settings_hotel_name_len check (char_length(btrim(hotel_name)) between 3 and 80),
  constraint settings_exemption_age_range check (exemption_age between 0 and 25)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  name text not null,
  housekeeping text not null default 'limpa',
  notes text not null default '',
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_number_unique unique (number),
  constraint rooms_number_len check (char_length(btrim(number)) between 1 and 10),
  constraint rooms_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint rooms_notes_len check (char_length(notes) <= 500),
  constraint rooms_housekeeping_chk check (housekeeping in ('limpa', 'limpeza')),
  constraint rooms_sort_positive check (sort_order > 0)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  rank text not null,
  nip text not null,
  om text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_nip_unique unique (nip),
  constraint guests_name_chk check (char_length(btrim(full_name)) between 3 and 120),
  constraint guests_rank_chk check (char_length(btrim(rank)) between 2 and 80),
  constraint guests_nip_chk check (char_length(btrim(nip)) between 4 and 20),
  constraint guests_om_chk check (char_length(om) <= 160),
  constraint guests_phone_chk check (char_length(phone) <= 40),
  constraint guests_notes_chk check (char_length(notes) <= 2000)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete restrict,
  guest_id uuid references public.guests (id) on delete restrict,
  check_in date not null,
  check_out date not null,
  daily_rate numeric(12, 2) not null,
  status text not null,
  notes text not null default '',
  block_reason text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_dates_chk check (check_out > check_in and check_out <= check_in + 366),
  constraint reservations_rate_chk check (daily_rate >= 0 and daily_rate <= 100000),
  constraint reservations_status_chk check (status in ('reservada', 'ocupada', 'checkout', 'cancelada', 'bloqueado')),
  constraint reservations_notes_len check (char_length(notes) <= 2000),
  constraint reservations_reason_len check (char_length(block_reason) <= 200),
  constraint reservations_shape_chk check (
    (
      status = 'bloqueado'
      and guest_id is null
      and daily_rate = 0
      and char_length(btrim(block_reason)) >= 3
    )
    or (
      status <> 'bloqueado'
      and guest_id is not null
      and btrim(block_reason) = ''
    )
  )
);

-- Impede overbooking mesmo com duas gravações simultâneas.
-- Canceladas não ocupam o quarto. A saída é exclusiva: o mesmo dia pode
-- receber outra entrada.
alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    room_id with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (status <> 'cancelada');

create table public.reservation_dependents (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  full_name text not null,
  birth_date date not null,
  created_at timestamptz not null default now(),
  constraint dependents_name_chk check (char_length(btrim(full_name)) between 3 and 120)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete restrict,
  amount numeric(12, 2) not null,
  method text not null,
  paid_at date not null,
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_amount_chk check (amount > 0 and amount <= 1000000),
  constraint payments_method_chk check (method in ('dinheiro', 'pix', 'transferencia', 'cartao')),
  constraint payments_notes_len check (char_length(notes) <= 500)
);

create index reservations_check_in_idx on public.reservations (check_in);
create index reservations_check_out_idx on public.reservations (check_out);
create index reservations_guest_idx on public.reservations (guest_id);
create index reservations_room_idx on public.reservations (room_id);
create index dependents_reservation_idx on public.reservation_dependents (reservation_id);
create index payments_reservation_idx on public.payments (reservation_id);
create index guests_name_idx on public.guests (full_name);

-- ---------------------------------------------------------------------------
-- Funções internas (fora da API)
-- ---------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$fn$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create or replace function private.enforce_staff_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if coalesce(pg_catalog.current_setting('htrn.via_rpc', true), ''::text) is distinct from 'on'::text then
    raise exception 'Gravação direta não permitida' using errcode = '42501';
  end if;
  if auth.uid() is null or not exists (
    select 1 from public.staff s where s.user_id = auth.uid()
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

create or replace function private.guard_reservation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status is distinct from old.status then
    if coalesce(pg_catalog.current_setting('htrn.status_change', true), ''::text) is distinct from 'on'::text then
      raise exception 'Transição de status não permitida' using errcode = '22023';
    end if;
    if not (
      (old.status = 'reservada' and new.status in ('ocupada', 'cancelada'))
      or (old.status = 'ocupada' and new.status in ('checkout', 'cancelada'))
      or (old.status = 'bloqueado' and new.status = 'cancelada')
    ) then
      raise exception 'Transição de status não permitida' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$fn$;

create or replace function private.mark_room_for_cleaning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (new.status = 'checkout' and old.status is distinct from 'checkout')
     or (new.status = 'cancelada' and old.status = 'ocupada') then
    update public.rooms
      set housekeeping = 'limpeza'
      where id = new.room_id;
  end if;
  return new;
end;
$fn$;

create or replace function private.guard_dependent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  select r.status into v_status
  from public.reservations r
  where r.id = new.reservation_id;

  if v_status is null or v_status = 'bloqueado' then
    raise exception 'Bloqueio não possui dependentes' using errcode = '22023';
  end if;
  if char_length(btrim(new.full_name)) < 3 or new.birth_date is null then
    raise exception 'Dependente precisa de nome e data de nascimento' using errcode = '22023';
  end if;
  if new.birth_date > current_date or new.birth_date < (current_date - interval '120 years')::date then
    raise exception 'Data de nascimento do dependente é inválida' using errcode = '22023';
  end if;
  return new;
end;
$fn$;

create or replace function private.guard_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  select r.status into v_status
  from public.reservations r
  where r.id = new.reservation_id;

  if v_status is null or v_status in ('bloqueado', 'cancelada') then
    raise exception 'Pagamento não se aplica a este registro' using errcode = '22023';
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- API: security invoker. O RLS e os gatilhos continuam valendo.
-- ---------------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.staff s
    where s.user_id = auth.uid()
  );
$fn$;

create or replace function public.save_stay(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_room uuid;
  v_guest uuid;
  v_kind text;
  v_status text;
  v_in date;
  v_out date;
  v_rate numeric(12, 2);
  v_notes text;
  v_reason text;
  v_existing public.reservations%rowtype;
  v_guest_name text;
  v_rank text;
  v_nip text;
  v_om text;
  v_phone text;
  v_guest_notes text;
  v_deps jsonb;
  v_index integer;
  v_dep jsonb;
  v_dep_name text;
  v_dep_birth date;
begin
  perform set_config('htrn.via_rpc', 'on', true);

  if auth.uid() is null then
    raise exception 'Sessão necessária' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;

  v_kind := payload->>'kind';
  if v_kind not in ('hospedagem', 'bloqueio') then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;

  v_room := (payload->>'room_id')::uuid;
  v_in := (payload->>'check_in')::date;
  v_out := (payload->>'check_out')::date;
  v_notes := coalesce(payload->>'notes', ''::text);
  v_reason := coalesce(payload->>'block_reason', ''::text);
  v_deps := coalesce(payload->'dependents', '[]'::jsonb);

  if v_out <= v_in then
    raise exception 'A saída deve ser posterior à entrada.' using errcode = '22023';
  end if;
  if v_out > v_in + 366 then
    raise exception 'O período não pode passar de 366 noites.' using errcode = '22023';
  end if;
  if char_length(v_notes) > 2000 then
    raise exception 'Há campos fora do formato esperado.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_deps) <> 'array' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_deps) > 12 then
    raise exception 'Limite de 12 dependentes por reserva.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.rooms r where r.id = v_room and r.active) then
    raise exception 'Quarto não encontrado.' using errcode = '02000';
  end if;

  if coalesce(payload->>'id', ''::text) <> '' then
    v_id := (payload->>'id')::uuid;
    select * into v_existing
    from public.reservations
    where id = v_id
    for update;
    if v_existing.id is null then
      raise exception 'Reserva não encontrada.' using errcode = '02000';
    end if;
    if v_existing.status in ('cancelada', 'checkout') then
      raise exception 'Reserva encerrada não pode ser alterada.' using errcode = '22023';
    end if;
    if (v_existing.status = 'bloqueado') <> (v_kind = 'bloqueio') then
      raise exception 'Não é possível converter o tipo do registro.' using errcode = '22023';
    end if;
    v_status := v_existing.status;
  else
    v_id := gen_random_uuid();
    v_status := case when v_kind = 'bloqueio' then 'bloqueado' else 'reservada' end;
  end if;

  if v_existing.id is not null and v_existing.room_id is distinct from v_room then
    if v_existing.room_id < v_room then
      perform 1 from public.rooms where id = v_existing.room_id for update;
      perform 1 from public.rooms where id = v_room for update;
    else
      perform 1 from public.rooms where id = v_room for update;
      perform 1 from public.rooms where id = v_existing.room_id for update;
    end if;
  else
    perform 1 from public.rooms where id = v_room for update;
  end if;

  if v_kind = 'bloqueio' then
    if char_length(btrim(v_reason)) < 3 then
      raise exception 'Informe o motivo do bloqueio.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_deps) > 0 then
      raise exception 'Bloqueio não possui dependentes.' using errcode = '22023';
    end if;

    if v_existing.id is null then
      insert into public.reservations (
        id, room_id, guest_id, check_in, check_out, daily_rate, status, notes, block_reason, created_by
      ) values (
        v_id, v_room, null, v_in, v_out, 0, 'bloqueado', v_notes, btrim(v_reason), auth.uid()
      );
    else
      update public.reservations
        set room_id = v_room,
            check_in = v_in,
            check_out = v_out,
            notes = v_notes,
            block_reason = btrim(v_reason)
        where id = v_id;
    end if;
    return v_id;
  end if;

  if coalesce(payload->>'daily_rate', ''::text) = '' then
    raise exception 'Informe a diária do período.' using errcode = '22023';
  end if;
  v_rate := round((payload->>'daily_rate')::numeric, 2);
  if v_rate < 0 or v_rate > 100000 then
    raise exception 'Informe a diária do período.' using errcode = '22023';
  end if;

  v_guest_name := btrim(coalesce(payload#>>'{guest,full_name}', ''::text));
  v_rank := btrim(coalesce(payload#>>'{guest,rank}', ''::text));
  v_nip := btrim(coalesce(payload#>>'{guest,nip}', ''::text));
  v_om := btrim(coalesce(payload#>>'{guest,om}', ''::text));
  v_phone := btrim(coalesce(payload#>>'{guest,phone}', ''::text));
  v_guest_notes := coalesce(payload#>>'{guest,notes}', ''::text);

  if char_length(v_guest_name) < 3 or char_length(v_rank) < 2 or char_length(v_nip) < 4 then
    raise exception 'Preencha nome, posto ou graduação e NIP do titular.' using errcode = '22023';
  end if;
  if char_length(v_guest_name) > 120 or char_length(v_rank) > 80 or char_length(v_nip) > 20
     or char_length(v_om) > 160 or char_length(v_phone) > 40 or char_length(v_guest_notes) > 2000 then
    raise exception 'Há campos fora do formato esperado.' using errcode = '22023';
  end if;

  if coalesce(payload#>>'{guest,id}', ''::text) <> '' then
    v_guest := (payload#>>'{guest,id}')::uuid;
    update public.guests
      set full_name = v_guest_name,
          rank = v_rank,
          nip = v_nip,
          om = v_om,
          phone = v_phone,
          notes = v_guest_notes
      where id = v_guest;
    if not found then
      raise exception 'Hóspede não encontrado.' using errcode = '02000';
    end if;
  else
    select g.id into v_guest from public.guests g where g.nip = v_nip;
    if v_guest is null then
      insert into public.guests (full_name, rank, nip, om, phone, notes)
      values (v_guest_name, v_rank, v_nip, v_om, v_phone, v_guest_notes)
      returning id into v_guest;
    else
      update public.guests
        set full_name = v_guest_name,
            rank = v_rank,
            om = v_om,
            phone = v_phone,
            notes = v_guest_notes
        where id = v_guest;
    end if;
  end if;

  if v_existing.id is null then
    insert into public.reservations (
      id, room_id, guest_id, check_in, check_out, daily_rate, status, notes, block_reason, created_by
    ) values (
      v_id, v_room, v_guest, v_in, v_out, v_rate, 'reservada', v_notes, '', auth.uid()
    );
  else
    update public.reservations
      set room_id = v_room,
          guest_id = v_guest,
          check_in = v_in,
          check_out = v_out,
          daily_rate = v_rate,
          notes = v_notes,
          block_reason = ''
      where id = v_id;
    delete from public.reservation_dependents where reservation_id = v_id;
  end if;

  for v_index in 0 .. jsonb_array_length(v_deps) - 1 loop
    v_dep := v_deps -> v_index;
    v_dep_name := btrim(coalesce(v_dep->>'full_name', ''::text));
    if coalesce(v_dep->>'birth_date', ''::text) = '' then
      raise exception 'Dependente precisa de nome e data de nascimento.' using errcode = '22023';
    end if;
    v_dep_birth := (v_dep->>'birth_date')::date;
    if char_length(v_dep_name) < 3 then
      raise exception 'Dependente precisa de nome e data de nascimento.' using errcode = '22023';
    end if;
    insert into public.reservation_dependents (reservation_id, full_name, birth_date)
    values (v_id, v_dep_name, v_dep_birth);
  end loop;

  return v_id;
exception
  when exclusion_violation then
    raise exception 'Este quarto já está ocupado, reservado ou bloqueado no período.' using errcode = '23P01';
  when unique_violation then
    raise exception 'NIP já cadastrado para outro militar.' using errcode = '23505';
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Dados inválidos.' using errcode = '22023';
  when check_violation then
    raise exception 'Há campos fora do formato esperado.' using errcode = '23514';
end;
$fn$;

create or replace function public.set_stay_status(p_id uuid, p_status text)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_status text;
begin
  perform set_config('htrn.via_rpc', 'on', true);
  perform set_config('htrn.status_change', 'on', true);

  if auth.uid() is null then
    raise exception 'Sessão necessária' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_status not in ('ocupada', 'checkout', 'cancelada') then
    raise exception 'Transição de status não permitida' using errcode = '22023';
  end if;

  select status into v_status
  from public.reservations
  where id = p_id
  for update;

  if v_status is null then
    raise exception 'Reserva não encontrada.' using errcode = '02000';
  end if;

  update public.reservations
    set status = p_status
    where id = p_id;
end;
$fn$;

create or replace function public.add_payment(
  p_reservation_id uuid,
  p_amount numeric,
  p_method text,
  p_paid_at date,
  p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_status text;
  v_notes text := coalesce(p_notes, ''::text);
begin
  perform set_config('htrn.via_rpc', 'on', true);

  if auth.uid() is null then
    raise exception 'Sessão necessária' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Informe um valor de pagamento válido.' using errcode = '22023';
  end if;
  if p_method not in ('dinheiro', 'pix', 'transferencia', 'cartao') then
    raise exception 'Forma de pagamento inválida.' using errcode = '22023';
  end if;
  if p_paid_at is null then
    raise exception 'Informe um valor de pagamento válido.' using errcode = '22023';
  end if;
  if char_length(v_notes) > 500 then
    raise exception 'Há campos fora do formato esperado.' using errcode = '22023';
  end if;

  select status into v_status
  from public.reservations
  where id = p_reservation_id
  for update;

  if v_status is null then
    raise exception 'Reserva não encontrada.' using errcode = '02000';
  end if;
  if v_status not in ('reservada', 'ocupada', 'checkout') then
    raise exception 'Pagamento não se aplica a este registro.' using errcode = '22023';
  end if;

  insert into public.payments (reservation_id, amount, method, paid_at, notes, created_by)
  values (p_reservation_id, round(p_amount, 2), p_method, p_paid_at, v_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$fn$;

create or replace function public.delete_payment(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  perform set_config('htrn.via_rpc', 'on', true);

  if auth.uid() is null then
    raise exception 'Sessão necessária' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  delete from public.payments where id = p_id;
  if not found then
    raise exception 'Pagamento não se aplica a este registro.' using errcode = '02000';
  end if;
end;
$fn$;

create or replace function public.save_guest(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_name text;
  v_rank text;
  v_nip text;
  v_om text;
  v_phone text;
  v_notes text;
begin
  perform set_config('htrn.via_rpc', 'on', true);

  if auth.uid() is null then
    raise exception 'Sessão necessária' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' or coalesce(payload->>'id', ''::text) = '' then
    raise exception 'Hóspede não encontrado.' using errcode = '02000';
  end if;

  v_id := (payload->>'id')::uuid;
  v_name := btrim(coalesce(payload->>'full_name', ''::text));
  v_rank := btrim(coalesce(payload->>'rank', ''::text));
  v_nip := btrim(coalesce(payload->>'nip', ''::text));
  v_om := btrim(coalesce(payload->>'om', ''::text));
  v_phone := btrim(coalesce(payload->>'phone', ''::text));
  v_notes := coalesce(payload->>'notes', ''::text);

  if char_length(v_name) < 3 or char_length(v_rank) < 2 or char_length(v_nip) < 4 then
    raise exception 'Preencha nome, posto ou graduação e NIP do titular.' using errcode = '22023';
  end if;

  update public.guests
    set full_name = v_name,
        rank = v_rank,
        nip = v_nip,
        om = v_om,
        phone = v_phone,
        notes = v_notes
    where id = v_id;

  if not found then
    raise exception 'Hóspede não encontrado.' using errcode = '02000';
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'NIP já cadastrado para outro militar.' using errcode = '23505';
  when invalid_text_representation then
    raise exception 'Dados inválidos.' using errcode = '22023';
  when check_violation then
    raise exception 'Há campos fora do formato esperado.' using errcode = '23514';
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.touch_updated_at();

create trigger settings_touch
  before update on public.settings
  for each row execute function private.touch_updated_at();

create trigger rooms_touch
  before update on public.rooms
  for each row execute function private.touch_updated_at();

create trigger guests_touch
  before update on public.guests
  for each row execute function private.touch_updated_at();

create trigger reservations_touch
  before update on public.reservations
  for each row execute function private.touch_updated_at();

create trigger guests_enforce_rpc
  before insert or update or delete on public.guests
  for each row execute function private.enforce_staff_rpc();

create trigger reservations_enforce_rpc
  before insert or update on public.reservations
  for each row execute function private.enforce_staff_rpc();

create trigger reservations_guard_status
  before update on public.reservations
  for each row execute function private.guard_reservation_status();

create trigger reservations_cleaning
  after update on public.reservations
  for each row execute function private.mark_room_for_cleaning();

create trigger dependents_enforce_rpc
  before insert or delete on public.reservation_dependents
  for each row execute function private.enforce_staff_rpc();

create trigger dependents_guard
  before insert or update on public.reservation_dependents
  for each row execute function private.guard_dependent();

create trigger payments_enforce_rpc
  before insert or delete on public.payments
  for each row execute function private.enforce_staff_rpc();

create trigger payments_guard
  before insert on public.payments
  for each row execute function private.guard_payment();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.enforce_staff_rpc() from public, anon, authenticated;
revoke all on function private.guard_reservation_status() from public, anon, authenticated;
revoke all on function private.mark_room_for_cleaning() from public, anon, authenticated;
revoke all on function private.guard_dependent() from public, anon, authenticated;
revoke all on function private.guard_payment() from public, anon, authenticated;

revoke all on function public.is_staff() from public, anon;
revoke all on function public.save_stay(jsonb) from public, anon;
revoke all on function public.set_stay_status(uuid, text) from public, anon;
revoke all on function public.add_payment(uuid, numeric, text, date, text) from public, anon;
revoke all on function public.delete_payment(uuid) from public, anon;
revoke all on function public.save_guest(jsonb) from public, anon;

grant execute on function public.is_staff() to authenticated;
grant execute on function public.save_stay(jsonb) to authenticated;
grant execute on function public.set_stay_status(uuid, text) to authenticated;
grant execute on function public.add_payment(uuid, numeric, text, date, text) to authenticated;
grant execute on function public.delete_payment(uuid) to authenticated;
grant execute on function public.save_guest(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Semente operacional: 14 quartos e a regra de isenção. Sem hóspedes.
-- ---------------------------------------------------------------------------

insert into public.settings (id, hotel_name, exemption_age)
values (1, 'Hotel de Trânsito Rio Negro', 6);

insert into public.rooms (number, name, sort_order)
select lpad(n::text, 2, '0'), 'Quarto ' || lpad(n::text, 2, '0'), n
from generate_series(1, 14) as n;

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS. Nenhum papel anon recebe política nem GRANT.
-- ---------------------------------------------------------------------------

alter table public.staff enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_dependents enable row level security;
alter table public.payments enable row level security;

alter table public.staff force row level security;
alter table public.profiles force row level security;
alter table public.settings force row level security;
alter table public.rooms force row level security;
alter table public.guests force row level security;
alter table public.reservations force row level security;
alter table public.reservation_dependents force row level security;
alter table public.payments force row level security;

create policy staff_select_own on public.staff
  for select to authenticated
  using (user_id = auth.uid());

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy settings_select on public.settings
  for select to authenticated
  using (public.is_staff());

create policy settings_update on public.settings
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy rooms_select on public.rooms
  for select to authenticated
  using (public.is_staff());

create policy rooms_update on public.rooms
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy guests_select on public.guests
  for select to authenticated
  using (public.is_staff());

create policy guests_insert on public.guests
  for insert to authenticated
  with check (public.is_staff());

create policy guests_update on public.guests
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy reservations_select on public.reservations
  for select to authenticated
  using (public.is_staff());

create policy reservations_insert on public.reservations
  for insert to authenticated
  with check (public.is_staff());

create policy reservations_update on public.reservations
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy dependents_select on public.reservation_dependents
  for select to authenticated
  using (public.is_staff());

create policy dependents_insert on public.reservation_dependents
  for insert to authenticated
  with check (public.is_staff());

create policy dependents_delete on public.reservation_dependents
  for delete to authenticated
  using (public.is_staff());

create policy payments_select on public.payments
  for select to authenticated
  using (public.is_staff());

create policy payments_insert on public.payments
  for insert to authenticated
  with check (public.is_staff());

create policy payments_delete on public.payments
  for delete to authenticated
  using (public.is_staff());

revoke all on table public.staff from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.settings from public, anon, authenticated;
revoke all on table public.rooms from public, anon, authenticated;
revoke all on table public.guests from public, anon, authenticated;
revoke all on table public.reservations from public, anon, authenticated;
revoke all on table public.reservation_dependents from public, anon, authenticated;
revoke all on table public.payments from public, anon, authenticated;

grant select on table public.staff to authenticated;
grant select, insert on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;
grant select on table public.settings to authenticated;
grant update (exemption_age) on table public.settings to authenticated;
grant select on table public.rooms to authenticated;
grant update (name, number, notes, housekeeping) on table public.rooms to authenticated;
grant select, insert, update on table public.guests to authenticated;
grant select, insert, update on table public.reservations to authenticated;
grant select, insert, delete on table public.reservation_dependents to authenticated;
grant select, insert, delete on table public.payments to authenticated;

notify pgrst, 'reload schema';
