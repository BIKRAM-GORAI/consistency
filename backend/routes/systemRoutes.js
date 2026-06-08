const express = require('express');
const router = express.Router();

// Current System Version (Bump this to force all clients to update)
const APP_VERSION = '2.8.0'; 

router.get('/version', (req, res) => {
  res.json({ 
    version: APP_VERSION,
    forceUpdate: true,
    message: 'v2.8 is here! Smarter per-task notifications, redesigned daily reminder with category cards, and category quick-select. Update required.'
  });
});

module.exports = router;
