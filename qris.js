const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const FormData = require('form-data');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const { ImageUploadService } = require('node-upload-images');

//mbuh

// =============================================
//                HELPER FUNCTIONS
// =============================================

const CRC16_POLYNOMIAL = 0x1021;

/**
 * Menghitung checksum CRC16 untuk string input
 * @param {string} str - Input string
 * @returns {string} Hex checksum 4 digit
 */
function calculateCRC16(str) {
    let crc = 0xFFFF;
    const strlen = str.length;

    for (let c = 0; c < strlen; c++) {
        crc ^= str.charCodeAt(c) << 8;

        for (let i = 0; i < 8; i++) {
            crc = crc & 0x8000 
                ? (crc << 1) ^ CRC16_POLYNOMIAL 
                : crc << 1;
        }
    }

    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Membuat transaction ID acak 10 karakter
 * @returns {string} Transaction ID
 */
function generateTransactionId() {
    return crypto.randomBytes(5).toString('hex').toUpperCase();
}

/**
 * Membuat waktu kadaluarsa 30 menit dari sekarang
 * @returns {Date} Waktu kadaluarsa
 */
function generateExpirationTime() {
    return new Date(Date.now() + 30 * 60000);
}

/**
 * Upload gambar ke hosting service
 * @param {Buffer} buffer - Buffer gambar
 * @returns {Promise<string>} URL gambar
 */
async function uploadImage(buffer) {
    try {
        const service = new ImageUploadService('pixhost.to');
        const { directLink } = await service.uploadFromBinary(buffer, 'oneclash.png');
        return directLink;
    } catch (error) {
        console.error('[QRIS] Upload gagal:', error);
        throw error;
    }
}

// =============================================
//              QRIS CORE FUNCTIONS
// =============================================

/**
 * Membuat payload QRIS
 * @param {string} baseQRCode - Template QRIS dasar
 * @param {number} amount - Jumlah transaksi
 * @returns {string} Data QRIS yang diformat
 */
function formatQRISPayload(baseQRCode, amount) {
    const amountString = amount.toString();
    const amountLength = amountString.length.toString().padStart(2, '0');

    return baseQRCode
        .replace('010211', '010212')
        .replace('5802ID', `54${amountLength}${amountString}5802ID`);
}

/**
 * Membuat QRIS dan mengupload gambar
 * @param {number} amount - Jumlah transaksi
 * @param {string} [baseQR] - Template QRIS dasar
 * @returns {Promise<Object>} Objek response QRIS
 */
async function generateQRIS(amount, baseQR) {
    try {
        const cleanedQR = baseQR.slice(0, -4);
        const formattedQR = formatQRISPayload(cleanedQR, amount);
        const finalQR = formattedQR + calculateCRC16(formattedQR);

        const qrBuffer = await QRCode.toBuffer(finalQR);
        const imageUrl = await uploadImage(qrBuffer);

        return {
            transactionId: generateTransactionId(),
            amount: amount,
            expirationTime: generateExpirationTime(),
            qrImageUrl: imageUrl
        };
    } catch (error) {
        console.error('[QRIS] Gagal membuat QR:', error);
        throw error;
    }
}

// =============================================
//              STATUS CHECKER
// =============================================

/**
 * Memeriksa status transaksi QRIS
 * @param {string} [merchantCode] - Merchant Code dari OkeConnect
 * @param {string} [apikeyOrkut] - Api Key dari OkeConnect
 * @returns {Promise<string>} Laporan mutasi format teks
 */
async function checkQRISStatus(merchantCode, apikeyOrkut) {
    try {
        const API_URL = `https://gateway.okeconnect.com/api/mutasi/qris/${merchantCode}/${apikeyOrkut}`;
        const { data } = await axios.get(API_URL);
        const transactions = data.data;
        console.log(transactions);

        return transactions;
    } catch (error) {
        console.error('[QRIS] Gagal memeriksa status:', error);
        throw error;
    }
}

module.exports = {
    generateQRIS,
    checkQRISStatus
};