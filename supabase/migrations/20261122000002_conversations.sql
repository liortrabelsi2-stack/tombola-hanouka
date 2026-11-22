-- Messages anonymes : vraie conversation dans les deux sens entre celui qui offre
-- et celui qui reçoit, avec « lu / non lu », et lecture possible par l'organisateur.

drop function if exists public.poser_question(uuid, text);
drop function if exists public.repondre(uuid, uuid, text);
drop table if exists prive.messages;

-- Une conversation = un donneur (celui qui offre) et sa cible.
-- du_donneur : vrai si le message vient de celui qui offre.
create table prive.mots (
  id          uuid primary key default gen_random_uuid(),
  donneur_id  uuid not null references prive.participants (id) on delete cascade,
  du_donneur  boolean not null,
  texte       text not null,
  cree_le     timestamptz not null default now(),
  lu_le       timestamptz
);
create index mots_donneur on prive.mots (donneur_id, cree_le);
alter table prive.mots enable row level security;

-- La conversation d'un donneur, vue d'un côté (de_moi = écrit par ce côté).
create function prive.fil(p_donneur uuid, p_cote_donneur boolean) returns jsonb
language sql stable security definer set search_path = prive, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'texte', m.texte, 'de_moi', m.du_donneur = p_cote_donneur,
           'lu', m.lu_le is not null, 'cree_le', m.cree_le) order by m.cree_le), '[]'::jsonb)
  from mots m where m.donneur_id = p_donneur;
$$;

create or replace function public.mon_etat(p_jeton uuid) returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
declare
  t tirage;
  p participants;
  c participants;
  g uuid;
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
  select id into g from participants where cible_id = p.id;
  return r || jsonb_build_object(
    'vu', p.vu_le is not null,
    'cible', jsonb_build_object('prenom', c.prenom, 'souhaits', c.souhaits),
    'roue', (select coalesce(jsonb_agg(x.prenom order by x.prenom, x.id), '[]'::jsonb)
             from participants x where x.cible_id is not null and x.id <> p.id),
    'cible_index', (select count(*) from participants x
                    where x.cible_id is not null and x.id <> p.id
                      and (x.prenom, x.id) < (c.prenom, c.id)),
    'fil_cible', prive.fil(p.id, true),
    'fil_gateur', case when g is null then '[]'::jsonb else prive.fil(g, false) end);
end $$;

-- p_vers : 'cible' (la personne que je gâte) ou 'gateur' (la personne qui me gâte)
create function public.envoyer_mot(p_jeton uuid, p_vers text, p_texte text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  p  participants;
  d  uuid;
  du boolean;
  v  text := btrim(coalesce(p_texte, ''));
begin
  select * into p from participants where jeton = p_jeton;
  if not found then raise exception 'inconnu'; end if;
  if (select etat from tirage where id = 1) <> 'tire' or p.cible_id is null then
    raise exception 'pas_de_tirage';
  end if;
  if char_length(v) < 1 or char_length(v) > 300 then raise exception 'texte_invalide'; end if;
  if p_vers = 'cible' then
    d := p.id; du := true;
  elsif p_vers = 'gateur' then
    select id into d from participants where cible_id = p.id;
    du := false;
    if d is null then raise exception 'pas_de_tirage'; end if;
  else
    raise exception 'inconnu';
  end if;
  if (select count(*) from mots where donneur_id = d and du_donneur = du) >= 40 then
    raise exception 'trop_de_messages';
  end if;
  insert into mots (donneur_id, du_donneur, texte) values (d, du, v);
end $$;

create function public.marquer_lus(p_jeton uuid, p_vers text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
declare
  p participants;
begin
  select * into p from participants where jeton = p_jeton;
  if not found then raise exception 'inconnu'; end if;
  if p_vers = 'cible' then
    update mots set lu_le = now() where donneur_id = p.id and not du_donneur and lu_le is null;
  elsif p_vers = 'gateur' then
    update mots set lu_le = now()
    where donneur_id = (select id from participants where cible_id = p.id) and du_donneur and lu_le is null;
  end if;
end $$;

-- ───────────── Organisateur ─────────────

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
    'nb_messages', (select count(*) from mots),
    'participants', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id, 'prenom', x.prenom, 'email', x.email, 'souhaits', x.souhaits,
        'valide', x.valide, 'cree_le', x.cree_le, 'force_cible_id', x.force_cible_id,
        'dans_tirage', x.cible_id is not null, 'vu', x.vu_le is not null,
        'email_envoye', x.email_envoye_le is not null)
        order by x.cree_le), '[]'::jsonb) from participants x));
end $$;

-- Toutes les conversations (révèle les paires de ceux qui se sont écrit).
create function public.admin_messages(p_code text) returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.admin_ok(p_code);
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'de', d.prenom, 'a', c.prenom, 'mots', prive.fil(d.id, true))
            order by (select max(m.cree_le) from mots m where m.donneur_id = d.id) desc), '[]'::jsonb)
          from participants d join participants c on c.id = d.cible_id
          where exists (select 1 from mots m where m.donneur_id = d.id));
end $$;

create or replace function public.admin_reinitialiser(p_code text) returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.admin_ok(p_code);
  delete from mots where true;
  update participants set cible_id = null, vu_le = null, email_envoye_le = null where true;
  update tirage set etat = 'inscriptions', echeance = null, tire_le = null where id = 1;
end $$;

grant execute on function public.envoyer_mot(uuid, text, text) to anon, authenticated;
grant execute on function public.marquer_lus(uuid, text) to anon, authenticated;
grant execute on function public.admin_messages(text) to anon, authenticated;
revoke all on all functions in schema prive from public, anon, authenticated;
