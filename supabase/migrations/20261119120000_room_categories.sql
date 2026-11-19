-- Categorias de UH (apartamento oficial, praça, suíte, etc.) com capacidade máxima.
-- Idempotente. A diária da reserva não muda: a capacidade só gera aviso na recepção.
-- RLS continua restrito a quem está em staff, via is_staff().

create table if not exists public.room_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity integer not null,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_categories_name_unique unique (name),
  constraint room_categories_name_len check (char_length(btrim(name)) between 2 and 80),
  constraint room_categories_capacity_chk check (capacity between 1 and 13),
  constraint room_categories_sort_positive check (sort_order > 0)
);

alter table public.rooms add column if not exists category_id uuid references public.room_categories (id) on delete restrict;

create index if not exists rooms_category_idx on public.rooms (category_id);

insert into public.room_categories (name, capacity, sort_order)
values
  ('Apartamento oficial', 3, 1),
  ('Apartamento praça', 4, 2),
  ('Suíte', 2, 3)
on conflict (name) do nothing;

update public.rooms as room
set category_id = category.id
from public.room_categories as category
where room.category_id is null
  and category.name = case
    when room.sort_order between 1 and 5 then 'Apartamento oficial'
    when room.sort_order between 6 and 10 then 'Apartamento praça'
    else 'Suíte'
  end;

alter table public.room_categories enable row level security;
alter table public.room_categories force row level security;

drop policy if exists room_categories_select on public.room_categories;
create policy room_categories_select on public.room_categories
  for select to authenticated
  using ((select public.is_staff()));

drop policy if exists room_categories_insert on public.room_categories;
create policy room_categories_insert on public.room_categories
  for insert to authenticated
  with check ((select public.is_staff()));

drop policy if exists room_categories_update on public.room_categories;
create policy room_categories_update on public.room_categories
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

revoke all on table public.room_categories from public, anon, authenticated;
grant select, insert, update on table public.room_categories to authenticated;
grant update (category_id) on table public.rooms to authenticated;

drop trigger if exists room_categories_touch on public.room_categories;
create trigger room_categories_touch
  before update on public.room_categories
  for each row execute function private.touch_updated_at();

notify pgrst, 'reload schema';
