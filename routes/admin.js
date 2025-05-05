const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Voucher = require('../models/Voucher');
const { voucherTypes } = require('../utils/email');
const adminAuth = require('../middleware/adminAuth');

router.get('/get-sequences', adminAuth, async (req, res) => {
  try {
    const Counter = require('../models/Counter');
    const counters = await Counter.find({
      _id: { $in: ['type_1', 'type_2', 'type_3', 'type_4', 'type_5'] }
    });

    const result = {};
    counters.forEach(counter => {
      const type = counter._id.replace('type_', '');
      result[type] = counter.seq;
    });

    res.json(result);
  } catch (error) {
    console.error('Get Sequences Error:', error);
    res.status(500).json({
      error: 'Failed to get sequences',
      detail: error.message
    });
  }
});

router.get('/set-sequence', adminAuth, async (req, res) => {
  try {
    const { type, value } = req.query;
    const numType = parseInt(type);
    const numValue = parseInt(value);

    if (!numType || ![1, 2, 3, 4, 5].includes(numType)) {
      return res.status(400).json({
        error: 'Invalid voucher type',
        validTypes: [1, 2, 3, 4, 5]
      });
    }

    if (isNaN(numValue)) {
      return res.status(400).json({
        error: 'Invalid sequence value'
      });
    }

    const Counter = require('../models/Counter');
    await Counter.updateOne(
      { _id: `type_${numType}` },
      { $set: { seq: numValue } },
      { upsert: true }
    );

    res.json({ 
      success: true, 
      message: `Sequence for type ${numType} has been set to ${numValue}`
    });
  } catch (error) {
    console.error('Set Sequence Error:', error);
    res.status(500).json({
      error: 'Failed to set sequence',
      detail: error.message
    });
  }
});

router.post('/add-vouchers', adminAuth, async (req, res) => {
  try {
    const { type, key } = req.body;

    if (![1, 2, 3, 4, 5].includes(type)) {
      return res.status(400).json({ error: 'Invalid voucher type. Valid types are 1, 2, 3, 4, 5.' });
    }

    if (!key || key.trim() === '') {
      return res.status(400).json({ error: 'Voucher key is required.' });
    }

    const existingVoucher = await Voucher.findOne({ key });
    if (existingVoucher) {
      return res.status(400).json({ error: 'Voucher key already exists.' });
    }

    const newVoucher = new Voucher({ type, key, used: false });
    await newVoucher.save();

    res.status(201).json({
      message: 'Voucher added successfully.',
      voucher: { type: newVoucher.type, key: newVoucher.key }
    });
  } catch (error) {
    console.error('Add voucher error:', error);
    res.status(500).json({ error: 'Failed to add voucher.', detail: error.message });
  }
});

router.delete('/delete-vouchers/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const voucher = await Voucher.findOneAndDelete({ key });

    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found.' });
    }

    res.json({
      message: 'Voucher deleted successfully.',
      deletedVoucher: { key: voucher.key, type: voucher.type }
    });
  } catch (error) {
    console.error('Delete voucher error:', error);
    res.status(500).json({ error: 'Failed to delete voucher.', detail: error.message });
  }
});

router.get('/get-all-vouchers', adminAuth, async (req, res) => {
  try {
    const allVouchers = await Voucher.find()
      .sort({ type: 1, createdAt: -1 });

    const groupedVouchers = {
      type1: [],
      type2: [],
      type3: [],
      type4: [],
      type5: [],
    };

    allVouchers.forEach(voucher => {
      const entry = {
        key: voucher.key,
        used: voucher.used,
        createdAt: voucher.createdAt,
        voucherType: voucherTypes[voucher.type]
      };

      switch(voucher.type) {
        case 1: groupedVouchers.type1.push(entry); break;
        case 2: groupedVouchers.type2.push(entry); break;
        case 3: groupedVouchers.type3.push(entry); break;
        case 4: groupedVouchers.type4.push(entry); break;
        case 5: groupedVouchers.type5.push(entry); break;
      }
    });

    const response = {
      total_vouchers: allVouchers.length,
      types: {
        type1: {
          total: groupedVouchers.type1.length,
          available: groupedVouchers.type1.filter(v => !v.used).length,
          vouchers: groupedVouchers.type1
        },
        type2: {
          total: groupedVouchers.type2.length,
          available: groupedVouchers.type2.filter(v => !v.used).length,
          vouchers: groupedVouchers.type2
        },
        type3: {
          total: groupedVouchers.type3.length,
          available: groupedVouchers.type3.filter(v => !v.used).length,
          vouchers: groupedVouchers.type3
        },
        type4: {
          total: groupedVouchers.type4.length,
          available: groupedVouchers.type4.filter(v => !v.used).length,
          vouchers: groupedVouchers.type4
        },
        type5: {
          total: groupedVouchers.type5.length,
          available: groupedVouchers.type5.filter(v => !v.used).length,
          vouchers: groupedVouchers.type5
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Get all vouchers error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve vouchers',
      detail: error.message
    });
  }
});

router.get('/get-transactions', adminAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 }) 
      .select('-__v -paymentData._id'); 

    res.json({
      count: transactions.length,
      transactions: transactions.map(trx => ({
        id: trx.transactionId,
        type: trx.type,
        voucherType: voucherTypes[trx.type],
        amount: trx.uniqueAmount, 
        email: trx.email,
        status: trx.status,
        voucherSent: !!trx.voucherKey,
        createdAt: trx.createdAt,
        expiredAt: trx.expiration
      }))
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ 
      error: 'Failed to get transactions',
      detail: error.message
    });
  }
});

router.delete('/delete-transactions/:trxId', adminAuth, async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      transactionId: req.params.trxId
    });

    if (!transaction) {
      return res.status(404).json({ 
        error: 'Transaction not found' 
      });
    }

    res.json({
      success: true,
      message: 'Transaction deleted',
      deletedTransaction: {
        id: transaction.transactionId,
        type: transaction.type,
        amount: transaction.uniqueAmount,
        status: transaction.status
      }
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ 
      error: 'Failed to delete transaction',
      detail: error.message
    });
  }
});

router.delete('/delete-all-transactions', adminAuth, async (req, res) => {
  try {
    const result = await Transaction.deleteMany({});
    res.json({ message: `Successfully deleted ${result.deletedCount} transactions.` });
  } catch (error) {
    console.error('Delete all transactions error:', error);
    res.status(500).json({ error: 'Failed to delete transactions.', detail: error.message });
  }
});

module.exports = router;