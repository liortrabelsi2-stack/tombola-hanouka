-- Inscription sans e-mail : prénom + idées de cadeaux. Un prénom ne peut être pris qu'une fois.

alter table prive.participants alter column email drop not null;

drop function if exists public.inscrire(text, text, text);

create function public.inscrire(p_prenom text, p_souhaits text) returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
declare
  t tirage;
  v_prenom text := btrim(regexp_replace(coalesce(p_prenom, ''), '\s+', ' ', 'g'));
  v_souhaits text := btrim(coalesce(p_souhaits, ''));
  v_jeton uuid;
begin
  perform prive.verifier_echeance();
  select * into t from tirage where id = 1;
  if t.etat <> 'inscriptions' then raise exception 'inscriptions_fermees'; end if;
  if char_length(v_prenom) < 1 or char_length(v_prenom) > 30 then
    raise exception 'prenom_invalide';
  end if;
  if char_length(v_souhaits) > 600 then raise exception 'souhaits_trop_longs'; end if;
  if (select count(*) from participants) >= 60 then raise exception 'complet'; end if;
  if exists (select 1 from participants where lower(prenom) = lower(v_prenom)) then
    raise exception 'prenom_pris';
  end if;
  insert into participants (prenom, souhaits) values (v_prenom, v_souhaits)
  returning jeton into v_jeton;
  return jsonb_build_object('jeton', v_jeton);
end $$;

grant execute on function public.inscrire(text, text) to anon, authenticated;

-- Sans adresse, rien à envoyer : la tâche de la minute n'appelle plus la fonction d'e-mails pour rien.
create or replace function prive.chaque_minute() returns void
language plpgsql security definer set search_path = prive, extensions as $$
begin
  perform prive.verifier_echeance();
  if exists (select 1 from participants
             where cible_id is not null and email_envoye_le is null and email is not null) then
    perform net.http_post(
      url := 'https://gynzaaksqkmedpapkrqa.supabase.co/functions/v1/envoyer-emails',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
end $$;

create or replace function public.reclamer_emails() returns jsonb
language plpgsql security definer set search_path = prive, extensions as $$
declare
  r jsonb;
begin
  with c as (
    update participants set email_envoye_le = now()
    where cible_id is not null and email_envoye_le is null and email is not null
    returning id, prenom, email, jeton)
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into r from c;
  return jsonb_build_object('titre', (select titre from tirage where id = 1), 'liste', r);
end $$;

revoke all on all functions in schema prive from public, anon, authenticated;
revoke all on function public.reclamer_emails() from public, anon, authenticated;
grant execute on function public.reclamer_emails() to service_role;
