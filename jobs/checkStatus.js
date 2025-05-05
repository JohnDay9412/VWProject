const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const { checkQRISStatus } = require('../utils/qris');

/*
async function checkPendingTransactions() {
  try {
    console.log('Running pending transactions check...');
    const pendingTransactions = await Transaction.find({ 
      status: 'pending',
      expiration: { $gt: new Date() } // Hanya yang belum expired
    });
    console.log(pendingTransactions);
    if (pendingTransactions.length === 0) {
      console.log('No pending transactions found.');
      return;
    }

    const mutations = await checkQRISStatus(process.env.MERCHANT_CODE, process.env.API_KEY);
    console.log(mutations);
    for (const transaction of pendingTransactions) {
      const payment = mutations.find(m => 
        parseInt(m.amount) === transaction.uniqueAmount &&
        m.type === 'CR'
      );

      if (payment) {
        transaction.status = 'paid';
        transaction.paymentData = payment;
        await transaction.save();
        console.log(`Transaction ${transaction.transactionId} marked as paid.`);
      } else if (new Date() > transaction.expiration) {
        transaction.status = 'expired';
        await transaction.save();
        console.log(`Transaction ${transaction.transactionId} expired.`);
      }
    }
  } catch (error) {
    console.error('Error in checkPendingTransactions:', error);
  }
}
*/

// Fungsi untuk pengecekan masal
async function checkPendingTransactions() {
  try {
    console.log(`[${new Date().toISOString()}] Starting batch status check...`);

    // Ambil semua transaksi dengan status pending
    const pendingTransactions = await Transaction.find({
      status: 'pending'
    });

    console.log(`[${new Date().toISOString()}] Found ${pendingTransactions.length} pending transactions.`);

    if (pendingTransactions.length === 0) {
      console.log(`[${new Date().toISOString()}] No pending transactions to check.`);
      return;
    }

    // Ambil mutasi dari Okeconnect
    let mutations = [];
    try {
      mutations = await checkQRISStatus(MERCHANT_CODE, API_KEY);
      console.log(`[${new Date().toISOString()}] Retrieved ${mutations.length} mutations from Okeconnect.`);
    } catch (apiError) {
      console.error(`[${new Date().toISOString()}] Failed to fetch mutations from Okeconnect:`, apiError.message);
      // Lanjutkan untuk memeriksa kedaluwarsa meskipun API gagal
    }

    const now = new Date();
    let paidCount = 0;
    let expiredCount = 0;

    // Proses setiap transaksi
    for (const transaction of pendingTransactions) {
      try {
        // Cek apakah transaksi sudah kedaluwarsa
        if (now > transaction.expiration) {
          transaction.status = 'expired';
          await transaction.save();
          expiredCount++;
          console.log(`[${new Date().toISOString()}] Transaction ${transaction.transactionId} marked as expired.`);
          continue;
        }

        // Cek mutasi jika API berhasil mengambil data
        if (mutations.length > 0) {
          const payment = mutations.find(m => 
            parseInt(m.amount) === transaction.uniqueAmount &&
            m.type === 'CR'
          );

          if (payment) {
            transaction.status = 'paid';
            transaction.paymentData = payment;
            await transaction.save();
            paidCount++;
            console.log(`[${new Date().toISOString()}] Transaction ${transaction.transactionId} marked as paid.`);
          }
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error processing transaction ${transaction.transactionId}:`, error.message);
      }
    }

    console.log(`[${new Date().toISOString()}] Batch status check completed. Updated ${paidCount} to paid, ${expiredCount} to expired.`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Batch status check failed:`, error.message);
  }
}


function startCronJobs() {
  // Jalankan setiap 2 menit
  cron.schedule('*/2 * * * *', checkPendingTransactions);
  console.log('Cron jobs started');
}

module.exports = {
  startCronJobs,
  checkPendingTransactions
};