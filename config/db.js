const mongoose = require('mongoose');

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

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
});
mongoose.connection.on('error', (err) => {
  console.log('Mongoose connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

module.exports = { connectDB };