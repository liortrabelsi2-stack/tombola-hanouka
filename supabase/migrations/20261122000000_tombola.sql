-- Tombola de Hanouka
-- Les tables vivent dans le schéma « prive », invisible depuis Internet.
-- Le site ne passe que par les fonctions du schéma « public » ci-dessous.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists prive;

create table prive.tirage (
  id          int primary key default 1 check (id = 1),
  titre       text not null default 'Tombola de Hanouka',
  echeance    timestamptz,
  etat        text not null default 'inscriptions'
              check (etat in ('inscriptions', 'en_retard', 'tire')),
  tire_le     timestamptz,
  admin_hash  text not null default '!'
);
insert into prive.tirage (id) values (1);

create table prive.participants (
  id               uuid primary key default gen_random_uuid(),
  jeton            uuid not null unique default gen_random_uuid(),
  prenom           text not null,
  email            text not null,
  souhaits         text not null default '',
  valide           boolean not null default false,
  cible_id         uuid references prive.participants (id),
  vu_le            timestamptz,
  email_envoye_le  timestamptz,
  cree_le          timestamptz not null default now()
);
create unique index participants_email on prive.participants (lower(email));

create table prive.messages (
  id          uuid primary key default gen_random_uuid(),
  de_id       uuid not null references prive.participants (id) on delete cascade,
  question    text not null,
  reponse     text,
  cree_le     timestamptz not null default now(),
  repondu_le  timestamptz
);

alter table prive.tirage enable row level security;
alter table prive.participants enable row level security;
alter table prive.messages enable row level security;

-- ───────────────────────── Fonctions internes ─────────────────────────

-- Tire au sort : chaque inscrit validé reçoit quelqu'un d'autre que lui-même.
create function prive.tirer() returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  ids  uuid[];
  perm uuid[];
  n    int;
  ok   boolean;
begin
  ids := array(select id from participants where valide order by random());
  n := coalesce(array_length(ids, 1), 0);
  if n < 3 then
    raise exception 'pas_assez';
  end if;
  loop
    perm := array(select x from unnest(ids) x order by random());
    ok := true;
    for i in 1..n loop
      if perm[i] = ids[i] then ok := false; exit; end if;
    end loop;
    exit when ok;
  end loop;
  for i in 1..n loop
    update participants set cible_id = perm[i] where id = ids[i];
  end loop;
  update tirage set etat = 'tire', tire_le = now() where id = 1;
end $$;

-- À l'échéance : tirage automatique s'il y a au moins 3 validés,
-- sinon on attend l'organisateur.
create function prive.verifier_echeance() returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  t tirage;
  n int;
begin
  select * into t from tirage where id = 1;
  if t.etat <> 'inscriptions' or t.echeance is null or now() < t.echeance then
    return;
  end if;
  select * into t from tirage where id = 1 for update;
  if t.etat <> 'inscriptions' or t.echeance is null or now() < t.echeance then
    return;
  end if;
  select count(*) into n from participants where valide;
  if n >= 3 then
    perform prive.tirer();
  else
    update tirage set etat = 'en_retard' where id = 1;
  end if;
end $$;

create function prive.admin_ok(p_code text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  h text;
begin
  select admin_hash into h from tirage where id = 1;
  if p_code is null or h = '!' or crypt(p_code, h) <> h then
    perform pg_sleep(1);
    raise exception 'code_invalide';
  end if;
end $$;

-- ───────────────────────── Fonctions du site ─────────────────────────

create function public.etat_public() returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
declare
  t tirage;
begin
  perform prive.verifier_echeance();
  select * into t from tirage where id = 1;
  return jsonb_build_object(
    'titre', t.titre, 'echeance', t.echeance, 'etat', t.etat, 'maintenant', now());
end $$;

create function public.inscrire(p_prenom text, p_email text, p_souhaits text)
returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
declare
  t tirage;
  v_prenom text := btrim(regexp_replace(coalesce(p_prenom, ''), '\s+', ' ', 'g'));
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_souhaits text := btrim(coalesce(p_souhaits, ''));
  v_jeton uuid;
begin
  perform prive.verifier_echeance();
  select * into t from tirage where id = 1;
  if t.etat <> 'inscriptions' then raise exception 'inscriptions_fermees'; end if;
  if char_length(v_prenom) < 1 or char_length(v_prenom) > 30 then
    raise exception 'prenom_invalide';
  end if;
  if char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalide';
  end if;
  if char_length(v_souhaits) > 600 then raise exception 'souhaits_trop_longs'; end if;
  if (select count(*) from participants) >= 60 then raise exception 'complet'; end if;
  if exists (select 1 from participants where lower(email) = v_email) then
    raise exception 'deja_inscrit';
  end if;
  insert into participants (prenom, email, souhaits)
  values (v_prenom, v_email, v_souhaits)
  returning jeton into v_jeton;
  return jsonb_build_object('jeton', v_jeton);
end $$;

create function public.mon_etat(p_jeton uuid) returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
declare
  t tirage;
  p participants;
  c participants;
  r jsonb;
begin
  perform prive.verifier_echeance();
  select * into t from tirage where id = 1;
  select * into p from participants where jeton = p_jeton;
  if not found then raise exception 'inconnu'; end if;

  r := jsonb_build_object(
    'titre', t.titre, 'echeance', t.echeance, 'etat', t.etat, 'maintenant', now(),
    'prenom', p.prenom, 'souhaits', p.souhaits);

  if t.etat <> 'tire' then
    return r;
  end if;

  r := r || jsonb_build_object('participe', p.cible_id is not null);
  if p.cible_id is null then
    return r;
  end if;

  select * into c from participants where id = p.cible_id;
  return r || jsonb_build_object(
    'vu', p.vu_le is not null,
    'cible', jsonb_build_object('prenom', c.prenom, 'souhaits', c.souhaits),
    'roue', (select coalesce(jsonb_agg(x.prenom order by x.prenom, x.id), '[]'::jsonb)
             from participants x where x.cible_id is not null and x.id <> p.id),
    'cible_index', (select count(*) from participants x
                    where x.cible_id is not null and x.id <> p.id
                      and (x.prenom, x.id) < (c.prenom, c.id)),
    'mes_questions', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', m.id, 'question', m.question, 'reponse', m.reponse)
                        order by m.cree_le), '[]'::jsonb)
                      from messages m where m.de_id = p.id),
    'questions_recues', (select coalesce(jsonb_agg(jsonb_build_object(
                           'id', m.id, 'question', m.question, 'reponse', m.reponse)
                           order by m.cree_le), '[]'::jsonb)
                         from messages m join participants d on d.id = m.de_id
                         where d.cible_id = p.id));
end $$;

create function public.marquer_vu(p_jeton uuid) returns void
language sql security definer set search_path = prive, extensions as $$
  update participants set vu_le = coalesce(vu_le, now())
  where jeton = p_jeton and cible_id is not null;
$$;

create function public.maj_souhaits(p_jeton uuid, p_souhaits text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  v text := btrim(coalesce(p_souhaits, ''));
begin
  if char_length(v) > 600 then raise exception 'souhaits_trop_longs'; end if;
  update participants set souhaits = v where jeton = p_jeton;
  if not found then raise exception 'inconnu'; end if;
end $$;

create function public.poser_question(p_jeton uuid, p_texte text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  p participants;
  v text := btrim(coalesce(p_texte, ''));
begin
  select * into p from participants where jeton = p_jeton;
  if not found then raise exception 'inconnu'; end if;
  if p.cible_id is null then raise exception 'pas_de_tirage'; end if;
  if char_length(v) < 1 or char_length(v) > 300 then raise exception 'texte_invalide'; end if;
  if (select count(*) from messages where de_id = p.id) >= 10 then
    raise exception 'trop_de_questions';
  end if;
  insert into messages (de_id, question) values (p.id, v);
end $$;

create function public.repondre(p_jeton uuid, p_id uuid, p_texte text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  p participants;
  v text := btrim(coalesce(p_texte, ''));
begin
  select * into p from participants where jeton = p_jeton;
  if not found then raise exception 'inconnu'; end if;
  if char_length(v) < 1 or char_length(v) > 300 then raise exception 'texte_invalide'; end if;
  update messages m set reponse = v, repondu_le = now()
  from participants d
  where m.id = p_id and d.id = m.de_id and d.cible_id = p.id;
  if not found then raise exception 'inconnu'; end if;
end $$;

-- ───────────────────────── Organisateur ─────────────────────────
-- Aucune de ces fonctions ne renvoie qui offre à qui.

create function public.admin_etat(p_code text) returns jsonb
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
    'participants', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'prenom', x.prenom, 'email', x.email, 'souhaits', x.souhaits,
        'valide', x.valide, 'cree_le', x.cree_le,
        'dans_tirage', x.cible_id is not null, 'vu', x.vu_le is not null)
        order by x.cree_le), '[]'::jsonb) from participants x));
end $$;

create function public.admin_valider(p_code text, p_id uuid, p_valide boolean) returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.admin_ok(p_code);
  if (select etat from tirage where id = 1) = 'tire' then raise exception 'deja_tire'; end if;
  if p_id is null then
    update participants set valide = p_valide where true;
  else
    update participants set valide = p_valide where id = p_id;
  end if;
end $$;

create function public.admin_renommer(p_code text, p_id uuid, p_prenom text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  v text := btrim(regexp_replace(coalesce(p_prenom, ''), '\s+', ' ', 'g'));
begin
  perform prive.admin_ok(p_code);
  if char_length(v) < 1 or char_length(v) > 30 then raise exception 'prenom_invalide'; end if;
  update participants set prenom = v where id = p_id;
end $$;

create function public.admin_supprimer(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.admin_ok(p_code);
  if (select etat from tirage where id = 1) = 'tire' then raise exception 'deja_tire'; end if;
  delete from participants where id = p_id;
end $$;

create function public.admin_reglages(p_code text, p_titre text, p_echeance timestamptz)
returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  v text := btrim(coalesce(p_titre, ''));
begin
  perform prive.admin_ok(p_code);
  if (select etat from tirage where id = 1) = 'tire' then raise exception 'deja_tire'; end if;
  if char_length(v) < 1 or char_length(v) > 60 then raise exception 'titre_invalide'; end if;
  update tirage set titre = v, echeance = p_echeance,
    etat = case when p_echeance is null or p_echeance > now() then 'inscriptions' else etat end
  where id = 1;
end $$;

create function public.admin_lancer(p_code text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.admin_ok(p_code);
  if (select etat from tirage where id = 1 for update) <> 'en_retard' then
    raise exception 'pas_possible';
  end if;
  perform prive.tirer();
end $$;

create function public.admin_reinitialiser(p_code text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.admin_ok(p_code);
  delete from messages where true;
  update participants set cible_id = null, vu_le = null, email_envoye_le = null where true;
  update tirage set etat = 'inscriptions', echeance = null, tire_le = null where id = 1;
end $$;

revoke all on all functions in schema prive from public, anon, authenticated;
revoke all on all functions in schema public from public;
grant execute on all functions in schema public to anon, authenticated;
