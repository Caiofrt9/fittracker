-- FitTracker — atualização: rotinas, tipos de série e duração do treino
-- SQL Editor → + (nova consulta) → cole tudo → Run. Pode rodar mais de uma vez.

create table if not exists public.rotinas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nome text not null,
  exercicios jsonb not null default '[]'::jsonb,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

alter table public.rotinas enable row level security;
drop policy if exists "dono" on public.rotinas;
create policy "dono" on public.rotinas for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.series  add column if not exists tipo_serie text;      -- null/N normal, A aquecimento, F falha
alter table public.treinos add column if not exists duracao_seg int;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.rotinas, public.series, public.treinos to authenticated;
