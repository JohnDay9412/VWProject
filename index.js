require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');
const { startCronJobs } = require('./jobs/checkStatus');
const customerRoutes = require('./routes/customer');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('json spaces', 2);
app.use(cors());
app.use(bodyParser.json());

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API routes
app.use('/api', customerRoutes);
app.use('/api/admin', adminRoutes);

// Connect to MongoDB
connectDB();

// Start cron jobs
startCronJobs();

const PORT = process.env.PORT || 55224;
app.listen(PORT, () => {
  console.log(`
  ====================================
   WiFi Voucher System Running
   Port: ${PORT}
  ====================================`);
});

process.on('SIGINT', async () => {
  const mongoose = require('mongoose');
  await mongoose.connection.close();
  process.exit(0);
});