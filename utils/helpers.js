const Counter = require('../models/Counter');

const basePrices = { 
  1: 20,    // 6 Jam
  2: 30,    // 12 Jam
  3: 60,    // 3 Hari
  4: 100,   // 7 Hari
  5: 350    // 30 Hari
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

module.exports = { basePrices, getNextSequence, getUniqueAmount, validateEmail };