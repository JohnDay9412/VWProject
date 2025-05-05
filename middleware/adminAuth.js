const adminAuth = (req, res, next) => {
  const apiKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (apiKey === process.env.ADMIN_API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

module.exports = adminAuth;