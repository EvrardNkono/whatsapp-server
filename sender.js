const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { useMongoAuthState, clearAuth } = require('./mongoAuthState');

const connection = { connected: false };
let currentSock = null;

async function connect() {
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const { DisconnectReason, Browsers } = baileys;

  const start = async () => {
    const { state, saveCreds } = await useMongoAuthState();
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers ? Browsers.macOS('Chrome') : undefined,
      markOnlineOnConnect: false,
    });
    currentSock = sock;
    let pairingAsked = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection: status, lastDisconnect, qr }) => {
      if (status) console.log('Statut WhatsApp :', status);

      if (qr) {
        const phone = (process.env.WA_PAIRING_PHONE || '').replace(/\D/g, '');
        if (phone && !state.creds.registered) {
          if (!pairingAsked) {
            pairingAsked = true;
            try {
              const code = await sock.requestPairingCode(phone);
              console.log('=================================');
              console.log('CODE DE JUMELAGE WHATSAPP :', code, '(numéro', phone + ')');
              console.log('=================================');
            } catch (e) {
              console.error('Jumelage impossible :', e.message);
            }
          }
        } else {
          console.log('Scanne ce QR code avec WhatsApp (Appareils connectés) :');
          qrcode.generate(qr, { small: true });
        }
      }

      if (status === 'open') {
        connection.connected = true;
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
          // 515 = redémarrage demandé par WhatsApp juste après la liaison
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