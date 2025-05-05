const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  type: { type: Number, required: true },
  uniqueAmount: { type: Number, required: true },
  email: { type: String, required: true },
  status: { 
    type: String, 
    required: true,
    enum: ['pending', 'paid', 'expired'],
    default: 'pending'
  },
  expiration: { type: Date, required: true },
  voucherKey: String,
  paymentData: mongoose.Schema.Types.Mixed,
  emailSent: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);