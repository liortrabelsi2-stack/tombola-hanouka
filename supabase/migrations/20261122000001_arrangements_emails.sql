-- Arrangements secrets de l'organisateur + tirage et e-mails déclenchés chaque minute

alter table prive.participants
  add column force_cible_id uuid references prive.participants (id) on delete set null;
create unique index participants_force_cible on prive.participants (force_cible_id)
  where force_cible_id is not null;

-- Tirage : d'abord les paires imposées par l'organisateur (si les deux sont validés),
-- puis le reste au hasard, sans que personne ne tombe sur lui-même.
create or replace function prive.tirer() returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  donneurs  uuid[];
  receveurs uuid[];
  perm      uuid[];
  n         int;
  ok        boolean;
  essais    int := 0;
begin
  if (select count(*) from participants where valide) < 3 then
    raise exception 'pas_assez';
  end if;
  update participants set cible_id = null where true;
  update participants p set cible_id = p.force_cible_id
  where p.valide and p.force_cible_id is not null and p.force_cible_id <> p.id
    and exists (select 1 from participants c where c.id = p.force_cible_id and c.valide);

  donneurs := array(select id from participants where valide and cible_id is null order by random());
  receveurs := array(select v.id from participants v
                     where v.valide and not exists (select 1 from participants x where x.cible_id = v.id));
  n := coalesce(array_length(donneurs, 1), 0);
  if n <> coalesce(array_length(receveurs, 1), 0) then
    raise exception 'arrangement_impossible';
  end if;
  if n > 0 then
    loop
      essais := essais + 1;
      if essais > 5000 then raise exception 'arrangement_impossible'; end if;
      perm := array(select x from unnest(receveurs) x order by random());
      ok := true;
      for i in 1..n loop
        if perm[i] = donneurs[i] then ok := false; exit; end if;
      end loop;
      exit when ok;
    end loop;
    for i in 1..n loop
      update participants set cible_id = perm[i] where id = donneurs[i];
    end loop;
  end if;
  update tirage set etat = 'tire', tire_le = now() where id = 1;
end $$;

-- Vrai si les choix de l'organisateur laissent un tirage possible.
create or replace function prive.arrangement_ok() returns boolean
language sql stable security definer set search_path = prive, extensions as $$
  with v as (select id, force_cible_id f from participants where valide),
  imp as (select v.id, v.f from v where v.f is not null and v.f <> v.id and v.f in (select id from v)),
  g as (select id from v where id not in (select id from imp)),
  r as (select id from v where id not in (select f from imp))
  select not ((select count(*) from g) = 1 and (select id from g) = (select id from r));
$$;

-- À l'échéance : si le tirage échoue (moins de 3 validés, choix impossibles),
-- on passe « en retard » au lieu de casser le site.
create or replace function prive.verifier_echeance() returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  t tirage;
begin
  select * into t from tirage where id = 1;
  if t.etat <> 'inscriptions' or t.echeance is null or now() < t.echeance then
    return;
  end if;
  select * into t from tirage where id = 1 for update;
  if t.etat <> 'inscriptions' or t.echeance is null or now() < t.echeance then
    return;
  end if;
  begin
    perform prive.tirer();
  exception when others then
    update tirage set etat = 'en_retard' where id = 1;
  end;
end $$;

create or replace function public.admin_etat(p_code text) returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
declare
  t tirage;
begin
  perform prive.admin_ok(p_code);
  perform prive.verifier_echeance();
  select * into t from tirage where id = 1;
  return jsonb_build_object(
    'titre', t.titre, 'echeance', t.echeance, 'etat', t.etat,
    'tire_le', t.tire_le, 'maintenant', now(),
    'arrangement_ok', prive.arrangement_ok(),
    'participants', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'prenom', x.prenom, 'email', x.email, 'souhaits', x.souhaits,
        'valide', x.valide, 'cree_le', x.cree_le, 'force_cible_id', x.force_cible_id,
        'dans_tirage', x.cible_id is not null, 'vu', x.vu_le is not null,
        'email_envoye', x.email_envoye_le is not null)
        order by x.cree_le), '[]'::jsonb) from participants x));
end $$;

-- p_id nul : tout remettre au hasard.
create function public.admin_forcer(p_code text, p_id uuid, p_cible uuid) returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.admin_ok(p_code);
  if (select etat from tirage where id = 1) = 'tire' then raise exception 'deja_tire'; end if;
  if p_id is null then
    update participants set force_cible_id = null where true;
    return;
  end if;
  if p_cible = p_id then raise exception 'soi_meme'; end if;
  if p_cible is not null and exists (
       select 1 from participants where force_cible_id = p_cible and id <> p_id) then
    raise exception 'deja_choisi';
  end if;
  update participants set force_cible_id = p_cible where id = p_id;
end $$;

create or replace function public.admin_lancer(p_code text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.admin_ok(p_code);
  if (select etat from tirage where id = 1 for update) <> 'en_retard' then
    raise exception 'pas_possible';
  end if;
  perform prive.tirer();
end $$;

-- ───────────── E-mails : réservés à la fonction d'envoi (clé secrète) ─────────────

create function public.reclamer_emails() returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
declare
  r jsonb;
begin
  with c as (
    update participants set email_envoye_le = now()
    where cible_id is not null and email_envoye_le is null
    returning id, prenom, email, jeton)
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into r from c;
  return jsonb_build_object('titre', (select titre from tirage where id = 1), 'liste', r);
end $$;

create function public.liberer_email(p_id uuid) returns void
language sql security definer set search_path = prive, extensions as $$
  update participants set email_envoye_le = null where id = p_id;
$$;

revoke all on function public.reclamer_emails() from public, anon, authenticated;
revoke all on function public.liberer_email(uuid) from public, anon, authenticated;
grant execute on function public.reclamer_emails() to service_role;
grant execute on function public.liberer_email(uuid) to service_role;

-- ───────────── Chaque minute : tirage à l'heure dite, puis e-mails ─────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

create function prive.chaque_minute() returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.verifier_echeance();
  if exists (select 1 from participants where cible_id is not null and email_envoye_le is null) then
    perform net.http_post(
      url := 'https://gynzaaksqkmedpapkrqa.supabase.co/functions/v1/envoyer-emails',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
end $$;

select cron.schedule('tombola-chaque-minute', '* * * * *', 'select prive.chaque_minute()');

revoke all on all functions in schema prive from public, anon, authenticated;
