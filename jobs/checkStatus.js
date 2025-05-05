const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const { checkQRISStatus } = require('../utils/qris');

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

function startCronJobs() {
  // Jalankan setiap 2 menit
  cron.schedule('*/2 * * * *', checkPendingTransactions);
  console.log('Cron jobs started');
}

module.exports = {
  startCronJobs,
  checkPendingTransactions
};