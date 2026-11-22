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
  souhaits_trop_longs: 'Ta liste est trop longue (600 caractères au plus).',
  complet: 'Le tirage est complet.',
  prenom_pris: 'Ce prénom est déjà inscrit. Si ce n\'est pas toi, ajoute l\'initiale de ton nom (par exemple « David B. »).',
  inconnu: 'Ce lien personnel est inconnu.',
  texte_invalide: 'Écris un message (300 caractères au plus).',
  trop_de_messages: 'Tu as déjà envoyé 40 messages dans cette conversation, c\'est le maximum.',
  pas_de_tirage: 'Les messages s\'ouvrent après le tirage.',
  code_invalide: 'Code organisateur incorrect.',
  deja_tire: 'Le tirage a déjà eu lieu : on ne peut plus changer cela.',
  pas_assez: 'Il faut au moins 3 inscrits validés pour tirer au sort.',
  pas_possible: "Le tirage ne peut pas être lancé maintenant.",
  titre_invalide: 'Écris un titre (60 caractères au plus).',
  soi_meme: 'Une personne ne peut pas s\'offrir un cadeau à elle-même.',
  deja_choisi: 'Cette personne est déjà choisie pour quelqu\'un d\'autre.',
  arrangement_impossible: 'Avec tes arrangements, le tirage est impossible. Change un choix.',
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
  tic(freq = 1150) { this.note(freq, 0, 0.035, 'triangle', 0.07); },
  ding() { this.note(880, 0, 0.5, 'sine', 0.1); this.note(1318.51, 0.13, 0.8, 'sine', 0.08); },
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
  const id = pointe ? 'roue' : 'logo';
  const xs = [324, 288, 252, 216, 144, 108, 72, 36]; // de droite à gauche
  const flamme = (x, y, allumee) =>
    `<g class="flamme${allumee ? ' allumee' : ''}">
       <path d="M${x} ${y - 26}c7 9 10 14 10 19a10 10 0 0 1-20 0c0-5 3-10 10-19z" fill="url(#feu-${id})"/>
       <path d="M${x} ${y - 13}c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="#fffbe6"/>
     </g>`;
  let branches = '';
  for (const d of [36, 72, 108, 144]) {
    branches += `<path d="M${180 - d} 78A${d} ${d * 0.62} 0 0 0 ${180 + d} 78" fill="none" stroke="url(#or-${id})" stroke-width="5" stroke-linecap="round"/>`;
  }
  const bougies = xs.map((x, i) =>
    `<rect x="${x - 5}" y="50" width="10" height="28" rx="3" fill="#f7f1e3"/>${flamme(x, 50, i < allumees)}`).join('');
  const bas = pointe
    ? `<path d="M180 62V168" stroke="url(#or-${id})" stroke-width="6" stroke-linecap="round"/>
       <g id="aiguille"><path d="M165 162h30l-15 36z" fill="url(#or-${id})" stroke="#7a5a17" stroke-width="1.5" stroke-linejoin="round"/>
       <circle cx="180" cy="168" r="4.5" fill="#fff6d6" stroke="#7a5a17" stroke-width="1"/></g>`
    : `<path d="M180 62V176" stroke="url(#or-${id})" stroke-width="6" stroke-linecap="round"/>
       <path d="M128 190c0-10 22-16 52-16s52 6 52 16z" fill="url(#or-${id})"/>`;
  return `<svg viewBox="0 0 360 ${pointe ? 200 : 194}" role="img" aria-label="Hanoukia">
    <defs>
      <linearGradient id="or-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f8e3a8"/><stop offset=".55" stop-color="#e9c46a"/><stop offset="1" stop-color="#b4862c"/>
      </linearGradient>
      <radialGradient id="feu-${id}" cx=".5" cy=".75" r=".8">
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
// Trois couches : le disque des prénoms (peint une fois, puis tourné), le cadre fixe
// (jante dorée, moyeu, reflet) et les ampoules, rallumées à chaque image.
const TAILLE = 900;
const TOUR = Math.PI * 2;
const AMPOULES = 24;
const RAYON = TAILLE / 2;
const RAYON_DISQUE = RAYON - 58;

const Roue = {
  parts: [], angle: 0, disque: null, fixe: null, halo: null,
  mode: 'repos',            // repos → elan → tourne → gagne
  enCours: false, boucle: 0, gagnant: -1, fin: null,
  t0: 0, depart: 0, cible: 0, duree: 0, tArret: 0, dernierT: 0,
  vitesse: 0, flap: 0, part: 0, dernierTic: 0, allumees: 0, flammes: [],

  preparer(noms) {
    let parts = noms.slice();
    while (parts.length < 6) parts = parts.concat(noms);
    this.parts = parts;
    this.mode = 'repos';
    this.enCours = false;
    this.gagnant = -1;
    this.flap = 0;
    this.vitesse = 0;
    this.dernierT = 0;
    this.angle = -Math.PI / 2 - Math.PI / parts.length;
    this.disque = this.peindreDisque();
    this.fixe = this.fixe || this.peindreFixe();
    this.halo = this.halo || this.peindreHalo();
    const id = ++this.boucle; // une seule boucle d'animation à la fois
    const image = (t) => {
      if (id !== this.boucle || !$('#roue')) return;
      this.avancer(t);
      this.afficher(t);
      requestAnimationFrame(image);
    };
    requestAnimationFrame(image);
  },

  peindreDisque() {
    const c = document.createElement('canvas');
    c.width = c.height = TAILLE;
    const g = c.getContext('2d');
    const RD = RAYON_DISQUE, n = this.parts.length, a = TOUR / n;
    const teintes = [['#3350cf', '#16257c'], ['#121d5e', '#070c30'], ['#22379c', '#0e185a']];
    g.translate(RAYON, RAYON);
    for (let i = 0; i < n; i++) {
      const [clair, sombre] = teintes[i === n - 1 && n % 2 === 1 ? 2 : i % 2];
      const fond = g.createRadialGradient(0, 0, 70, 0, 0, RD);
      fond.addColorStop(0, clair); fond.addColorStop(1, sombre);
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, RD, i * a, (i + 1) * a); g.closePath();
      g.fillStyle = fond; g.fill();
    }
    // Filets dorés entre les parts, et liseré décoratif
    g.strokeStyle = 'rgba(248,227,168,.85)'; g.lineWidth = 3;
    for (let i = 0; i < n; i++) {
      g.beginPath(); g.moveTo(Math.cos(i * a) * 80, Math.sin(i * a) * 80);
      g.lineTo(Math.cos(i * a) * RD, Math.sin(i * a) * RD); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, RD - 36, 0, TOUR); g.strokeStyle = 'rgba(233,196,106,.32)'; g.lineWidth = 2; g.stroke();
    // Prénoms : d'abord plus petits s'ils sont longs, coupés seulement en dernier recours
    const corps = Math.max(34, Math.min(56, 380 / n + 20));
    const place = RD - 52 - 104;
    g.fillStyle = '#fbf6e9'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    for (let i = 0; i < n; i++) {
      let nom = this.parts[i], taille = corps;
      g.font = `600 ${taille}px "DM Sans", system-ui, sans-serif`;
      while (g.measureText(nom).width > place && taille > 26) {
        taille -= 1;
        g.font = `600 ${taille}px "DM Sans", system-ui, sans-serif`;
      }
      while (g.measureText(nom).width > place && nom.length > 3) nom = nom.slice(0, -2).trimEnd() + '…';
      g.save(); g.rotate((i + 0.5) * a); g.fillText(nom, RD - 52, 2); g.restore();
    }
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    // Plots dorés que la languette vient frapper
    for (let i = 0; i < n; i++) {
      const x = Math.cos(i * a) * (RD - 16), y = Math.sin(i * a) * (RD - 16);
      const plot = g.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
      plot.addColorStop(0, '#fffbe6'); plot.addColorStop(0.5, '#e9c46a'); plot.addColorStop(1, '#8a6519');
      g.beginPath(); g.arc(x, y, 9, 0, TOUR); g.fillStyle = plot; g.fill();
    }
    g.beginPath(); g.arc(0, 0, 84, 0, TOUR); g.fillStyle = '#080d33'; g.fill();
    return c;
  },

  peindreFixe() {
    const c = document.createElement('canvas');
    c.width = c.height = TAILLE;
    const g = c.getContext('2d');
    const RD = RAYON_DISQUE, R = RAYON;
    g.translate(R, R);
    const or = g.createLinearGradient(0, -R, 0, R);
    or.addColorStop(0, '#fff1c4'); or.addColorStop(0.35, '#e9c46a'); or.addColorStop(0.7, '#b4862c'); or.addColorStop(1, '#7d5a15');
    const anneau = (r1, r2, style) => {
      g.beginPath(); g.arc(0, 0, r2, 0, TOUR); g.arc(0, 0, r1, 0, TOUR, true); g.fillStyle = style; g.fill();
    };
    // Ombre portée du cadre sur le disque, pour le relief
    const ombre = g.createRadialGradient(0, 0, RD - 46, 0, 0, RD + 2);
    ombre.addColorStop(0, 'rgba(0,0,0,0)'); ombre.addColorStop(1, 'rgba(0,0,0,.5)');
    anneau(RD - 46, RD + 2, ombre);
    // Jante dorée, gorge sombre où logent les ampoules
    anneau(RD, R - 3, or);
    anneau(RD + 11, R - 13, '#0a0f36');
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,250,225,.7)'; g.beginPath(); g.arc(0, 0, R - 4, 0, TOUR); g.stroke();
    g.strokeStyle = 'rgba(90,62,10,.9)'; g.beginPath(); g.arc(0, 0, RD + 1, 0, TOUR); g.stroke();
    // Reflet de verre sur le disque
    const reflet = g.createRadialGradient(-R * 0.3, -R * 0.42, 10, -R * 0.1, -R * 0.15, R * 0.95);
    reflet.addColorStop(0, 'rgba(255,255,255,.2)'); reflet.addColorStop(0.5, 'rgba(255,255,255,.03)'); reflet.addColorStop(1, 'rgba(255,255,255,0)');
    g.beginPath(); g.arc(0, 0, RD, 0, TOUR); g.fillStyle = reflet; g.fill();
    // Moyeu et étoile
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 22;
    g.beginPath(); g.arc(0, 0, 70, 0, TOUR); g.fillStyle = or; g.fill();
    g.shadowColor = 'transparent'; g.shadowBlur = 0;
    const coeur = g.createRadialGradient(-14, -18, 4, 0, 0, 58);
    coeur.addColorStop(0, '#2a3f9f'); coeur.addColorStop(1, '#090e36');
    g.beginPath(); g.arc(0, 0, 58, 0, TOUR); g.fillStyle = coeur; g.fill();
    g.strokeStyle = '#f0d286'; g.lineWidth = 4; g.lineJoin = 'round';
    for (const sens of [0, Math.PI]) {
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const b = sens - Math.PI / 2 + (k * TOUR) / 3;
        g[k ? 'lineTo' : 'moveTo'](Math.cos(b) * 38, Math.sin(b) * 38);
      }
      g.closePath(); g.stroke();
    }
    return c;
  },

  peindreHalo() {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    const lueur = g.createRadialGradient(48, 48, 2, 48, 48, 48);
    lueur.addColorStop(0, 'rgba(255,246,214,.95)'); lueur.addColorStop(0.3, 'rgba(255,214,120,.5)'); lueur.addColorStop(1, 'rgba(255,190,80,0)');
    g.fillStyle = lueur; g.fillRect(0, 0, 96, 96);
    return c;
  },

  ampouleAllumee(i, t) {
    if (mouvementReduit()) return true;
    if (this.mode === 'gagne') {
      const age = t - this.tArret;
      return age > 1500 || Math.floor(age / 120) % 2 === 0;       // tout clignote, puis tout reste allumé
    }
    if (this.mode === 'repos') return (i + Math.floor(t / 650)) % 2 === 0; // respiration lente
    const pas = Math.floor(this.angle / (TOUR / AMPOULES));         // chenillard qui suit la roue
    return (((i - pas) % 3) + 3) % 3 === 0;
  },

  avancer(t) {
    const dt = Math.min(50, t - (this.dernierT || t));
    this.dernierT = t;
    const avant = this.angle;
    if (this.mode === 'repos') {
      if (!mouvementReduit()) this.angle += dt * 0.00011;
    } else if (this.mode === 'elan') {
      // Petit recul avant de partir, comme une main qui prend son élan
      const q = Math.min(1, (t - this.t0) / 420);
      this.angle = this.depart - 0.3 * (q * q * (3 - 2 * q));
      if (q >= 1) { this.mode = 'tourne'; this.t0 = t; this.depart = this.angle; }
    } else if (this.mode === 'tourne') {
      const p = Math.min(1, (t - this.t0) / this.duree);
      const m = 0.07; // courte accélération, puis longue décélération
      const w = (p < m ? (p * p) / (2 * m) : p - m / 2) / (1 - m / 2);
      this.angle = this.depart + (this.cible - this.depart) * (1 - Math.pow(1 - w, 4));
      const a = TOUR / this.parts.length;
      const ici = Math.floor((-Math.PI / 2 - this.angle) / a);
      if (ici !== this.part) {
        this.part = ici;
        const v = Math.abs(this.angle - avant);
        this.flap = -(9 + Math.min(15, v * 90));
        if (t - this.dernierTic > 42) {
          this.dernierTic = t;
          Son.tic(1050 + Math.random() * 220);
          if (v < 0.03) { try { navigator.vibrate?.(6); } catch { /* pas de vibreur */ } }
        }
      }
      const voulues = Math.min(8, Math.floor(p * 8.0001));
      while (this.allumees < voulues) {
        this.allumees++;
        this.flammes[this.allumees]?.classList.add('allumee');
        Son.bougie(this.allumees);
      }
      if (p >= 1) { this.mode = 'gagne'; this.tArret = t; this.arriver(); }
    }
    this.vitesse = Math.abs(this.angle - avant);
    this.flap *= Math.pow(0.8, dt / 16.7);
    $('#aiguille')?.setAttribute('transform', `rotate(${this.flap.toFixed(2)} 180 164)`);
  },

  afficher(t) {
    const c = $('#roue');
    if (!c) return;
    const g = c.getContext('2d');
    const n = this.parts.length, a = TOUR / n;
    g.clearRect(0, 0, TAILLE, TAILLE);
    // Flou de vitesse : la roue est superposée à elle-même, légèrement décalée
    const passes = this.mode === 'tourne' && !mouvementReduit() ? Math.min(5, 1 + Math.floor(this.vitesse / 0.05)) : 1;
    for (let k = 0; k < passes; k++) {
      g.save();
      g.globalAlpha = 1 / (k + 1);
      g.translate(RAYON, RAYON); g.rotate(this.angle - k * this.vitesse * 0.22);
      g.drawImage(this.disque, -RAYON, -RAYON);
      g.restore();
    }
    if (this.mode === 'gagne') {
      const age = (t - this.tArret) / 1000;
      const pouls = 0.5 + 0.5 * Math.sin(age * 9);
      const i = ((this.gagnant % n) + n) % n;
      g.save(); g.translate(RAYON, RAYON); g.rotate(this.angle);
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, RAYON_DISQUE, (i + 1) * a, (i + n) * a); g.closePath();
      g.fillStyle = `rgba(4,6,22,${Math.min(0.5, age * 1.4)})`; g.fill();   // les autres parts s'effacent
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, RAYON_DISQUE, i * a, (i + 1) * a); g.closePath();
      g.fillStyle = `rgba(248,227,168,${0.1 + 0.2 * pouls})`; g.fill();
      g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = `rgba(255,244,200,${0.55 + 0.45 * pouls})`; g.stroke();
      g.restore();
    }
    g.drawImage(this.fixe, 0, 0);
    const rb = RAYON - 31;
    for (let i = 0; i < AMPOULES; i++) {
      const b = ((i + 0.5) / AMPOULES) * TOUR - Math.PI / 2;
      const x = RAYON + Math.cos(b) * rb, y = RAYON + Math.sin(b) * rb;
      const allumee = this.ampouleAllumee(i, t);
      g.beginPath(); g.arc(x, y, 9, 0, TOUR); g.fillStyle = allumee ? '#fff8dc' : '#5a4514'; g.fill();
      if (allumee) {
        g.globalCompositeOperation = 'lighter';
        g.drawImage(this.halo, x - 36, y - 36, 72, 72);
        g.globalCompositeOperation = 'source-over';
      }
    }
  },

  // Fait tourner la roue jusqu'à la part « index », puis appelle « fin ».
  lancer(index, fin) {
    if (this.enCours) return;
    this.enCours = true;
    this.fin = fin;
    this.gagnant = index;
    const a = TOUR / this.parts.length;
    const decalage = (Math.random() - 0.5) * 0.72; // s'arrête parfois tout près du bord : suspense
    let cible = -Math.PI / 2 - (index + 0.5 + decalage) * a;
    cible += Math.ceil((this.angle - cible) / TOUR) * TOUR + TOUR * 6;
    this.cible = cible;
    this.depart = this.angle;
    this.duree = mouvementReduit() ? 1200 : 9500;
    this.allumees = 0;
    this.flammes = [...document.querySelectorAll('.roue-bloc .flamme')]; // chamach puis 8 bougies
    this.part = Math.floor((-Math.PI / 2 - this.angle) / a);
    this.t0 = performance.now();
    this.mode = mouvementReduit() ? 'tourne' : 'elan';
    $('.roue-bloc')?.classList.add('tourne');
  },

  arriver() {
    const bloc = $('.roue-bloc');
    bloc?.classList.remove('tourne');
    bloc?.classList.add('gagne');
    const bandeau = $('#bandeau');
    if (bandeau) { bandeau.textContent = this.parts[((this.gagnant % this.parts.length) + this.parts.length) % this.parts.length]; bandeau.classList.add('visible'); }
    Son.fanfare();
    confettis();
    try { navigator.vibrate?.([70, 50, 140]); } catch { /* pas de vibreur */ }
    setTimeout(() => { this.enCours = false; this.fin?.(); }, mouvementReduit() ? 900 : 1900);
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
  nonLus: null,       // nombre de messages non lus au dernier passage
  observateur: null,
  voirMessages: false,
  ecran: null,
  enAttente: false,
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
          <input name="prenom" autocomplete="given-name" maxlength="30" required placeholder="Comme les autres te connaissent" enterkeyhint="next">
        </label>
        <label>Tes idées de cadeaux <small>facultatif, tu pourras les changer</small>
          <textarea name="souhaits" maxlength="600" placeholder="Un livre, du chocolat, des chaussettes rigolotes…"></textarea>
        </label>
        <div class="puces">${AMORCES_LISTE.map(t => `<button type="button" class="puce" data-action="puce-liste" data-texte="${esc(t)}">${esc(t)}</button>`).join('')}</div>
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
        <div class="puces">${AMORCES_LISTE.map(t => `<button type="button" class="puce" data-action="puce-liste" data-texte="${esc(t)}">${esc(t)}</button>`).join('')}</div>
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
        <div class="roue-zone">
          <div class="rayons" aria-hidden="true"></div>
          <canvas id="roue" width="${TAILLE}" height="${TAILLE}" aria-label="Roue des prénoms"></canvas>
          <div id="bandeau" class="bandeau" aria-hidden="true"></div>
        </div>
      </div>
      <button class="bouton grand" data-action="lancer">Lancer la roue</button>
    </section>`;
}

/* ───────────────────────── Messages anonymes ───────────────────────── */
const sansAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mots repérés dans la liste de souhaits → questions proposées
const IDEES = [
  ['livre|roman|bd|bande dessinee|manga|lecture', ['Quel genre de livre tu aimes lire ?', 'Quels livres tu as déjà lus, pour éviter un doublon ?', 'Tu lis plutôt en français ou en hébreu ?']],
  ['chocolat', ['Chocolat noir, au lait ou blanc ?', 'Chocolat nature, aux noisettes ou fourré ?']],
  ['bonbon|gateau|sucrerie|patisserie|douceur', ['Plutôt bonbons, chocolat ou gâteaux ?']],
  ['pull|sweat|t-?shirt|chemise|vetement|pyjama|chaussette|echarpe|bonnet|gants?\\b|robe|jupe|pantalon|veste|manteau', ['Tu fais quelle taille ?', 'Quelle couleur tu portes le plus ?']],
  ['chaussure|basket|sneaker|botte|chausson', ['Tu chausses du combien ?']],
  ['parfum|eau de toilette', ['Plutôt parfum frais, sucré ou boisé ?']],
  ['bougie', ['Quelle odeur de bougie tu préfères ?']],
  ['jeux? de societe|puzzle|jeux? de cartes', ["Quels jeux de société tu as déjà ?"]],
  ['jeux? video|console|switch|playstation|ps[45]|xbox|manette', ['Tu joues sur quelle console ?', 'Un jeu que tu attends ?']],
  ['musique|ecouteur|casque|enceinte|airpods|vinyle', ['Quel style de musique tu écoutes ?']],
  ['bijou|collier|bracelet|bague|boucles? d|montre', ['Plutôt or ou argent ?']],
  ['sac\\b|sacs\\b|portefeuille|trousse', ['Plutôt sac à dos ou sac à main ?']],
  ['the\\b|tisane|cafe|mug|tasse', ['Thé ou café ? Lequel tu préfères ?']],
  ['cuisine|recette|ustensile|tablier', ["Qu'est-ce que tu aimes cuisiner ?"]],
  ['sport|foot|ballon|maillot|tennis|velo|gym|course|running', ['Quel sport tu pratiques ?', 'Ton équipe préférée ?']],
  ['maquillage|rouge a levres|vernis|creme|soin|cosmetique', ['Quelles marques de beauté tu utilises ?']],
  ['plante|fleur|jardin', ['Plutôt une plante facile ou des fleurs ?']],
  ['deco|cadre|poster|coussin|plaid', ['Quel style de déco tu as chez toi ?']],
  ['siddour|tehilim|kippa|tall?it|mezouza|judaica|livre de priere|chabbat|hanoukia|bougeoir', ['Tu pries plutôt en rite séfarade ou ashkénaze ?', "Il te manque quoi pour Chabbat ?"]],
  ['telephone|coque|chargeur|tablette|ordinateur|gadget', ['Tu as quel téléphone ?']],
  ['peluche|jouet|lego|playmobil|poupee', ['Plutôt Lego, Playmobil ou peluche ?']],
  ['voyage|valise|carte cadeau|restaurant|cinema|spectacle|sortie', ['Plutôt un objet ou une sortie ?']],
].map(([motifs, questions]) => [new RegExp('\\b(?:' + motifs + ')'), questions]);

const QUESTIONS_DE_BASE = ['Tu fais quelle taille ?', 'Ta couleur préférée ?', 'Sucré ou salé ?', "Qu'est-ce que tu n'aimes pas du tout ?", 'Tu as un hobby en ce moment ?'];
const MOTS_AU_GATEUR = ["En ce moment j'adore…", 'Surtout pas de…', "J'ai déjà…", "J'aimerais bien…", 'Ma taille :', 'Mes couleurs préférées :', 'Surprends-moi !', "Merci d'avance !"];
const AMORCES_LISTE = ["J'aimerais…", "En ce moment j'adore…", 'Surtout pas de…', "J'ai déjà…", 'Ma taille :', 'Mes couleurs préférées :'];

// Une question n'est pas proposée si la liste de souhaits y répond déjà.
const DEJA_DIT = {
  'Quel genre de livre tu aimes lire ?': /policier|polar|thriller|fantas|science.fiction|romance|manga|\bbd\b|histori|biograph|aventure|horreur|cuisine/,
  'Chocolat noir, au lait ou blanc ?': /chocolat (noir|au lait|blanc)/,
  'Tu fais quelle taille ?': /taille/,
  'Tu chausses du combien ?': /pointure|taille/,
  'Ta couleur préférée ?': /couleur/,
  'Quelle couleur tu portes le plus ?': /couleur/,
  "Qu'est-ce que tu n'aimes pas du tout ?": /surtout pas|n'aime pas|deteste/,
  'Plutôt or ou argent ?': /\b(or|argent|dore|argente)\b/,
  'Thé ou café ? Lequel tu préfères ?': /\b(the|cafe)\b.*\b(vert|noir|menthe|expresso|capsule|grain)/,
};

// dejaPoses : les messages que j'ai déjà envoyés, pour ne pas reproposer la même question.
function suggestions(souhaits, dejaPoses = []) {
  const complet = sansAccents(souhaits || '');
  // Ce que la personne ne veut pas ou possède déjà ne doit pas inspirer de question
  const voulu = complet.split(/[\n.;!]+/)
    .filter(m => !/^\s*(surtout pas|pas de|je n'aime pas|j'aime pas|je deteste|j'ai deja|sauf)/.test(m)).join('\n');
  const liste = [];
  for (const [motif, questions] of IDEES) {
    if (motif.test(voulu)) for (const q of questions) liste.push({ texte: q, deListe: true });
  }
  if (!complet.trim()) liste.push({ texte: "Qu'est-ce qui te ferait vraiment plaisir ?" });
  for (const q of QUESTIONS_DE_BASE) liste.push({ texte: q });
  const vus = new Set(dejaPoses);
  return liste.filter(s => !(DEJA_DIT[s.texte]?.test(complet)) && !vus.has(s.texte) && vus.add(s.texte)).slice(0, 7);
}

function compterNonLus(d) {
  return [...(d.fil_cible || []), ...(d.fil_gateur || [])].filter(m => !m.de_moi && !m.lu).length;
}

function heureCourte(iso) {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function puces(liste) {
  return `<div class="puces">${liste.map(s => `<button type="button" class="puce${s.deListe ? ' de-liste' : ''}" data-action="puce" data-texte="${esc(s.texte)}">${s.deListe ? '<span aria-hidden="true">✦</span> ' : ''}${esc(s.texte)}</button>`).join('')}</div>`;
}

function bulles(mots, nomAutre) {
  if (!mots.length) return '';
  return `<ul class="fil">${mots.map(m => {
    const nouveau = !m.de_moi && !m.lu;
    return `<li class="${m.de_moi ? 'moi' : 'autre'}${nouveau ? ' nouveau' : ''}">
      <div class="bulle ${m.de_moi ? 'r' : 'q'}">${esc(m.texte)}</div>
      <span class="heure">${m.de_moi ? 'Toi' : esc(nomAutre)} · ${esc(heureCourte(m.cree_le))}${nouveau ? ' · <b>Nouveau</b>' : ''}</span>
    </li>`;
  }).join('')}</ul>`;
}

function carteConversation({ vers, titre, intro, mots, nomAutre, idees, aide, placeholder }) {
  const nonLus = mots.filter(m => !m.de_moi && !m.lu).length;
  return `<section class="carte" data-fil="${vers}">
      <div class="rangee" style="justify-content:space-between;margin-bottom:6px">
        <h3 style="margin:0">${titre}</h3>
        ${nonLus ? `<span class="badge nouveau-badge">${nonLus} nouveau${nonLus > 1 ? 'x' : ''}</span>` : ''}
      </div>
      <p class="doux petit">${intro}</p>
      ${bulles(mots, nomAutre)}
      <form data-form="mot" data-vers="${vers}">
        ${idees.length ? `<p class="aide-puces">${aide}</p>${puces(idees)}` : ''}
        <textarea name="texte" maxlength="300" required aria-label="Ton message" placeholder="${placeholder}"></textarea>
        <p class="erreur" role="alert"></p>
        <div class="rangee fin"><button class="bouton discret">Envoyer en secret</button></div>
      </form>
    </section>`;
}

function ecranResultat(d) {
  const c = d.cible;
  const nonLus = compterNonLus(d);
  const idees = suggestions(c.souhaits, d.fil_cible.filter(m => m.de_moi).map(m => m.texte));
  return `${nonLus ? `<button class="alerte-messages" data-action="aller-messages">
        <span class="point" aria-hidden="true"></span>Tu as ${nonLus} nouveau${nonLus > 1 ? 'x' : ''} message${nonLus > 1 ? 's' : ''} anonyme${nonLus > 1 ? 's' : ''}
      </button>` : ''}
    <section class="carte resultat${etat.neuf ? ' neuf' : ''}">
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
    ${carteConversation({
      vers: 'cible',
      titre: `Message anonyme à ${esc(c.prenom)}`,
      intro: `${esc(c.prenom)} lit tes messages et peut te répondre, sans savoir qu'ils viennent de toi.`,
      mots: d.fil_cible, nomAutre: c.prenom, idees,
      aide: idees.some(s => s.deListe) ? '✦ Idées tirées de sa liste de souhaits' : 'Une idée de question ?',
      placeholder: 'Écris ta question…',
    })}
    ${carteConversation({
      vers: 'gateur',
      titre: 'La personne qui te gâte',
      intro: "Quelqu'un a tiré ton prénom. Réponds à ses questions ou glisse-lui un indice : tu ne sais pas qui c'est.",
      mots: d.fil_gateur, nomAutre: 'Anonyme', idees: MOTS_AU_GATEUR.map(texte => ({ texte })),
      aide: 'Une idée de message ?',
      placeholder: 'Écris-lui un message…',
    })}
    ${carteSouhaits(d)}`;
}

// Un message devient « lu » quand il reste visible à l'écran un instant.
function observerNonLus() {
  etat.observateur?.disconnect();
  const nouveaux = document.querySelectorAll('[data-fil] li.nouveau');
  if (!nouveaux.length || !('IntersectionObserver' in window)) return;
  const minuteries = new Map();
  const faits = new Set();
  etat.observateur = new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      const vers = e.target.closest('[data-fil]').dataset.fil;
      if (faits.has(vers)) continue;
      if (e.isIntersecting) {
        minuteries.set(vers, setTimeout(() => {
          faits.add(vers);
          const lus = document.querySelectorAll(`[data-fil="${vers}"] li.nouveau`).length;
          rpc('marquer_lus', { p_jeton: etat.jeton, p_vers: vers }).then(() => {
            etat.nonLus = Math.max(0, (etat.nonLus || 0) - lus);
            document.title = (etat.nonLus ? `(${etat.nonLus}) ` : '') + etat.donnees.titre;
          }).catch(() => {});
        }, 1500));
      } else {
        clearTimeout(minuteries.get(vers));
      }
    }
  }, { threshold: 0.6 });
  nouveaux.forEach(li => etat.observateur.observe(li));
}

function quelEcran(d) {
  if (!etat.jeton) return 'accueil';
  if (d.etat !== 'tire') return 'attente';
  if (!d.participe) return 'hors';
  if (etat.forcerRoue || (!d.vu && !etat.revele)) return 'roue';
  return 'resultat';
}

const cleChamp = (c) => { const f = c.closest('form[data-form]'); return f ? `${f.dataset.form}|${f.dataset.vers || ''}|${c.name}` : null; };

function dessiner() {
  const d = etat.donnees;
  $('#titre').textContent = d.titre;
  document.title = (etat.nonLus ? `(${etat.nonLus}) ` : '') + d.titre;
  const ecran = quelEcran(d);
  const memeEcran = ecran === etat.ecran;
  // Ce qui est en train d'être écrit survit au rafraîchissement
  const brouillons = new Map();
  if (memeEcran) app.querySelectorAll('textarea, input').forEach(c => { const k = cleChamp(c); if (k) brouillons.set(k, c.value); });
  etat.ecran = ecran;
  document.body.classList.toggle('sur-roue', ecran === 'roue');
  app.classList.toggle('calme', memeEcran); // pas de nouvelle animation d'entrée si l'écran ne change pas
  app.innerHTML = { accueil: ecranAccueil, attente: ecranAttente, hors: ecranHorsTirage, roue: ecranRoue, resultat: ecranResultat }[ecran](d);
  app.querySelectorAll('textarea, input').forEach(c => { const k = cleChamp(c); if (k && brouillons.has(k)) c.value = brouillons.get(k); });
  if (ecran === 'roue') {
    const preparer = () => Roue.preparer(d.roue);
    preparer();
    document.fonts?.ready.then(() => { if ($('#roue') && !Roue.enCours) preparer(); });
  }
  if (ecran === 'resultat') observerNonLus(); else etat.observateur?.disconnect();
  etat.neuf = false;
  majRebours();
}

// Quelqu'un écrit : on ne redessine pas sous ses doigts (le clavier du téléphone se fermerait).
function enSaisie() {
  const e = document.activeElement;
  return !!e && app.contains(e) && /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName);
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
  const nonLus = etat.jeton && d.etat === 'tire' && d.participe ? compterNonLus(d) : 0;
  if (etat.nonLus != null && nonLus > etat.nonLus) {
    Son.ding();
    toast('Nouveau message anonyme');
  }
  etat.nonLus = nonLus;
  document.title = (nonLus ? `(${nonLus}) ` : '') + d.titre;
  const { maintenant: _, ...stable } = d;
  const empreinte = JSON.stringify(stable);
  if (Roue.enCours) return;
  if (!force && empreinte === etat.empreinte) return;
  if (!force && enSaisie()) { etat.enAttente = true; return; } // redessiné dès que la saisie s'arrête
  etat.enAttente = false;
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
    const r = await rpc('inscrire', { p_prenom: v.prenom, p_souhaits: v.souhaits });
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
  mot: (f) => envoyer(f, async (v) => {
    await rpc('envoyer_mot', { p_jeton: etat.jeton, p_vers: f.dataset.vers, p_texte: v.texte });
    f.reset();
    toast('Message envoyé en secret');
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
    $('.roue-bloc')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const tours = Roue.parts.length / d.roue.length;
    const index = d.cible_index + d.roue.length * Math.floor(Math.random() * tours);
    Roue.lancer(index, () => {
      etat.revele = true;
      etat.forcerRoue = false;
      etat.neuf = true;
      rpc('marquer_vu', { p_jeton: etat.jeton }).catch(() => {});
      dessiner();
      scrollTo({ top: 0, behavior: 'smooth' });
    });
  },
  puce(b) {
    const zone = b.closest('form').querySelector('textarea');
    zone.value = b.dataset.texte.replace(/…$/, ' ').replace(/:$/, ': ');
    zone.focus();
    zone.setSelectionRange(zone.value.length, zone.value.length);
  },
  // Dans la liste de souhaits, une amorce s'ajoute sur une nouvelle ligne
  'puce-liste'(b) {
    const zone = b.closest('form').querySelector('textarea');
    const amorce = b.dataset.texte.replace(/…$/, ' ').replace(/:$/, ': ');
    const deja = zone.value.replace(/\s+$/, '');
    zone.value = (deja ? deja + '\n' : '') + amorce;
    zone.focus();
    zone.setSelectionRange(zone.value.length, zone.value.length);
  },
  'aller-messages'() {
    const carte = document.querySelector('[data-fil] li.nouveau')?.closest('[data-fil]');
    carte?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        ? `Tirage fait ${esc(texteDate(a.tire_le))}. ${a.participants.some(p => p.force_cible_id) ? 'En dehors des paires que tu as choisies, personne ne peut voir qui offre à qui.' : 'Personne, pas même toi, ne peut voir qui offre à qui.'}`
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
            ${p.email ? `<span>${esc(p.email)}</span>` : ''}
            ${p.souhaits ? `<span class="souhaits-admin">${esc(p.souhaits)}</span>` : '<span>Pas encore de liste de souhaits</span>'}
            ${tire ? `<span>${p.dans_tirage ? (p.vu ? 'A vu son résultat' : "N'a pas encore fait tourner la roue") : 'Hors tirage'}</span>` : ''}
          </div>
          <div class="actions">
            <button class="icone" data-action="admin-lien" data-jeton="${esc(p.jeton)}" data-prenom="${esc(p.prenom)}" aria-label="Copier le lien personnel de ${esc(p.prenom)}">⎘</button>
            <button class="icone" data-action="admin-renommer" data-id="${esc(p.id)}" data-prenom="${esc(p.prenom)}" aria-label="Corriger le prénom de ${esc(p.prenom)}">✎</button>
            ${tire ? '' : `<button class="icone" data-action="admin-supprimer" data-id="${esc(p.id)}" data-prenom="${esc(p.prenom)}" aria-label="Supprimer ${esc(p.prenom)}">✕</button>`}
          </div>
        </li>`).join('')}</ul>` : '<p class="doux">Personne ne s\'est encore inscrit. Partage le lien du site dans ton groupe.</p>'}
    </section>
    ${carteArrangements(a)}
    ${carteConversationsAdmin(a)}
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

function carteConversationsAdmin(a) {
  if (a.etat !== 'tire') return '';
  const n = a.nb_messages;
  const entete = `<div class="rangee" style="justify-content:space-between;margin-bottom:8px">
      <h3 style="margin:0">Messages anonymes</h3><span class="badge">${n} message${n > 1 ? 's' : ''}</span></div>`;
  if (!etat.voirMessages) {
    return `<section class="carte">${entete}
      <p class="doux petit">Tu peux lire toutes les conversations, sans que les participants le sachent. Attention : tu verras alors qui offre à qui pour ceux qui se sont écrit.</p>
      <button class="bouton discret" data-action="admin-voir-messages" ${n ? '' : 'disabled'}>Lire les conversations</button>
    </section>`;
  }
  const conv = a.messages || [];
  return `<section class="carte">${entete}
      ${conv.map(cv => `<div class="encart">
        <h3>${esc(cv.de)} offre à ${esc(cv.a)}</h3>
        <ul class="fil">${cv.mots.map(m => `<li class="${m.de_moi ? 'autre' : 'moi'}">
          <div class="bulle ${m.de_moi ? 'q' : 'r'}">${esc(m.texte)}</div>
          <span class="heure">${esc(m.de_moi ? cv.de : cv.a)} · ${esc(heureCourte(m.cree_le))}</span></li>`).join('')}</ul>
      </div>`).join('')}
      <button class="lien" data-action="admin-cacher-messages">Cacher les conversations</button>
    </section>`;
}

function carteArrangements(a) {
  if (a.etat === 'tire') return '';
  const v = a.participants.filter(p => p.valide);
  if (v.length < 2) {
    return `<section class="carte"><h3>Arrangements secrets</h3>
      <p class="doux petit">Valide d'abord les inscrits : tu pourras ensuite choisir toi-même qui offre à qui.</p></section>`;
  }
  const pris = new Map(v.filter(p => p.force_cible_id).map(p => [p.force_cible_id, p.id]));
  const choisis = v.filter(p => p.force_cible_id && v.some(c => c.id === p.force_cible_id)).length;
  return `<section class="carte">
      <div class="rangee" style="justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">Arrangements secrets</h3>
        ${choisis ? '<button class="bouton discret" data-action="admin-hasard">Tout au hasard</button>' : ''}
      </div>
      <p class="doux petit">Choisis à qui offre chaque personne. Ceux que tu laisses « au hasard » seront tirés normalement. Sur leur écran, la roue tourne comme d'habitude : personne ne voit la différence.</p>
      ${a.arrangement_ok ? '' : '<p class="erreur">Avec ces choix, il ne reste qu\'une personne à tirer et elle ne peut tomber que sur elle-même. Change un choix.</p>'}
      <ul class="arrangements">${v.map(p => `<li>
        <span class="qui-offre">${esc(p.prenom)}</span>
        <span class="fleche" aria-hidden="true">offre à</span>
        <select data-forcer="${esc(p.id)}" aria-label="${esc(p.prenom)} offre à">
          <option value="">Au hasard</option>
          ${v.filter(c => c.id !== p.id).map(c => {
            const occupe = pris.has(c.id) && pris.get(c.id) !== p.id;
            return `<option value="${esc(c.id)}"${p.force_cible_id === c.id ? ' selected' : ''}${occupe ? ' disabled' : ''}>${esc(c.prenom)}${occupe ? ' (déjà choisi)' : ''}</option>`;
          }).join('')}
        </select>
      </li>`).join('')}</ul>
      ${choisis ? `<p class="doux petit" style="margin-top:12px">${choisis} paire${choisis > 1 ? 's' : ''} choisie${choisis > 1 ? 's' : ''}, ${v.length - choisis} au hasard.</p>` : ''}
    </section>`;
}

async function actualiserAdmin({ force = false } = {}) {
  if (!etat.codeAdmin) { app.innerHTML = ecranConnexionAdmin(); return; }
  try {
    const a = await rpc('admin_etat', { p_code: etat.codeAdmin });
    if (etat.voirMessages && a.etat === 'tire') a.messages = await rpc('admin_messages', { p_code: etat.codeAdmin });
    const { maintenant: _, ...stable } = a;
    const empreinte = JSON.stringify(stable);
    if (!force && (empreinte === etat.empreinte || enSaisie())) { etat.enAttente = empreinte !== etat.empreinte; return; }
    etat.enAttente = false;
    etat.empreinte = empreinte;
    etat.admin = a;
    document.body.classList.remove('sur-roue');
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
    if (v.echeance && new Date(v.echeance).getTime() <= maintenant()
        && !confirm('Cette date est déjà passée : le tirage va se lancer tout de suite entre les inscrits validés. Continuer ?')) return;
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
  'admin-voir-messages'() { etat.voirMessages = true; actualiserAdmin({ force: true }); },
  'admin-cacher-messages'() { etat.voirMessages = false; actualiserAdmin({ force: true }); },
  async 'admin-lien'(b) {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}?k=${b.dataset.jeton}`);
      toast(`Lien de ${b.dataset.prenom} copié : envoie-le-lui en privé`);
    } catch { toast('Copie impossible'); }
  },
  'admin-hasard': () => confirm('Remettre toutes les paires au hasard ?') && admin('admin_forcer', { p_id: null, p_cible: null }, 'Tout est remis au hasard'),
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
  const s = e.target.closest('[data-forcer]');
  if (s) admin('admin_forcer', { p_id: s.dataset.forcer, p_cible: s.value || null });
});

app.addEventListener('focusout', () => {
  setTimeout(() => { if (etat.enAttente && !enSaisie()) rafraichir(); }, 150);
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
    if (etat.enAttente && !enSaisie()) { etat.enAttente = false; dernier = Date.now(); rafraichir(); return; }
    const d = etat.donnees;
    const echeancePassee = !modeAdmin() && d?.etat === 'inscriptions' && d.echeance
      && new Date(d.echeance).getTime() <= maintenant();
    const attente = echeancePassee ? 2000 : (d?.etat === 'tire' && etat.jeton) ? 4000 : 15000;
    if (Date.now() - dernier > attente) {
      dernier = Date.now();
      rafraichir();
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichir(); });
  addEventListener('hashchange', () => { etat.empreinte = ''; rafraichir({ force: true }); });
}

demarrer();
