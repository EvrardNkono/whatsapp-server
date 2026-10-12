const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true }, // avec indicatif, sans +
  name: { type: String, default: '' },                   // facultatif
  optOut: { type: Boolean, default: false },
  lastStatus: { type: String, default: '' },             // sent / failed
  lastSentAt: Date,
}, { timestamps: true });

module.exports = mongoose.models.WaContact || mongoose.model('WaContact', ContactSchema);