-- Cadastro de hóspede fora da reserva, dependentes do militar e UH ativa.
-- A diária continua livre, gravada em cada reserva. O titular segue pagando;
-- a idade do dependente na entrada continua na conta da estada.

create table public.guest_dependents (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests (id) on delete cascade,
  full_name text not null,
  birth_date date not null,
  created_at timestamptz not null default now(),
  constraint guest_dependents_name_chk check (char_length(btrim(full_name)) between 3 and 120)
);

create index guest_dependents_guest_idx on public.guest_dependents (guest_id);

alter table public.guest_dependents enable row level security;
alter table public.guest_dependents force row level security;

create policy guest_dependents_select on public.guest_dependents
  for select to authenticated
  using ((select public.is_staff()));

create policy guest_dependents_insert on public.guest_dependents
  for insert to authenticated
  with check ((select public.is_staff()));

create policy guest_dependents_delete on public.guest_dependents
  for delete to authenticated
  using ((select public.is_staff()));

revoke all on table public.guest_dependents from public, anon, authenticated;
grant select, insert, delete on table public.guest_dependents to authenticated;

create trigger guest_dependents_enforce_rpc
  before insert or delete on public.guest_dependents
  for each row execute function private.enforce_staff_rpc();

grant update (active) on table public.rooms to authenticated;

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

  v_name := btrim(coalesce(payload->>'full_name', ''::text));
  v_rank := btrim(coalesce(payload->>'rank', ''::text));
  v_nip := btrim(coalesce(payload->>'nip', ''::text));
  v_om := btrim(coalesce(payload->>'om', ''::text));
  v_phone := btrim(coalesce(payload->>'phone', ''::text));
  v_notes := coalesce(payload->>'notes', ''::text);
  v_deps := payload->'dependents';

  if char_length(v_name) < 3 or char_length(v_rank) < 2 or char_length(v_nip) < 4 then
    raise exception 'Preencha nome, posto ou graduação e NIP do titular.' using errcode = '22023';
  end if;
  if char_length(v_name) > 120 or char_length(v_rank) > 80 or char_length(v_nip) > 20
     or char_length(v_om) > 160 or char_length(v_phone) > 40 or char_length(v_notes) > 2000 then
    raise exception 'Há campos fora do formato esperado.' using errcode = '22023';
  end if;

  if v_deps is not null then
    if jsonb_typeof(v_deps) <> 'array' then
      raise exception 'Dados inválidos.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_deps) > 12 then
      raise exception 'Limite de 12 dependentes por reserva.' using errcode = '22023';
    end if;
  end if;

  if coalesce(payload->>'id', ''::text) = '' then
    insert into public.guests (full_name, rank, nip, om, phone, notes)
    values (v_name, v_rank, v_nip, v_om, v_phone, v_notes)
    returning id into v_id;
  else
    v_id := (payload->>'id')::uuid;
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
  end if;

  if v_deps is not null then
    delete from public.guest_dependents where guest_id = v_id;
    for v_index in 0 .. jsonb_array_length(v_deps) - 1 loop
      v_dep := v_deps -> v_index;
      v_dep_name := btrim(coalesce(v_dep->>'full_name', ''::text));
      if coalesce(v_dep->>'birth_date', ''::text) = '' or char_length(v_dep_name) < 3 then
        raise exception 'Dependente precisa de nome e data de nascimento.' using errcode = '22023';
      end if;
      v_dep_birth := (v_dep->>'birth_date')::date;
      if v_dep_birth > current_date or v_dep_birth < (current_date - interval '120 years')::date then
        raise exception 'Data de nascimento do dependente é inválida.' using errcode = '22023';
      end if;
      insert into public.guest_dependents (guest_id, full_name, birth_date)
      values (v_id, v_dep_name, v_dep_birth);
    end loop;
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

notify pgrst, 'reload schema';
