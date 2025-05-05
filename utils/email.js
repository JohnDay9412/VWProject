const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const voucherTypes = {
  1: '6 Jam',
  2: '12 Jam',
  3: '3 Hari',
  4: '7 Hari',
  5: '30 Hari'
};

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
            <p style="color: #888; font-size: 12px;">ONE CLASH STORE © ${new Date().getFullYear()}</p>
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
            <p style="color: #888; font-size: 12px;">ONE CLASH STORE © ${new Date().getFullYear()}</p>
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

module.exports = { sendQRISEmail, sendVoucherEmail, voucherTypes };