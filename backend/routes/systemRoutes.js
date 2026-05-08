const express = require('express');
const router = express.Router();

// Current System Version (Bump this to force all clients to update)
const APP_VERSION = '1.0.5'; 

router.get('/version', (req, res) => {
  res.json({ 
    version: APP_VERSION,
    forceUpdate: true,
    message: 'New features and offline stability improvements available.'
  });
});

module.exports = router;
