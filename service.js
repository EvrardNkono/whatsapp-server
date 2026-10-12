const { getSock } = require('./sender');
const Contact = require('./Contact');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

const job = { running: false, total: 0, done: 0, sent: 0, failed: 0 };

async function startSend({ contacts, text, media }) {
  if (job.running) throw new Error('Un envoi est déjà en cours');
  const s = getSock();
  Object.assign(job, { running: true, total: contacts.length, done: 0, sent: 0, failed: 0 });

  (async () => {
    for (const c of contacts) {
      const caption = text.replace('{prenom}', c.name || '').trim();
      let content = { text: caption };
      if (media) {
        content = media.mimetype.startsWith('video')
          ? { video: media.buffer, caption }
          : { image: media.buffer, caption };
      }
      try {
        await s.sendMessage(c.phone + '@s.whatsapp.net', content);
        job.sent++;
        await Contact.updateOne({ _id: c._id }, { lastStatus: 'sent', lastSentAt: new Date() });
      } catch (e) {
        job.failed++;
        await Contact.updateOne({ _id: c._id }, { lastStatus: 'failed' });
      }
      job.done++;
      await sleep(rand(5000, 15000)); // délai aléatoire anti-ban
    }
    job.running = false;
  })();
}

module.exports = { startSend, job };