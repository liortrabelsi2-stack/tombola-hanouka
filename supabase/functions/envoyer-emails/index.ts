// Envoie à chaque participant tiré au sort un e-mail « la roue va tourner pour toi ».
// L'e-mail ne dit PAS à qui offrir : le prénom se découvre en faisant tourner la roue.
// Appelée chaque minute par la base (pg_cron) ; n'envoie qu'une fois à chacun.
import nodemailer from "npm:nodemailer@6.9.16";

const SITE = "https://liortrabelsi2-stack.github.io/tombola-hanouka/";

const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "Content-Type": "application/json" } });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function rpc(nom: string, args: Record<string, unknown> = {}) {
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${nom} : ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

function message(prenom: string, titre: string, lien: string) {
  const texte = `Bonjour ${prenom},

Les inscriptions à « ${titre} » sont closes : la roue va tourner pour toi.

Ouvre ce lien, fais tourner la roue et découvre à qui tu offres ton cadeau :
${lien}

Assure-toi que personne ne regarde ton écran, et garde le secret.

Hanouka saméa'h !`;
  const html = `<!doctype html><html><body style="margin:0;background:#070b24;padding:32px 16px;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#0f1a4a;border:1px solid #3a3a5a;border-radius:20px" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 28px;text-align:center;color:#f7f1e3">
<div style="font-size:15px;letter-spacing:3px;color:#e9c46a">חג חנוכה שמח</div>
<h1 style="font-family:Georgia,serif;font-size:28px;color:#e9c46a;margin:8px 0 20px">${esc(titre)}</h1>
<p style="font-size:17px;line-height:1.5;margin:0 0 8px">Bonjour ${esc(prenom)},</p>
<p style="font-size:17px;line-height:1.5;margin:0 0 26px;color:#d9d3c5">Les inscriptions sont closes&nbsp;: la roue va tourner pour toi. Découvre à qui tu offres ton cadeau.</p>
<a href="${lien}" style="display:inline-block;background:#e9c46a;color:#2a1d02;font-weight:bold;font-size:17px;text-decoration:none;padding:15px 30px;border-radius:999px">Faire tourner la roue</a>
<p style="font-size:14px;line-height:1.5;margin:26px 0 0;color:#a9a39a">Assure-toi que personne ne regarde ton écran, et garde le secret.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { texte, html };
}

Deno.serve(async () => {
  const user = Deno.env.get("GMAIL_USER");
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) return reponse({ envoyes: 0, raison: "pas_configure" });

  const { titre, liste } = await rpc("reclamer_emails");
  if (!liste.length) return reponse({ envoyes: 0 });

  const poste = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass },
  });
  let envoyes = 0;
  const echecs: string[] = [];
  for (const p of liste) {
    const { texte, html } = message(p.prenom, titre, `${SITE}?k=${p.jeton}`);
    try {
      await poste.sendMail({
        from: { name: titre, address: user },
        to: p.email,
        subject: `${p.prenom}, la roue de Hanouka va tourner pour toi`,
        text: texte,
        html,
      });
      envoyes++;
    } catch (e) {
      echecs.push(String(e).slice(0, 200));
      await rpc("liberer_email", { p_id: p.id }); // on réessaiera à la minute suivante
    }
  }
  return reponse({ envoyes, echecs });
});
