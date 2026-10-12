require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { connect, connection } = require('./sender');
const { clearAuth, importAuth } = require('./mongoAuthState');
const { login, requireAuth } = require('./auth');

for (const v of ['MONGODB_URI', 'WA_PASSWORD', 'WA_JWT_SECRET']) {
  if (!process.env[v]) throw new Error(`Variable manquante : ${v}`);
}

const app = express();
app.set('trust proxy', 1); // Render est derrière un proxy

const origins = (process.env.ALLOWED_ORIGINS ||
  'https://restaurantsignature.fr,https://www.restaurantsignature.fr,http://localhost:5173,http://localhost:5174,http://localhost:3000'
).split(',');

app.use(cors({ origin: origins }));

// Import d'une session créée en local : actif seulement tant que WA_SETUP_KEY existe
app.post('/import-session', express.json({ limit: '10mb' }), async (req, res) => {
  const key = process.env.WA_SETUP_KEY;
  if (!key || req.query.key !== key) return res.status(404).send('Not found');
  const files = req.body && req.body.files;
  if (!files || !files['creds.json']) return res.status(400).json({ error: 'creds.json manquant' });
  try {
    await importAuth(files);
    res.json({ ok: true, files: Object.keys(files).length });
    console.log('Session importée, redémarrage du service');
    setTimeout(() => process.exit(0), 300); // Render relance le service avec la nouvelle session
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Page d'import (à ouvrir dans le navigateur avec VPN) : active seulement tant que WA_SETUP_KEY existe
app.get('/import', (req, res) => {
  const key = process.env.WA_SETUP_KEY;
  if (!key || req.query.key !== key) return res.status(404).send('Not found');
  res.set('Cache-Control', 'no-store');
  res.send(`<meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:sans-serif;max-width:480px;margin:2em auto;padding:0 1em">
<h2>Importer la session</h2>
<p>Choisis le dossier <b>auth_local</b> de ton PC, puis clique sur Envoyer.</p>
<input id="f" type="file" webkitdirectory multiple>
<p><button id="go">Envoyer</button></p>
<pre id="out" style="white-space:pre-wrap"></pre>
<script>
document.getElementById('go').onclick = async () => {
  const out = document.getElementById('out');
  const list = [...document.getElementById('f').files].filter(f => f.name.endsWith('.json'));
  if (!list.length) { out.textContent = 'Aucun fichier choisi'; return; }
  out.textContent = 'Lecture de ' + list.length + ' fichiers...';
  const files = {};
  for (const f of list) files[f.name] = await f.text();
  out.textContent = 'Envoi...';
  try {
    const r = await fetch('/import-session' + location.search, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files })
    });
    out.textContent = 'Reponse : ' + r.status + ' ' + (await r.text());
  } catch (e) { out.textContent = 'Erreur : ' + e.message; }
};
</script></body>`);
});

app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, whatsapp: connection.connected }));

// Page de liaison : active seulement tant que WA_SETUP_KEY existe
app.get('/qr', async (req, res) => {
  const key = process.env.WA_SETUP_KEY;
  if (!key || req.query.key !== key) return res.status(404).send('Not found');
  res.set('Cache-Control', 'no-store');
  if (connection.connected) {
    return res.send('<h2 style="font-family:sans-serif">WhatsApp connecté ✅</h2>');
  }
  if (!connection.qr) {
    return res.send('<meta http-equiv="refresh" content="3"><p style="font-family:sans-serif">QR en préparation…</p>');
  }
  const img = await QRCode.toDataURL(connection.qr, { width: 360, margin: 2 });
  res.send(`<meta http-equiv="refresh" content="15">
<meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:sans-serif;text-align:center">
<h2>Scanne avec WhatsApp</h2>
<img src="${img}" width="320" alt="QR code">
<p>Appareils connectés, puis Connecter un appareil</p></body>`);
});

app.post('/api/whatsapp/login', login);
app.use('/api/whatsapp', requireAuth, require('./routes'));

const PORT = process.env.PORT || 4000;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connecté');
  if (process.env.WA_RESET === '1') {
    await clearAuth();
    console.log('Session WhatsApp réinitialisée');
  }
  app.listen(PORT, () => console.log(`API sur le port ${PORT}`));
  connect().catch((e) => console.error('Erreur WhatsApp :', e));
})();