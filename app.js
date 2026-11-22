'use strict';

/* ───────────────────────── Réglages ───────────────────────── */
const SUPABASE = 'https://gynzaaksqkmedpapkrqa.supabase.co';
const CLE = 'sb_publishable_nr6xjHEdqSJFOBiTuzYVJQ_j1gyWYMD'; // clé publique, faite pour être visible
const EMAILS_ACTIFS = false; // passe à true quand l'envoi des e-mails est branché

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');

const ERREURS = {
  inscriptions_fermees: 'Les inscriptions sont closes.',
  prenom_invalide: 'Écris ton prénom (30 lettres au plus).',
  email_invalide: "Cette adresse e-mail n'a pas l'air correcte.",
  souhaits_trop_longs: 'Ta liste est trop longue (600 caractères au plus).',
  complet: 'Le tirage est complet.',
  deja_inscrit: 'Cette adresse e-mail est déjà inscrite. Ouvre ton lien personnel pour retrouver ta place.',
  inconnu: 'Ce lien personnel est inconnu.',
  texte_invalide: 'Écris un message (300 caractères au plus).',
  trop_de_questions: 'Tu as déjà posé 10 questions, c\'est le maximum.',
  code_invalide: 'Code organisateur incorrect.',
  deja_tire: 'Le tirage a déjà eu lieu : on ne peut plus changer cela.',
  pas_assez: 'Il faut au moins 3 inscrits validés pour tirer au sort.',
  pas_possible: "Le tirage ne peut pas être lancé maintenant.",
  titre_invalide: 'Écris un titre (60 caractères au plus).',
};

/* ───────────────────────── Outils ───────────────────────── */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function rpc(fonction, args = {}) {
  let r;
  try {
    r = await fetch(`${SUPABASE}/rest/v1/rpc/${fonction}`, {
      method: 'POST',
      headers: { apikey: CLE, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch {
    throw new Error('Pas de connexion. Vérifie ton réseau et réessaie.');
  }
  const texte = await r.text();
  if (!r.ok) {
    let code = '';
    try { code = JSON.parse(texte).message || ''; } catch { /* réponse illisible */ }
    const e = new Error(ERREURS[code] || 'Une erreur est survenue. Réessaie dans un instant.');
    e.code = code;
    throw e;
  }
  return texte ? JSON.parse(texte) : null;
}

const memoire = {
  lire(k) { try { return localStorage.getItem(k); } catch { return null; } },
  ecrire(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};

let minuterieToast;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('visible');
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => t.classList.remove('visible'), 2600);
}

const mouvementReduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ───────────────────────── Sons ───────────────────────── */
const Son = {
  ctx: null,
  muet: memoire.lire('tombola_muet') === '1',
  pret() {
    if (this.muet) return false;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    } catch { return false; }
  },
  note(freq, debut = 0, duree = 0.3, type = 'sine', volume = 0.12) {
    if (!this.pret()) return;
    const t = this.ctx.currentTime + debut;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + duree + 0.05);
  },
  tic() { this.note(1150, 0, 0.035, 'triangle', 0.07); },
  // Une note par bougie : gamme orientale qui monte vers la révélation
  bougie(k) {
    const gamme = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33, 739.99];
    this.note(gamme[k], 0, 0.9, 'sine', 0.11);
    this.note(gamme[k] * 2, 0, 0.5, 'sine', 0.035);
  },
  fanfare() {
    const air = [
      [440.0, 0.00, 0.22], [466.16, 0.16, 0.22], [440.0, 0.32, 0.22], [369.99, 0.48, 0.3],
      [392.0, 0.72, 0.22], [440.0, 0.88, 0.22], [466.16, 1.04, 0.22], [523.25, 1.20, 0.3],
      [587.33, 1.46, 1.6],
    ];
    for (const [f, t, d] of air) {
      this.note(f, t, d, 'triangle', 0.13);
      this.note(f * 2, t, d * 0.8, 'sine', 0.04);
    }
    for (const f of [146.83, 220.0, 293.66, 369.99]) this.note(f, 1.46, 2.2, 'sine', 0.07);
    for (let i = 0; i < 10; i++) this.note(1800 + Math.random() * 2400, 1.5 + i * 0.09, 0.25, 'sine', 0.025);
  },
};

function dessinerBoutonSon() {
  $('#son').innerHTML = Son.muet
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  $('#son').setAttribute('aria-pressed', String(Son.muet));
}
$('#son').addEventListener('click', () => {
  Son.muet = !Son.muet;
  memoire.ecrire('tombola_muet', Son.muet ? '1' : null);
  dessinerBoutonSon();
  if (!Son.muet) Son.bougie(4);
});

/* ───────────────────────── Hanoukia (dessin) ───────────────────────── */
// allumees : nombre de bougies allumées (0 à 8), le chamach en plus si « chamach » est vrai.
// pointe : la tige descend en pointe, pour servir d'aiguille à la roue.
function hanoukia({ allumees = 8, chamach = true, pointe = false } = {}) {
  const xs = [324, 288, 252, 216, 144, 108, 72, 36]; // de droite à gauche
  const flamme = (x, y, allumee) =>
    `<g class="flamme${allumee ? ' allumee' : ''}">
       <path d="M${x} ${y - 26}c7 9 10 14 10 19a10 10 0 0 1-20 0c0-5 3-10 10-19z" fill="url(#feu)"/>
       <path d="M${x} ${y - 13}c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="#fffbe6"/>
     </g>`;
  let branches = '';
  for (const d of [36, 72, 108, 144]) {
    branches += `<path d="M${180 - d} 78A${d} ${d * 0.62} 0 0 0 ${180 + d} 78" fill="none" stroke="url(#or)" stroke-width="5" stroke-linecap="round"/>`;
  }
  const bougies = xs.map((x, i) =>
    `<rect x="${x - 5}" y="50" width="10" height="28" rx="3" fill="#f7f1e3"/>${flamme(x, 50, i < allumees)}`).join('');
  const bas = pointe
    ? `<path d="M180 62V168" stroke="url(#or)" stroke-width="6" stroke-linecap="round"/>
       <path d="M166 166h28l-14 30z" fill="url(#or)" stroke="#7a5a17" stroke-width="1.5" stroke-linejoin="round"/>`
    : `<path d="M180 62V176" stroke="url(#or)" stroke-width="6" stroke-linecap="round"/>
       <path d="M128 190c0-10 22-16 52-16s52 6 52 16z" fill="url(#or)"/>`;
  return `<svg viewBox="0 0 360 ${pointe ? 200 : 194}" role="img" aria-label="Hanoukia">
    <defs>
      <linearGradient id="or" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f8e3a8"/><stop offset=".55" stop-color="#e9c46a"/><stop offset="1" stop-color="#b4862c"/>
      </linearGradient>
      <radialGradient id="feu" cx=".5" cy=".75" r=".8">
        <stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffb938"/><stop offset="1" stop-color="#ff6a1f"/>
      </radialGradient>
    </defs>
    ${branches}${bas}
    <rect x="174" y="28" width="12" height="36" rx="3" fill="#f7f1e3"/>
    ${flamme(180, 28, chamach)}
    ${bougies}
  </svg>`;
}

// Soir de Hanouka en cours (1 à 8), sinon 8 : le logo suit la fête.
function soirDeHanouka() {
  const debuts = { 2026: [11, 4], 2027: [11, 24], 2028: [11, 12], 2029: [11, 1], 2030: [11, 20] }; // 1er soir
  const m = new Date();
  for (const [an, [mois, jour]] of Object.entries(debuts)) {
    const premier = new Date(Number(an), mois, jour, 16, 30);
    const n = Math.floor((m - premier) / 86400000) + 1;
    if (m >= premier && n >= 1 && n <= 8) return n;
  }
  return 8;
}

/* ───────────────────────── Confettis ───────────────────────── */
function confettis() {
  if (mouvementReduit()) return;
  const c = $('#confettis');
  const g = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const L = c.width = innerWidth * dpr;
  const H = c.height = innerHeight * dpr;
  const couleurs = ['#e9c46a', '#f8e3a8', '#ffffff', '#8fa6ff', '#d3a445'];
  const grains = Array.from({ length: 150 }, () => ({
    x: L / 2 + (Math.random() - 0.5) * L * 0.3,
    y: H * 0.42,
    vx: (Math.random() - 0.5) * 22 * dpr,
    vy: (-8 - Math.random() * 20) * dpr,
    r: (4 + Math.random() * 7) * dpr,
    a: Math.random() * 6.28,
    va: (Math.random() - 0.5) * 0.4,
    piece: Math.random() < 0.55,
    couleur: couleurs[Math.floor(Math.random() * couleurs.length)],
  }));
  const debut = performance.now();
  (function image(t) {
    const age = (t - debut) / 1000;
    g.clearRect(0, 0, L, H);
    if (age > 5) return;
    g.globalAlpha = Math.max(0, Math.min(1, 5 - age));
    for (const p of grains) {
      p.vy += 0.55 * dpr; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.a += p.va;
      g.save();
      g.translate(p.x, p.y);
      if (p.piece) {
        g.scale(Math.cos(p.a) || 0.05, 1); // la pièce tourne sur elle-même
        g.fillStyle = '#e9c46a';
        g.beginPath(); g.arc(0, 0, p.r, 0, 6.29); g.fill();
        g.strokeStyle = '#b4862c'; g.lineWidth = 1.5 * dpr;
        g.beginPath(); g.arc(0, 0, p.r * 0.65, 0, 6.29); g.stroke();
      } else {
        g.rotate(p.a);
        g.fillStyle = p.couleur;
        g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      }
      g.restore();
    }
    requestAnimationFrame(image);
  })(debut);
}

/* ───────────────────────── La roue ───────────────────────── */
const TAILLE = 720;
const Roue = {
  parts: [], angle: 0, image: null, enCours: false,

  preparer(noms) {
    let parts = noms.slice();
    while (parts.length < 8) parts = parts.concat(noms);
    this.parts = parts;
    this.angle = -Math.PI / 2 - Math.PI / parts.length;
    this.image = this.peindre();
    this.afficher();
  },

  // La roue est peinte une seule fois, puis seulement tournée à chaque image.
  peindre() {
    const c = document.createElement('canvas');
    c.width = c.height = TAILLE;
    const g = c.getContext('2d');
    const R = TAILLE / 2, n = this.parts.length, a = (Math.PI * 2) / n;
    const teintes = ['#16246b', '#0d1747', '#243a98'];
    g.translate(R, R);
    for (let i = 0; i < n; i++) {
      let teinte = teintes[i % 3];
      if (i === n - 1 && n % 3 === 1) teinte = teintes[1];
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 22, i * a, (i + 1) * a); g.closePath();
      g.fillStyle = teinte; g.fill();
      g.strokeStyle = 'rgba(233,196,106,.55)'; g.lineWidth = 2; g.stroke();
    }
    // Reflet
    const reflet = g.createRadialGradient(0, -R * 0.4, 10, 0, 0, R);
    reflet.addColorStop(0, 'rgba(255,255,255,.14)'); reflet.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.fillStyle = reflet; g.beginPath(); g.arc(0, 0, R - 22, 0, 6.29); g.fill();
    // Prénoms
    const corps = Math.max(22, Math.min(40, 330 / n + 14));
    g.fillStyle = '#f7f1e3'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      let nom = this.parts[i];
      // Un prénom long est d'abord écrit plus petit, et coupé seulement en dernier recours
      const place = R - 128;
      let taille = corps;
      g.font = `600 ${taille}px "DM Sans", system-ui, sans-serif`;
      while (g.measureText(nom).width > place && taille > 19) {
        taille -= 1;
        g.font = `600 ${taille}px "DM Sans", system-ui, sans-serif`;
      }
      while (g.measureText(nom).width > place && nom.length > 3) nom = nom.slice(0, -2).trimEnd() + '…';
      g.save(); g.rotate((i + 0.5) * a); g.fillText(nom, R - 46, 2); g.restore();
    }
    // Jante dorée et ses lumières
    const jante = g.createLinearGradient(0, -R, 0, R);
    jante.addColorStop(0, '#f8e3a8'); jante.addColorStop(0.5, '#e9c46a'); jante.addColorStop(1, '#a87a22');
    g.beginPath(); g.arc(0, 0, R - 11, 0, 6.29); g.strokeStyle = jante; g.lineWidth = 22; g.stroke();
    for (let i = 0; i < 24; i++) {
      const b = (i / 24) * 6.2832;
      g.beginPath(); g.arc(Math.cos(b) * (R - 11), Math.sin(b) * (R - 11), 5, 0, 6.29);
      g.fillStyle = i % 2 ? '#fffbe6' : '#7a5a17'; g.fill();
    }
    // Moyeu avec l'étoile
    g.beginPath(); g.arc(0, 0, 62, 0, 6.29); g.fillStyle = jante; g.fill();
    g.beginPath(); g.arc(0, 0, 52, 0, 6.29); g.fillStyle = '#0d1747'; g.fill();
    g.strokeStyle = '#e9c46a'; g.lineWidth = 3.5; g.lineJoin = 'round';
    for (const sens of [0, Math.PI]) {
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const b = sens - Math.PI / 2 + (k * 2 * Math.PI) / 3;
        g[k ? 'lineTo' : 'moveTo'](Math.cos(b) * 34, Math.sin(b) * 34);
      }
      g.closePath(); g.stroke();
    }
    return c;
  },

  afficher() {
    const c = $('#roue');
    if (!c || !this.image) return;
    const g = c.getContext('2d');
    g.clearRect(0, 0, TAILLE, TAILLE);
    g.save(); g.translate(TAILLE / 2, TAILLE / 2); g.rotate(this.angle);
    g.drawImage(this.image, -TAILLE / 2, -TAILLE / 2);
    g.restore();
  },

  // Fait tourner la roue jusqu'à la part « index », puis appelle « fin ».
  lancer(index, fin) {
    if (this.enCours) return;
    this.enCours = true;
    const n = this.parts.length, a = (Math.PI * 2) / n;
    const decalage = (Math.random() - 0.5) * 0.6;
    const tour = Math.PI * 2;
    let cible = -Math.PI / 2 - (index + 0.5 + decalage) * a;
    cible += Math.ceil((this.angle - cible) / tour) * tour + tour * 7;
    const depart = this.angle, duree = mouvementReduit() ? 1200 : 9000;
    const debut = performance.now();
    const flammes = [...document.querySelectorAll('.roue-bloc .flamme')]; // chamach puis 8 bougies
    let allumees = 0;
    let part = Math.floor((-Math.PI / 2 - depart) / a);
    const image = (t) => {
      const p = Math.min(1, (t - debut) / duree);
      this.angle = depart + (cible - depart) * (1 - Math.pow(1 - p, 3.4));
      this.afficher();
      const ici = Math.floor((-Math.PI / 2 - this.angle) / a);
      if (ici !== part) { part = ici; Son.tic(); }
      const voulues = Math.min(8, Math.floor(p * 8.0001));
      while (allumees < voulues) {
        allumees++;
        flammes[allumees]?.classList.add('allumee');
        Son.bougie(allumees);
      }
      if (p < 1) return requestAnimationFrame(image);
      this.enCours = false;
      setTimeout(fin, 650);
    };
    requestAnimationFrame(image);
  },
};

/* ───────────────────────── État de l'application ───────────────────────── */
const etat = {
  jeton: null,
  donnees: null,
  empreinte: '',
  decalage: 0,       // heure du serveur moins heure du téléphone
  forcerRoue: false,
  revele: false,
  neuf: false,
  admin: null,
  codeAdmin: null,
};

function maintenant() { return Date.now() + etat.decalage; }

function lienPersonnel() {
  return `${location.origin}${location.pathname}?k=${etat.jeton}`;
}

function texteDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function blocRebours(d) {
  if (!d.echeance) return '<p class="date-tirage">La date du tirage sera annoncée très bientôt.</p>';
  return `<div class="rebours" id="rebours" aria-label="Temps restant avant le tirage">
      <div><b data-u="j">–</b><span>jours</span></div>
      <div><b data-u="h">–</b><span>heures</span></div>
      <div><b data-u="m">–</b><span>minutes</span></div>
      <div><b data-u="s">–</b><span>secondes</span></div>
    </div>
    <p class="date-tirage">La roue tournera ${esc(texteDate(d.echeance))}</p>`;
}

function majRebours() {
  const d = etat.donnees, boite = $('#rebours');
  if (!boite || !d?.echeance) return;
  const reste = Math.max(0, new Date(d.echeance).getTime() - maintenant());
  const s = Math.floor(reste / 1000);
  const v = { j: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
  for (const b of boite.querySelectorAll('b')) b.textContent = String(v[b.dataset.u]).padStart(2, '0');
}

/* ───────────────────────── Écrans des participants ───────────────────────── */
function ecranAccueil(d) {
  if (d.etat !== 'inscriptions') {
    return `<section class="carte centre">
      <p class="surtitre">Inscriptions closes</p>
      <h2>${d.etat === 'tire' ? 'La roue a tourné' : 'La roue va tourner'}</h2>
      <p class="doux">Tu t'étais inscrit ? Ouvre ton lien personnel, celui reçu à l'inscription, depuis le même téléphone.</p>
    </section>`;
  }
  return `<section class="carte">
      <h2>Qui va gâter qui ?</h2>
      <p class="doux">Chacun offre un cadeau à quelqu'un d'autre, et personne ne sait qui le gâte. C'est la roue qui décide.</p>
      ${blocRebours(d)}
      <ol class="etapes">
        <li><span><b>Inscris-toi</b> avant la fin du compte à rebours.</span></li>
        <li><span><b>À l'heure dite</b>, la roue tourne et te donne un prénom.</span></li>
        <li><span><b>Garde le secret</b> et prépare ton cadeau.</span></li>
      </ol>
    </section>
    <section class="carte">
      <h3>Je participe</h3>
      <form data-form="inscription" novalidate>
        <label>Ton prénom
          <input name="prenom" autocomplete="given-name" maxlength="30" required placeholder="Comme les autres te connaissent">
        </label>
        <label>Ton e-mail <small>pour retrouver ta place, jamais montré aux autres</small>
          <input name="email" type="email" autocomplete="email" inputmode="email" maxlength="120" required placeholder="toi@exemple.com">
        </label>
        <label>Tes idées de cadeaux <small>facultatif, tu pourras les changer</small>
          <textarea name="souhaits" maxlength="600" placeholder="Un livre, du chocolat, des chaussettes rigolotes…"></textarea>
        </label>
        <p class="erreur" role="alert"></p>
        <button class="bouton grand">Je m'inscris</button>
      </form>
    </section>`;
}

function carteSouhaits(d) {
  return `<section class="carte">
      <h3>Ma liste de souhaits</h3>
      <form data-form="souhaits">
        <textarea name="souhaits" maxlength="600" aria-label="Mes idées de cadeaux" placeholder="Un livre, du chocolat, des chaussettes rigolotes…">${esc(d.souhaits)}</textarea>
        <p class="doux petit">Seule la personne qui te gâte verra cette liste.</p>
        <p class="erreur" role="alert"></p>
        <div class="rangee fin"><button class="bouton discret">Enregistrer</button></div>
      </form>
    </section>`;
}

function ecranAttente(d) {
  const retard = d.etat === 'en_retard';
  return `<section class="carte centre">
      <p class="surtitre">C'est noté</p>
      <h2>${esc(d.prenom)}, ton inscription est prise en compte</h2>
      ${retard
        ? '<p class="doux">Les inscriptions sont closes. La roue va tourner d\'un moment à l\'autre, reviens bientôt.</p>'
        : blocRebours(d)}
      <p class="doux petit">${EMAILS_ACTIFS
        ? "À l'heure du tirage tu recevras un e-mail, et la roue tournera pour toi."
        : "À l'heure du tirage, reviens ici : la roue tournera pour toi."}</p>
    </section>
    <section class="carte">
      <h3>Ton lien personnel</h3>
      <p class="doux petit">Il te ramène à ta place depuis n'importe quel appareil. Ne le partage avec personne.</p>
      <div class="lien-perso"><code>${esc(lienPersonnel())}</code>
        <button class="bouton discret" data-action="copier">Copier</button></div>
    </section>
    ${carteSouhaits(d)}`;
}

function ecranHorsTirage(d) {
  return `<section class="carte centre">
      <p class="surtitre">La roue a tourné</p>
      <h2>${esc(d.prenom)}, tu ne fais pas partie de ce tirage</h2>
      <p class="doux">Si c'est une surprise pour toi, parles-en à la personne qui organise.</p>
    </section>`;
}

function ecranRoue(d) {
  return `<section class="carte scene">
      <p class="surtitre">C'est l'heure</p>
      <h2>${esc(d.prenom)}, à qui vas\u2011tu offrir ton cadeau\u00a0?</h2>
      <p class="doux petit">Assure-toi que personne ne regarde ton écran.</p>
      <div class="roue-bloc">
        <div class="hanoukia">${hanoukia({ allumees: 0, chamach: true, pointe: true })}</div>
        <canvas id="roue" width="${TAILLE}" height="${TAILLE}" aria-label="Roue des prénoms"></canvas>
      </div>
      <button class="bouton grand" data-action="lancer">Lancer la roue</button>
    </section>`;
}

function fil(messages, moiQuiReponds) {
  if (!messages.length) return '';
  return `<ul class="fil">${messages.map(m => `<li>
      <div class="bulle q">${esc(m.question)}</div>
      ${m.reponse
        ? `<div class="bulle r">${esc(m.reponse)}</div>`
        : moiQuiReponds
          ? `<form data-form="reponse" data-id="${esc(m.id)}">
               <textarea name="texte" maxlength="300" required aria-label="Ta réponse" placeholder="Ta réponse…"></textarea>
               <button class="bouton discret">Répondre</button>
             </form>`
          : '<div class="bulle attente">En attente de sa réponse…</div>'}
    </li>`).join('')}</ul>`;
}

function ecranResultat(d) {
  const c = d.cible;
  return `<section class="carte resultat${etat.neuf ? ' neuf' : ''}">
      <p class="surtitre">Chut, c'est un secret</p>
      <h2>${esc(d.prenom)}, tu offres un cadeau à</h2>
      <div class="nom-tire">${esc(c.prenom)}</div>
      <div class="encart">
        <h3>Ses idées de cadeaux</h3>
        ${c.souhaits
          ? `<p class="souhaits">${esc(c.souhaits)}</p>`
          : `<p class="doux">${esc(c.prenom)} n'a pas encore écrit d'idées. Pose-lui une question anonyme juste en dessous.</p>`}
      </div>
      <button class="lien" data-action="revoir">Revoir la roue</button>
    </section>
    <section class="carte">
      <h3>Question anonyme à ${esc(c.prenom)}</h3>
      <p class="doux petit">Une taille, une couleur préférée ? ${esc(c.prenom)} verra ta question, sans savoir qu'elle vient de toi.</p>
      ${fil(d.mes_questions, false)}
      <form data-form="question">
        <textarea name="texte" maxlength="300" required aria-label="Ta question" placeholder="Écris ta question…"></textarea>
        <p class="erreur" role="alert"></p>
        <div class="rangee fin"><button class="bouton discret">Envoyer en secret</button></div>
      </form>
    </section>
    ${d.questions_recues.length ? `<section class="carte">
      <h3>La personne qui te gâte te demande</h3>
      ${fil(d.questions_recues, true)}
    </section>` : ''}
    ${carteSouhaits(d)}`;
}

function quelEcran(d) {
  if (!etat.jeton) return 'accueil';
  if (d.etat !== 'tire') return 'attente';
  if (!d.participe) return 'hors';
  if (etat.forcerRoue || (!d.vu && !etat.revele)) return 'roue';
  return 'resultat';
}

function dessiner() {
  const d = etat.donnees;
  $('#titre').textContent = d.titre;
  document.title = d.titre;
  const ecran = quelEcran(d);
  app.innerHTML = { accueil: ecranAccueil, attente: ecranAttente, hors: ecranHorsTirage, roue: ecranRoue, resultat: ecranResultat }[ecran](d);
  if (ecran === 'roue') {
    const preparer = () => Roue.preparer(d.roue);
    preparer();
    document.fonts?.ready.then(() => { if ($('#roue') && !Roue.enCours) preparer(); });
  }
  etat.neuf = false;
  majRebours();
}

function enSaisie() {
  const e = document.activeElement;
  return e && app.contains(e) && /^(INPUT|TEXTAREA)$/.test(e.tagName) && e.value.trim() !== '';
}

async function actualiser({ force = false } = {}) {
  if (Roue.enCours) return;
  let d;
  try {
    d = etat.jeton ? await rpc('mon_etat', { p_jeton: etat.jeton }) : await rpc('etat_public');
  } catch (e) {
    if (e.code === 'inconnu') {
      etat.jeton = null;
      memoire.ecrire('tombola_jeton', null);
      return actualiser({ force: true });
    }
    if (!etat.donnees) app.innerHTML = `<section class="carte centre"><h2>Oups</h2><p class="doux">${esc(e.message)}</p><button class="bouton discret" data-action="recharger">Réessayer</button></section>`;
    return;
  }
  etat.decalage = new Date(d.maintenant).getTime() - Date.now();
  const { maintenant: _, ...stable } = d;
  const empreinte = JSON.stringify(stable);
  if (!force && (empreinte === etat.empreinte || enSaisie() || Roue.enCours)) return;
  etat.empreinte = empreinte;
  etat.donnees = d;
  dessiner();
}

/* ───────────────────────── Actions des participants ───────────────────────── */
async function envoyer(form, tache) {
  const bouton = form.querySelector('button');
  const zone = form.querySelector('.erreur');
  if (zone) zone.textContent = '';
  bouton.disabled = true;
  try {
    await tache(Object.fromEntries(new FormData(form)));
  } catch (e) {
    if (zone) zone.textContent = e.message; else toast(e.message);
  } finally {
    bouton.disabled = false;
  }
}

const FORMULAIRES = {
  inscription: (f) => envoyer(f, async (v) => {
    if (!v.prenom.trim()) throw new Error(ERREURS.prenom_invalide);
    const r = await rpc('inscrire', { p_prenom: v.prenom, p_email: v.email, p_souhaits: v.souhaits });
    etat.jeton = r.jeton;
    memoire.ecrire('tombola_jeton', r.jeton);
    history.replaceState(null, '', `?k=${r.jeton}`);
    Son.bougie(8);
    await actualiser({ force: true });
    scrollTo({ top: 0, behavior: 'smooth' });
  }),
  souhaits: (f) => envoyer(f, async (v) => {
    await rpc('maj_souhaits', { p_jeton: etat.jeton, p_souhaits: v.souhaits });
    toast('Ta liste est enregistrée');
    await actualiser({ force: true });
  }),
  question: (f) => envoyer(f, async (v) => {
    await rpc('poser_question', { p_jeton: etat.jeton, p_texte: v.texte });
    toast('Question envoyée en secret');
    await actualiser({ force: true });
  }),
  reponse: (f) => envoyer(f, async (v) => {
    await rpc('repondre', { p_jeton: etat.jeton, p_id: f.dataset.id, p_texte: v.texte });
    toast('Réponse envoyée');
    await actualiser({ force: true });
  }),
};

const ACTIONS = {
  recharger: () => location.reload(),
  async copier() {
    try { await navigator.clipboard.writeText(lienPersonnel()); toast('Lien copié'); }
    catch { toast('Copie impossible : appuie longtemps sur le lien'); }
  },
  lancer(bouton) {
    const d = etat.donnees;
    bouton.disabled = true;
    bouton.textContent = 'La roue tourne…';
    Son.pret();
    Son.bougie(0);
    const tours = Roue.parts.length / d.roue.length;
    const index = d.cible_index + d.roue.length * Math.floor(Math.random() * tours);
    Roue.lancer(index, () => {
      etat.revele = true;
      etat.forcerRoue = false;
      etat.neuf = true;
      rpc('marquer_vu', { p_jeton: etat.jeton }).catch(() => {});
      dessiner();
      scrollTo({ top: 0, behavior: 'smooth' });
      Son.fanfare();
      confettis();
    });
  },
  revoir() {
    etat.forcerRoue = true;
    dessiner();
    scrollTo({ top: 0, behavior: 'smooth' });
  },
};

/* ───────────────────────── Organisateur ───────────────────────── */
function pourChampDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ecranConnexionAdmin(message = '') {
  return `<section class="carte">
      <h2>Espace organisateur</h2>
      <form data-form="admin-entrer">
        <label>Code organisateur
          <input name="code" type="password" autocomplete="current-password" required>
        </label>
        <p class="erreur" role="alert">${esc(message)}</p>
        <button class="bouton">Entrer</button>
      </form>
    </section>`;
}

function ecranAdmin(a) {
  const valides = a.participants.filter(p => p.valide).length;
  const tire = a.etat === 'tire';
  const badge = tire
    ? '<span class="badge ok">Tirage fait</span>'
    : a.etat === 'en_retard'
      ? '<span class="badge alerte">Échéance passée, tirage en attente</span>'
      : '<span class="badge">Inscriptions ouvertes</span>';
  return `<section class="carte">
      <div class="rangee" style="justify-content:space-between"><h2 style="margin:0">Organisation</h2>${badge}</div>
      <p class="doux petit" style="margin-top:10px">${tire
        ? `Tirage fait ${esc(texteDate(a.tire_le))}. Personne, pas même toi, ne peut voir qui offre à qui.`
        : a.etat === 'en_retard'
          ? "L'heure est passée mais il y avait moins de 3 inscrits validés. Valide les inscrits, puis lance le tirage."
          : "À l'échéance, le tirage se lance tout seul entre les inscrits que tu as validés. Les inscrits ne savent pas qu'ils attendent ta validation."}</p>
      ${tire ? '' : `<form data-form="admin-reglages" style="margin-top:14px">
        <div class="grille-2">
          <label>Titre <input name="titre" maxlength="60" required value="${esc(a.titre)}"></label>
          <label>Date et heure du tirage <input name="echeance" type="datetime-local" value="${pourChampDate(a.echeance)}"></label>
        </div>
        <p class="erreur" role="alert"></p>
        <div class="rangee fin"><button class="bouton discret">Enregistrer</button></div>
      </form>`}
      ${a.etat === 'en_retard' ? `<div class="rangee" style="margin-top:14px">
        <button class="bouton" data-action="admin-lancer" ${valides < 3 ? 'disabled' : ''}>Lancer le tirage maintenant</button>
        ${valides < 3 ? '<span class="erreur">Il faut au moins 3 validés.</span>' : ''}</div>` : ''}
    </section>
    <section class="carte">
      <div class="rangee" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">${a.participants.length} inscrit${a.participants.length > 1 ? 's' : ''}, ${valides} validé${valides > 1 ? 's' : ''}</h3>
        ${tire || !a.participants.length ? '' : '<button class="bouton discret" data-action="admin-tout">Tout valider</button>'}
      </div>
      ${a.participants.length ? `<ul class="inscrits">${a.participants.map(p => `
        <li class="${p.valide ? 'oui' : ''}">
          <input type="checkbox" class="coche" data-valider="${esc(p.id)}" ${p.valide ? 'checked' : ''} ${tire ? 'disabled' : ''}
                 aria-label="Valider ${esc(p.prenom)}">
          <div class="qui">
            <b>${esc(p.prenom)}</b>
            <span>${esc(p.email)}</span>
            ${p.souhaits ? '<span>A écrit une liste de souhaits</span>' : ''}
            ${tire ? `<span>${p.dans_tirage ? (p.vu ? 'A vu son résultat' : "N'a pas encore fait tourner la roue") : 'Hors tirage'}</span>` : ''}
          </div>
          <div class="actions">
            <button class="icone" data-action="admin-renommer" data-id="${esc(p.id)}" data-prenom="${esc(p.prenom)}" aria-label="Corriger le prénom de ${esc(p.prenom)}">✎</button>
            ${tire ? '' : `<button class="icone" data-action="admin-supprimer" data-id="${esc(p.id)}" data-prenom="${esc(p.prenom)}" aria-label="Supprimer ${esc(p.prenom)}">✕</button>`}
          </div>
        </li>`).join('')}</ul>` : '<p class="doux">Personne ne s\'est encore inscrit. Partage le lien du site dans ton groupe.</p>'}
    </section>
    <section class="carte">
      <h3>Lien à partager</h3>
      <div class="lien-perso"><code>${esc(location.origin + location.pathname)}</code>
        <button class="bouton discret" data-action="admin-copier">Copier</button></div>
      <div class="rangee" style="margin-top:16px;justify-content:space-between">
        ${a.etat === 'inscriptions' ? '<span></span>' : '<button class="bouton discret danger" data-action="admin-reinitialiser">Annuler le tirage et tout rouvrir</button>'}
        <button class="lien" data-action="admin-sortir">Se déconnecter</button>
      </div>
    </section>`;
}

async function actualiserAdmin({ force = false } = {}) {
  if (!etat.codeAdmin) { app.innerHTML = ecranConnexionAdmin(); return; }
  try {
    const a = await rpc('admin_etat', { p_code: etat.codeAdmin });
    const { maintenant: _, ...stable } = a;
    const empreinte = JSON.stringify(stable);
    if (!force && (empreinte === etat.empreinte || enSaisie())) return;
    etat.empreinte = empreinte;
    etat.admin = a;
    $('#titre').textContent = a.titre;
    app.innerHTML = ecranAdmin(a);
  } catch (e) {
    if (e.code === 'code_invalide') {
      etat.codeAdmin = null;
      try { sessionStorage.removeItem('tombola_admin'); } catch { /* rien */ }
      app.innerHTML = ecranConnexionAdmin(e.message);
    } else if (!etat.admin) {
      app.innerHTML = ecranConnexionAdmin(e.message);
    } else {
      toast(e.message);
    }
  }
}

async function admin(fonction, args = {}, message) {
  try {
    await rpc(fonction, { p_code: etat.codeAdmin, ...args });
    if (message) toast(message);
  } catch (e) {
    toast(e.message);
  }
  await actualiserAdmin({ force: true });
}

Object.assign(FORMULAIRES, {
  'admin-entrer': (f) => envoyer(f, async (v) => {
    etat.codeAdmin = v.code.trim();
    try { sessionStorage.setItem('tombola_admin', etat.codeAdmin); } catch { /* rien */ }
    await actualiserAdmin({ force: true });
  }),
  'admin-reglages': (f) => envoyer(f, async (v) => {
    await rpc('admin_reglages', {
      p_code: etat.codeAdmin,
      p_titre: v.titre,
      p_echeance: v.echeance ? new Date(v.echeance).toISOString() : null,
    });
    toast('Réglages enregistrés');
    await actualiserAdmin({ force: true });
  }),
});

Object.assign(ACTIONS, {
  'admin-tout': () => admin('admin_valider', { p_id: null, p_valide: true }, 'Tous les inscrits sont validés'),
  'admin-lancer': () => confirm('Lancer le tirage maintenant entre les inscrits validés ?') && admin('admin_lancer', {}, 'Le tirage est fait'),
  'admin-renommer'(b) {
    const prenom = prompt('Prénom affiché sur la roue :', b.dataset.prenom);
    if (prenom && prenom.trim()) admin('admin_renommer', { p_id: b.dataset.id, p_prenom: prenom });
  },
  'admin-supprimer': (b) => confirm(`Supprimer l'inscription de ${b.dataset.prenom} ?`) && admin('admin_supprimer', { p_id: b.dataset.id }),
  'admin-reinitialiser': () => confirm('Annuler le tirage ? Les résultats et les questions anonymes seront effacés, et la date du tirage sera à refixer. Les inscrits sont gardés.')
    && admin('admin_reinitialiser', {}, 'Tirage annulé, inscriptions rouvertes'),
  async 'admin-copier'() {
    try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('Lien copié'); }
    catch { toast('Copie impossible'); }
  },
  'admin-sortir'() {
    etat.codeAdmin = null; etat.admin = null; etat.empreinte = '';
    try { sessionStorage.removeItem('tombola_admin'); } catch { /* rien */ }
    actualiserAdmin();
  },
});

/* ───────────────────────── Démarrage ───────────────────────── */
const modeAdmin = () => location.hash === '#admin';

app.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  FORMULAIRES[f.dataset.form]?.(f);
});
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (b) ACTIONS[b.dataset.action]?.(b);
});
app.addEventListener('change', (e) => {
  const c = e.target.closest('[data-valider]');
  if (c) admin('admin_valider', { p_id: c.dataset.valider, p_valide: c.checked });
});

function rafraichir(options) {
  return modeAdmin() ? actualiserAdmin(options) : actualiser(options);
}

function demarrer() {
  dessinerBoutonSon();
  $('#logo').innerHTML = hanoukia({ allumees: soirDeHanouka(), chamach: true });
  const parLien = new URLSearchParams(location.search).get('k');
  etat.jeton = /^[0-9a-f-]{36}$/i.test(parLien || '') ? parLien : memoire.lire('tombola_jeton');
  if (etat.jeton) memoire.ecrire('tombola_jeton', etat.jeton);
  try { etat.codeAdmin = sessionStorage.getItem('tombola_admin'); } catch { /* rien */ }
  rafraichir({ force: true });

  let dernier = Date.now();
  setInterval(() => {
    majRebours();
    if (document.hidden) return;
    const d = etat.donnees;
    const echeancePassee = !modeAdmin() && d?.etat === 'inscriptions' && d.echeance
      && new Date(d.echeance).getTime() <= maintenant();
    if (Date.now() - dernier > (echeancePassee ? 3000 : 20000)) {
      dernier = Date.now();
      rafraichir();
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichir(); });
  addEventListener('hashchange', () => { etat.empreinte = ''; rafraichir({ force: true }); });
}

demarrer();
