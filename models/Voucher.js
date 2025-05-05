const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  type: { type: Number, required: true },
  key: { type: String, required: true, unique: true },
  used: { type: Boolean, default: false }
});

module.exports = mongoose.model('Voucher', voucherSchema);