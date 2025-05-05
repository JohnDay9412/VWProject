const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Voucher = require('../models/Voucher');
const { generateQRIS, checkQRISStatus } = require('../utils/qris');
const { sendQRISEmail, sendVoucherEmail, voucherTypes } = require('../utils/email');
const { getUniqueAmount, validateEmail } = require('../utils/helpers');

// Generate QRIS
router.post('/generate-qr', async (req, res) => {
  try {
    const { type, email } = req.body;

    if (!type || ![1, 2, 3, 4, 5].includes(Number(type))) {
      return res.status(400).json({
        error: 'Invalid voucher type',
        validTypes: [1, 2, 3, 4, 5]
      });
    }

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        error: 'Valid email address is required'
      });
    }

    const numericType = Number(type);
    const uniqueAmount = await getUniqueAmount(numericType);
    const qrData = await generateQRIS(uniqueAmount, process.env.BASE_QR);

    const newTransaction = new Transaction({
      transactionId: qrData.transactionId,
      type: numericType,
      uniqueAmount,
      email: email,
      expiration: qrData.expirationTime
    });

    await newTransaction.save();

    const emailSent = await sendQRISEmail(
      email, 
      qrData.transactionId, 
      qrData.qrImageUrl, 
      uniqueAmount, 
      qrData.expirationTime,
      numericType
    );

    if (emailSent) {
      newTransaction.emailSent = true;
      await newTransaction.save();
    }

    res.json({
      transactionId: qrData.transactionId,
      qrUrl: qrData.qrImageUrl,
      amount: uniqueAmount,
      expiresAt: qrData.expirationTime,
      emailSent: emailSent
    });
  } catch (error) {
    console.error('Generate QR Error:', error);
    res.status(500).json({ 
      error: 'Failed to generate QR',
      detail: error.message
    });
  }
});

// Check transaction status
router.get('/check-status/:trxId', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.trxId
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status === 'paid') {
      return res.json({ 
        status: 'paid',
        amount: transaction.uniqueAmount,
        paidAt: transaction.paymentData?.date || transaction.updatedAt
      });
    }

    if (transaction.status === 'expired') {
      return res.json({ status: 'expired' });
    }

    const mutations = await checkQRISStatus(process.env.MERCHANT_CODE, process.env.API_KEY);
    const payment = mutations.find(m => 
      parseInt(m.amount) === transaction.uniqueAmount &&
      m.type === 'CR'
    );

    if (payment) {
      transaction.status = 'paid';
      transaction.paymentData = payment;
      await transaction.save();
      return res.json({ 
        status: 'paid',
        amount: transaction.uniqueAmount,
        paidAt: payment.date
      });
    }

    if (new Date() > transaction.expiration) {
      transaction.status = 'expired';
      await transaction.save();
      return res.json({ status: 'expired' });
    }

    res.json({ status: 'pending' });
  } catch (error) {
    console.error('Check Status Error:', error);
    res.status(500).json({
      error: 'Failed to check status',
      detail: error.message
    });
  }
});

// Get voucher
router.get('/get-voucher/:trxId', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.trxId
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'paid') {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Payment not confirmed' });
    }

    if (transaction.voucherKey) {
      await session.abortTransaction();
      return res.json({ voucher: transaction.voucherKey });
    }

    const voucher = await Voucher.findOneAndUpdate(
      { type: transaction.type, used: false },
      { $set: { used: true } },
      { new: true, session }
    );

    if (!voucher) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Voucher out of stock' });
    }

    transaction.voucherKey = voucher.key;
    await transaction.save({ session });

    const emailSent = await sendVoucherEmail(
      transaction.email,
      voucher.key,
      transaction.type
    );

    await session.commitTransaction();
    res.json({ 
      voucher: voucher.key,
      emailSent: emailSent
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Get Voucher Error:', error);
    res.status(500).json({ 
      error: 'Failed to get voucher',
      detail: error.message
    });
  } finally {
    session.endSession();
  }
});

// Resend QRIS email
router.post('/resend-qris-email/:trxId', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.trxId
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ error: 'Transaction is no longer pending' });
    }

    const qrData = await generateQRIS(transaction.uniqueAmount, process.env.BASE_QR);

    const emailSent = await sendQRISEmail(
      transaction.email,
      transaction.transactionId,
      qrData.qrImageUrl,
      transaction.uniqueAmount,
      transaction.expiration,
      transaction.type
    );

    if (emailSent) {
      transaction.emailSent = true;
      await transaction.save();
      return res.json({ success: true, message: 'Email resent successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Resend Email Error:', error);
    res.status(500).json({
      error: 'Failed to resend email',
      detail: error.message
    });
  }
});

// Resend voucher email
router.post('/resend-voucher-email/:trxId', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.trxId
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'paid' || !transaction.voucherKey) {
      return res.status(400).json({ error: 'No voucher available for this transaction' });
    }

    const emailSent = await sendVoucherEmail(
      transaction.email,
      transaction.voucherKey,
      transaction.type
    );

    if (emailSent) {
      return res.json({ success: true, message: 'Voucher email resent successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to send voucher email' });
    }
  } catch (error) {
    console.error('Resend Voucher Email Error:', error);
    res.status(500).json({
      error: 'Failed to resend voucher email',
      detail: error.message
    });
  }
});

module.exports = router;