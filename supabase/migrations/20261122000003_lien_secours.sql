-- L'organisateur peut récupérer le lien personnel d'un inscrit qui a perdu le sien
-- (téléphone changé, navigateur vidé) : admin_etat renvoie aussi le jeton.

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
        'id', x.id, 'jeton', x.jeton, 'prenom', x.prenom, 'email', x.email, 'souhaits', x.souhaits,
        'valide', x.valide, 'cree_le', x.cree_le, 'force_cible_id', x.force_cible_id,
        'dans_tirage', x.cible_id is not null, 'vu', x.vu_le is not null,
        'email_envoye', x.email_envoye_le is not null)
        order by x.cree_le), '[]'::jsonb) from participants x));
end $$;
