const pino = require('pino');
const { useMongoAuthState, clearAuth } = require('./mongoAuthState');

const connection = { connected: false, qr: null };
let currentSock = null;
let starting = false;

async function connect() {
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const { DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;

  const start = async () => {
    if (starting) return;
    starting = true;
    try {
      const { state, saveCreds } = await useMongoAuthState();

      // Version courante du protocole WhatsApp (évite les rejets 405)
      let version;
      try {
        ({ version } = await fetchLatestBaileysVersion());
        console.log('Version WhatsApp Web :', version.join('.'));
      } catch (e) {
        console.log('Version par défaut utilisée :', e.message);
      }

      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers ? Browsers.macOS('Chrome') : undefined,
        markOnlineOnConnect: false,
      });
      currentSock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async ({ connection: status, lastDisconnect, qr }) => {
        if (status) console.log('Statut WhatsApp :', status);

        if (qr) {
          connection.qr = qr;
          console.log('QR prêt : ouvre la page /qr de ton service');
        }

        if (status === 'open') {
          connection.connected = true;
          connection.qr = null;
          console.log('WhatsApp connecté');
        }

        if (status === 'close') {
          connection.connected = false;
          connection.qr = null;
          const code = lastDisconnect?.error?.output?.statusCode;
          console.log('Connexion fermée. Code :', code, '|', lastDisconnect?.error?.message);
          if (code === DisconnectReason.loggedOut) {
            console.log('Appareil déconnecté : nouvelle liaison nécessaire');
            await clearAuth();
            setTimeout(start, 1000);
          } else {
            // 515 = redémarrage demandé par WhatsApp juste après la liaison
            setTimeout(start, code === DisconnectReason.restartRequired ? 500 : 3000);
          }
        }
      });
    } finally {
      starting = false;
    }
  };

  await start();
}

function getSock() {
  if (!connection.connected || !currentSock) throw new Error('WhatsApp non connecté');
  return currentSock;
}

module.exports = { connect, getSock, connection };