require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { generateQRIS, checkQRISStatus } = require('./qris');

// =============================================
//               KONFIGURASI
// =============================================
const BASE_QR = '00020101021126670016COM.NOBUBANK.WWW01189360050300000879140214443108100695060303UMI51440014ID.CO.QRIS.WWW0215ID20243440248960303UMI5204541153033605802ID5925ONE CLASH STORE OK20128206006BREBES61055221262070703A0163043B64';
const MERCHANT_CODE = 'OK2012820';
const API_KEY = '845510317401655202012820OKCT7C4EC82A4073494224275046D8525360';

// =============================================
//            Nodemailer Configuration
// =============================================
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// =============================================
//              MongoDB Connection
// =============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://oneclash2022:oneclashstore@vwproject.lhdzieq.mongodb.net/?retryWrites=true&w=majority&appName=VWProject';

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

connectDB();

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
});
mongoose.connection.on('error', (err) => {
  console.log('Mongoose connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// =============================================
//               SCHEMA & MODEL
// =============================================
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

const voucherSchema = new mongoose.Schema({
  type: { type: Number, required: true },
  key: { type: String, required: true, unique: true },
  used: { type: Boolean, default: false }
});

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
const Voucher = mongoose.model('Voucher', voucherSchema);
const Counter = mongoose.model('Counter', counterSchema);

// =============================================
//              FUNGSI UTILITAS
// =============================================
const basePrices = { 
  1: 20,    // 6 Jam
  2: 30,    // 12 Jam
  3: 60,    // 3 Hari
  4: 100,   // 7 Hari
  5: 350    // 30 Hari
};

const voucherTypes = { 
  1: '6 Jam',
  2: '12 Jam',
  3: '3 Hari',
  4: '7 Hari',
  5: '30 Hari'
};

async function getNextSequence(type) {
  const result = await Counter.findByIdAndUpdate(
    `type_${type}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return result.seq;
}

async function getUniqueAmount(type) {
  const sequence = await getNextSequence(type);
  return basePrices[type] + sequence;
}

function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// Fungsi untuk mengirim email QRIS (diperbarui)
async function sendQRISEmail(email, transactionId, qrUrl, amount, expiresAt, voucherType) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `ONE CLASH STORE - Kode Pembayaran QRIS Voucher WiFi ${voucherTypes[voucherType]}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h2 style="color: #4a4a4a; text-align: center;">Kode Pembayaran QRIS Anda</h2>
          <p>Berikut adalah kode QR untuk pembayaran voucher WiFi Anda:</p>
          <div style="text-align: center;">
            <img src="${qrUrl}" alt="QRIS Code" style="max-width: 300px; height: auto;">
          </div>
          <div style="margin: 20px 0; padding: 15px; background-color: #f8f8f8; border-radius: 5px;">
            <p><strong>Detail Transaksi:</strong></p>
            <p>ID Transaksi: ${transactionId}</p>
            <p>Jenis Voucher: ${voucherTypes[voucherType]}</p>
            <p>Jumlah Pembayaran: Rp ${amount},</p>
            <p>Berlaku Hingga: ${new Date(expiresAt).toLocaleString('id-ID')}</p>
          </div>
          <p>Silakan scan kode QR di atas menggunakan aplikasi e-wallet Anda.</p>
          <p style="color: #888; font-size: 12px;">Email ini dibuat secara otomatis, mohon jangan dibalas.</p>
          <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #888; font-size: 12px;">ONE CLASH STORE &copy; ${new Date().getFullYear()}</p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email QRIS sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Send QRIS Email Error:', error);
    return false;
  }
}

// Fungsi untuk mengirim email Voucher (diperbarui)
async function sendVoucherEmail(email, voucherKey, voucherType) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `ONE CLASH STORE - Voucher WiFi ${voucherTypes[voucherType]} Anda`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h2 style="color: #4a4a4a; text-align: center;">Voucher WiFi Anda</h2>
          <p>Terima kasih atas pembayaran Anda. Berikut adalah kode voucher WiFi Anda:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; padding: 15px 30px; background-color: #f8f8f8; border: 2px dashed #4a4a4a; border-radius: 5px;">
              <h3 style="margin: 0; font-size: 24px; letter-spacing: 2px;">${voucherKey}</h3>
            </div>
          </div>
          <div style="margin: 20px 0; padding: 15px; background-color: #f8f8f8; border-radius: 5px;">
            <p><strong>Detail Voucher:</strong></p>
            <p>Jenis Voucher: ${voucherTypes[voucherType]}</p>
            <p>Cara Penggunaan:</p>
            <ol>
              <li>Sambungkan ke WiFi "ONE CLASH STORE"</li>
              <li>Buka browser dan masukkan kode voucher di atas</li>
              <li>Klik "Login" untuk mulai menggunakan internet</li>
            </ol>
          </div>
          <p>Selamat menikmati layanan internet dari ONE CLASH STORE!</p>
          <p style="color: #888; font-size: 12px;">Email ini dibuat secara otomatis, mohon jangan dibalas.</p>
          <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
            <p style="color: #888; font-size: 12px;">ONE CLASH STORE &copy; ${new Date().getFullYear()}</p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email voucher sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Send Voucher Email Error:', error);
    return false;
  }
}

// =============================================
//               MIDDLEWARE ADMIN
// =============================================
const adminAuth = (req, res, next) => {
  const apiKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (apiKey === process.env.ADMIN_API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// =============================================
//               ENDPOINT API
// =============================================
const app = express();
app.set('json spaces', 2);
app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Generate QRIS dengan validasi tipe 1-5
app.post('/api/generate-qr', async (req, res) => {
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
    const qrData = await generateQRIS(uniqueAmount, BASE_QR);

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

app.get('/api/check-status/:trxId', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.trxId
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Jika transaksi sudah dalam status 'paid', langsung kembalikan status tersebut
    if (transaction.status === 'paid') {
      return res.json({ 
        status: 'paid',
        amount: transaction.uniqueAmount,
        paidAt: transaction.paymentData?.date || transaction.updatedAt
      });
    }

    // Jika transaksi sudah dalam status 'expired', langsung kembalikan status tersebut
    if (transaction.status === 'expired') {
      return res.json({ status: 'expired' });
    }

    // Cek pembayaran terlebih dahulu
    const mutations = await checkQRISStatus(MERCHANT_CODE, API_KEY);
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

    // Jika tidak ditemukan pembayaran, cek apakah sudah expired
    if (new Date() > transaction.expiration) {
      transaction.status = 'expired';
      await transaction.save();
      return res.json({ status: 'expired' });
    }

    // Jika tidak paid dan tidak expired, maka statusnya masih pending
    res.json({ status: 'pending' });

  } catch (error) {
    console.error('Check Status Error:', error);
    res.status(500).json({
      error: 'Failed to check status',
      detail: error.message
    });
  }
});

app.get('/api/get-voucher/:trxId', async (req, res) => {
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

    // Kirim email voucher setelah transaksi berhasil
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

// Endpoint untuk mengirim ulang email QRIS
app.post('/api/resend-qris-email/:trxId', async (req, res) => {
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

    // Regenerate QR URL if needed
    const qrData = await generateQRIS(transaction.uniqueAmount, BASE_QR);

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

// Endpoint untuk mengirim ulang email voucher
app.post('/api/resend-voucher-email/:trxId', async (req, res) => {
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

// Endpoint admin dengan autentikasi
app.get('/api/admin/reset-sequence/:type', adminAuth, async (req, res) => {
  try {
    const type = parseInt(req.params.type);

    if (!type || ![1, 2, 3, 4, 5].includes(type)) {
      return res.status(400).json({
        error: 'Invalid voucher type',
        validTypes: [1, 2, 3, 4, 5]
      });
    }

    await Counter.updateOne(
      { _id: `type_${type}` },
      { $set: { seq: 0 } }
    );

    res.json({ 
      success: true, 
      message: `Sequence for type ${type} has been reset to 0`
    });
  } catch (error) {
    console.error('Reset Sequence Error:', error);
    res.status(500).json({
      error: 'Failed to reset sequence',
      detail: error.message
    });
  }
});

// Endpoint untuk mereset semua sequence
app.get('/api/admin/reset-all-sequences', adminAuth, async (req, res) => {
  try {
    const result = await Counter.updateMany(
      { _id: { $in: ['type_1', 'type_2', 'type_3', 'type_4', 'type_5'] } },
      { $set: { seq: 0 } }
    );

    res.json({ 
      success: true, 
      message: `Reset ${result.modifiedCount} sequence counters`
    });
  } catch (error) {
    console.error('Reset All Sequences Error:', error);
    res.status(500).json({
      error: 'Failed to reset sequences',
      detail: error.message
    });
  }
});

// Endpoint untuk mendapatkan nilai sequence saat ini
app.get('/api/admin/get-sequences', adminAuth, async (req, res) => {
  try {
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

// Endpoint untuk mengatur nilai sequence ke nilai tertentu
app.get('/api/admin/set-sequence', adminAuth, async (req, res) => {
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

// Tambah Voucher
app.post('/api/admin/add-vouchers', adminAuth, async (req, res) => {
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

// Hapus Voucher by Key
app.delete('/api/admin/delete-vouchers/:key', adminAuth, async (req, res) => {
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

// Get semua transaksi (admin only)
app.get('/api/admin/get-transactions', adminAuth, async (req, res) => {
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

// Hapus transaksi by ID (admin only)
app.delete('/api/admin/delete-transactions/:trxId', adminAuth, async (req, res) => {
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

// Hapus Semua Transaksi
app.delete('/api/admin/delete-all-transactions', adminAuth, async (req, res) => {
  try {
    const result = await Transaction.deleteMany({});
    res.json({ message: `Successfully deleted ${result.deletedCount} transactions.` });
  } catch (error) {
    console.error('Delete all transactions error:', error);
    res.status(500).json({ error: 'Failed to delete transactions.', detail: error.message });
  }
});

// =============================================
//               INISIALISASI
// =============================================
const PORT = process.env.PORT || 55224;
app.listen(PORT, () => {
  console.log(`
  ====================================
   WiFi Voucher System Running
   Port: ${PORT}
  ====================================`);
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});