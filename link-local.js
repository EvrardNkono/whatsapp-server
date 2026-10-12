// Liaison WhatsApp en local (sans MongoDB), puis envoi de la session vers Render.
// Usage : node link-local.js https://whatsapp-server-9z7z.onrender.com TA_CLE_WA_SETUP_KEY
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const QRCode = require('qrcode');

const [url, key] = process.argv.slice(2);
if (!url || !key) {
  console.log('Usage : node link-local.js URL_RENDER WA_SETUP_KEY');
  process.exit(1);
}

const DIR = path.join(__dirname, 'auth_local');

async function main() {
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {}

  const link = () =>
    new Promise(async (resolve, reject) => {
      const { state, saveCreds } = await useMultiFileAuthState(DIR);
      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Chrome'),
        markOnlineOnConnect: false,
      });
      let done = false;
      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          console.log('\nScanne ce QR (WhatsApp > Appareils connectés > Connecter un appareil) :\n');
          console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
        }
        if (connection === 'open' && !done) {
          done = true;
          console.log('WhatsApp connecté. Enregistrement de la session…');
          setTimeout(() => {
            try { sock.end(undefined); } catch {}
            resolve();
          }, 8000);
        }
        if (connection === 'close' && !done) {
          const code = lastDisconnect?.error?.output?.statusCode;
          console.log('Connexion fermée. Code :', code);
          if (code === DisconnectReason.restartRequired) {
            console.log('Redémarrage demandé par WhatsApp (normal)…');
            resolve(link());
          } else {
            reject(new Error('Liaison échouée, code ' + code));
          }
        }
      });
    });

  // Si une session valide existe déjà dans auth_local, on saute la liaison (pas de nouveau scan)
  let already = false;
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DIR, 'creds.json'), 'utf8'));
    already = !!c.me;
  } catch {}
  if (already) {
    console.log('Session locale déjà liée : envoi direct vers Render (sans nouveau scan).');
  } else {
    await link();
  }

  const files = {};
  for (const f of fs.readdirSync(DIR)) {
    files[f] = fs.readFileSync(path.join(DIR, f), 'utf8');
  }
  if (!files['creds.json']) throw new Error('creds.json introuvable');
  const body = JSON.stringify({ files });
  console.log(`Envoi de ${Object.keys(files).length} fichiers (${(body.length / 1048576).toFixed(1)} Mo) vers Render…`);

  const r = await fetch(`${url.replace(/\/$/, '')}/import-session?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(180000),
  });
  console.log('Réponse de Render :', r.status, await r.text());
  process.exit(0);
}

main().catch((e) => {
  console.error('Erreur :', e.message, e.cause ? '| ' + (e.cause.code || e.cause.message) : '');
  console.error('Si c\'est une erreur réseau : utilise le partage de connexion du téléphone, puis relance la même commande (sans rescanner).');
  process.exit(1);
});