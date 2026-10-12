const pino = require('pino');
const { useMongoAuthState, clearAuth } = require('./mongoAuthState');

const connection = { connected: false, qr: null };
let currentSock = null;

async function connect() {
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const { DisconnectReason, Browsers, fetchLatestBaileysVersion } = baileys;

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {}

  const start = async () => {
    const { state, saveCreds } = await useMongoAuthState();
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
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log('Connexion fermée. Code :', code, '|', lastDisconnect?.error?.message);
        if (code === DisconnectReason.loggedOut) {
          console.log('Appareil déconnecté : nouvelle liaison nécessaire');
          await clearAuth();
          setTimeout(start, 1000);
        } else {
          setTimeout(start, code === DisconnectReason.restartRequired ? 500 : 3000);
        }
      }
    });
  };

  await start();
}

function getSock() {
  if (!connection.connected || !currentSock) throw new Error('WhatsApp non connecté');
  return currentSock;
}

module.exports = { connect, getSock, connection };