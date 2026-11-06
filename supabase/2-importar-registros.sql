-- Traz os registros que você já tinha na página do Claude.
-- Rode SÓ DEPOIS de criar sua conta no app (precisa existir um usuário).
-- SQL Editor → New query → Run

with eu as (select id from auth.users order by created_at limit 1)
insert into public.config (user_id, meta_kg) select id, 80 from eu
on conflict (user_id) do update set meta_kg = excluded.meta_kg;

with eu as (select id from auth.users order by created_at limit 1)
insert into public.pesagens (user_id, data, kg)
select id, '2026-11-01', 114.5 from eu
on conflict (user_id, data) do nothing;

with eu as (select id from auth.users order by created_at limit 1)
insert into public.treinos (user_id, data, tipo, nota)
select eu.id, t.data::date, t.tipo, t.nota from eu,
  (values ('2026-11-02','mu','treino leve'),
          ('2026-11-03','mu','treino leve'),
          ('2026-11-04','mt', null)) as t(data, tipo, nota)
on conflict (user_id, data, tipo) do nothing;
