const express = require('express');
const multer = require('multer');
const Contact = require('./Contact');
const { startSend, job } = require('./service');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

const cleanPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^00/, '');

// Liste
router.get('/contacts', async (req, res) => {
  res.json(await Contact.find().sort({ createdAt: -1 }));
});

// Ajout (un ou plusieurs) : { contacts: [{ phone, name? }] }
router.post('/contacts', async (req, res) => {
  const list = (req.body.contacts || [])
    .map((c) => ({ phone: cleanPhone(c.phone), name: c.name || '' }))
    .filter((c) => c.phone.length >= 8 && c.phone.length <= 15);
  let added = 0;
  for (const c of list) {
    const r = await Contact.updateOne({ phone: c.phone }, { $setOnInsert: c }, { upsert: true });
    if (r.upsertedCount) added++;
  }
  res.json({ added, ignored: list.length - added });
});

// Suppression
router.delete('/contacts/:id', async (req, res) => {
  await Contact.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

// Envoi : multipart (text, ids, all, media?)
router.post('/send', upload.single('media'), async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text && !req.file) return res.status(400).json({ error: 'Message vide' });

    const filter = { optOut: false };
    if (req.body.all !== 'true') filter._id = { $in: JSON.parse(req.body.ids || '[]') };
    const contacts = await Contact.find(filter);
    if (!contacts.length) return res.status(400).json({ error: 'Aucun contact sélectionné' });

    await startSend({ contacts, text, media: req.file });
    res.json({ started: true, total: contacts.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Progression
router.get('/status', (req, res) => res.json(job));

module.exports = router;