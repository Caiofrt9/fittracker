-- FitTracker — banco de dados
-- Cole tudo no Supabase em: SQL Editor → New query → Run

create table if not exists public.config (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  meta_kg numeric(5,1) not null default 80
);

create table if not exists public.pesagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  kg numeric(5,1) not null check (kg between 30 and 300),
  criado_em timestamptz not null default now(),
  unique (user_id, data)
);

create table if not exists public.treinos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('mt','mu','ou')),
  nota text,
  criado_em timestamptz not null default now(),
  unique (user_id, data, tipo)
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  treino_id uuid not null references public.treinos on delete cascade,
  exercicio text not null,
  ordem int not null default 0,
  serie int not null default 1,
  reps int check (reps >= 0),
  segundos int check (segundos >= 0),
  carga_kg numeric(5,1),
  criado_em timestamptz not null default now()
);

create index if not exists series_treino_idx on public.series (treino_id);
create index if not exists series_exercicio_idx on public.series (user_id, exercicio);

alter table public.config   enable row level security;
alter table public.pesagens enable row level security;
alter table public.treinos  enable row level security;
alter table public.series   enable row level security;

-- Cada pessoa só vê e mexe nos próprios dados
drop policy if exists "dono" on public.config;
drop policy if exists "dono" on public.pesagens;
drop policy if exists "dono" on public.treinos;
drop policy if exists "dono" on public.series;
create policy "dono" on public.config   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dono" on public.pesagens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dono" on public.treinos  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "dono" on public.series   for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permissões para usuários logados (as regras acima continuam limitando cada um aos próprios dados)
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.config, public.pesagens, public.treinos, public.series to authenticated;
