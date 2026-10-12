require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { connect, connection } = require('./sender');
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
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, whatsapp: connection.connected }));
app.post('/api/whatsapp/login', login);
app.use('/api/whatsapp', requireAuth, require('./routes'));

const PORT = process.env.PORT || 4000;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connecté');
  app.listen(PORT, () => console.log(`API sur le port ${PORT}`));
  connect().catch((e) => console.error('Erreur WhatsApp :', e));
})();