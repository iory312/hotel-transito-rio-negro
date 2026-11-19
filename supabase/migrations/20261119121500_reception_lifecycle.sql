-- Recepção: pré-reserva, motivo de cancelamento, tipo de bloqueio,
-- formas de pagamento e a mesma regra de não sobreposição para reserva e bloqueio.
-- Os status já usados (reservada, ocupada, checkout, cancelada, bloqueado)
-- continuam válidos. A diária segue livre, por reserva.

alter table public.reservations add column if not exists block_kind text not null default '';
alter table public.reservations add column if not exists cancel_reason text not null default '';

update public.reservations
set block_kind = case
  when block_reason ilike '%interdi%' then 'interdicao'
  when block_reason ilike '% OM%' or block_reason ilike '%organiza%' then 'om'
  when block_reason ilike '%manuten%' then 'manutencao'
  else 'outro'
end
where status = 'bloqueado'
  and block_kind = '';

alter table public.reservations drop constraint if exists reservations_status_chk;
alter table public.reservations add constraint reservations_status_chk
  check (status in ('pre_reserva', 'reservada', 'ocupada', 'checkout', 'cancelada', 'bloqueado'));

alter table public.reservations drop constraint if exists reservations_block_kind_chk;
alter table public.reservations add constraint reservations_block_kind_chk
  check (block_kind in ('', 'manutencao', 'interdicao', 'om', 'outro'));

alter table public.reservations drop constraint if exists reservations_cancel_reason_len;
alter table public.reservations add constraint reservations_cancel_reason_len
  check (char_length(cancel_reason) <= 200);

-- Bloqueio cancelado fica no histórico (hóspede nulo). Reserva de hóspede continua exigindo titular.
alter table public.reservations drop constraint if exists reservations_shape_chk;
alter table public.reservations add constraint reservations_shape_chk check (
  (
    status = 'bloqueado'
    and guest_id is null
    and daily_rate = 0
    and char_length(btrim(block_reason)) >= 3
    and block_kind in ('manutencao', 'interdicao', 'om', 'outro')
  )
  or (
    status <> 'bloqueado'
    and guest_id is not null
    and btrim(block_reason) = ''
  )
  or (
    status = 'cancelada'
    and guest_id is null
  )
);

alter table public.payments drop constraint if exists payments_method_chk;
alter table public.payments add constraint payments_method_chk
  check (method in ('dinheiro', 'pix', 'transferencia', 'cartao', 'folha', 'outro'));

create index if not exists reservations_room_span_idx
  on public.reservations (room_id, check_in, check_out)
  where status <> 'cancelada';

create index if not exists reservations_status_idx on public.reservations (status, check_in);

-- A exclusão reservations_no_overlap continua sendo o bloqueio concorrente.
-- O gatilho repete a regra para reserva e bloqueio com a mensagem da recepção.
create or replace function private.prevent_room_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status = 'cancelada' then
    return new;
  end if;
  if exists (
    select 1
    from public.reservations as reservation
    where reservation.room_id = new.room_id
      and reservation.id is distinct from new.id
      and reservation.status <> 'cancelada'
      and daterange(reservation.check_in, reservation.check_out, '[)')
        && daterange(new.check_in, new.check_out, '[)')
  ) then
    raise exception 'Este quarto já está ocupado, reservado ou bloqueado no período.'
      using errcode = '23P01';
  end if;
  return new;
end;
$fn$;

drop trigger if exists reservations_prevent_overlap on public.reservations;
create trigger reservations_prevent_overlap
  before insert or update on public.reservations
  for each row execute function private.prevent_room_overlap();

revoke all on function private.prevent_room_overlap() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_no_overlap') then
    alter table public.reservations
      add constraint reservations_no_overlap
      exclude using gist (
        room_id with =,
        daterange(check_in, check_out, '[)') with &&
      )
      where (status <> 'cancelada');
  end if;
end $$;

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
      (old.status = 'pre_reserva' and new.status in ('reservada', 'ocupada', 'cancelada'))
      or (old.status = 'reservada' and new.status in ('ocupada', 'cancelada'))
      or (old.status = 'ocupada' and new.status in ('checkout', 'cancelada'))
      or (old.status = 'bloqueado' and new.status = 'cancelada')
    ) then
      raise exception 'Transição de status não permitida' using errcode = '22023';
    end if;
  end if;
  return new;
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
  if p_status not in ('reservada', 'ocupada', 'checkout', 'cancelada') then
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

create or replace function public.cancel_stay(p_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_status text;
  v_reason text := btrim(coalesce(p_reason, ''::text));
begin
  perform set_config('htrn.via_rpc', 'on', true);
  perform set_config('htrn.status_change', 'on', true);

  if auth.uid() is null then
    raise exception 'Sessão necessária' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 200 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
  end if;

  select status into v_status
  from public.reservations
  where id = p_id
  for update;

  if v_status is null then
    raise exception 'Reserva não encontrada.' using errcode = '02000';
  end if;
  if v_status = 'bloqueado' then
    raise exception 'Bloqueio libera pela ação de desbloquear.' using errcode = '22023';
  end if;

  update public.reservations
    set status = 'cancelada',
        cancel_reason = v_reason
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
  if p_method not in ('dinheiro', 'pix', 'transferencia', 'cartao', 'folha', 'outro') then
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
  if v_status not in ('pre_reserva', 'reservada', 'ocupada', 'checkout') then
    raise exception 'Pagamento não se aplica a este registro.' using errcode = '22023';
  end if;

  insert into public.payments (reservation_id, amount, method, paid_at, notes, created_by)
  values (p_reservation_id, round(p_amount, 2), p_method, p_paid_at, v_notes, auth.uid())
  returning id into v_id;

  return v_id;
end;
$fn$;

-- save_stay aceita o payload antigo. booking e block_kind são opcionais.
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
  v_booking text;
  v_block_kind text;
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

  v_booking := coalesce(payload->>'booking', 'reservada');
  if v_booking not in ('pre_reserva', 'reservada') then
    v_booking := 'reservada';
  end if;
  v_block_kind := coalesce(payload->>'block_kind', '');
  if v_block_kind not in ('manutencao', 'interdicao', 'om', 'outro') then
    v_block_kind := '';
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

  if not exists (select 1 from public.rooms as room where room.id = v_room and room.active) then
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
    v_status := case
      when v_kind = 'bloqueio' then 'bloqueado'
      when v_booking = 'pre_reserva' then 'pre_reserva'
      else 'reservada'
    end;
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
    if v_block_kind = '' then
      v_block_kind := 'outro';
    end if;

    if v_existing.id is null then
      insert into public.reservations (
        id, room_id, guest_id, check_in, check_out, daily_rate, status, notes, block_reason, block_kind, created_by
      ) values (
        v_id, v_room, null, v_in, v_out, 0, 'bloqueado', v_notes, btrim(v_reason), v_block_kind, auth.uid()
      );
    else
      update public.reservations
        set room_id = v_room,
            check_in = v_in,
            check_out = v_out,
            notes = v_notes,
            block_reason = btrim(v_reason),
            block_kind = v_block_kind
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
    select guest.id into v_guest from public.guests as guest where guest.nip = v_nip;
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
      id, room_id, guest_id, check_in, check_out, daily_rate, status, notes, block_reason, block_kind, created_by
    ) values (
      v_id, v_room, v_guest, v_in, v_out, v_rate, v_status, v_notes, '', '', auth.uid()
    );
  else
    update public.reservations
      set room_id = v_room,
          guest_id = v_guest,
          check_in = v_in,
          check_out = v_out,
          daily_rate = v_rate,
          notes = v_notes,
          block_reason = '',
          block_kind = ''
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

revoke all on function public.cancel_stay(uuid, text) from public, anon;
grant execute on function public.cancel_stay(uuid, text) to authenticated;

notify pgrst, 'reload schema';
