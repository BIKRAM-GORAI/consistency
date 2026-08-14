const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integrationController');
const { authenticateToken } = require('../middleware/auth');

// OAuth authentication initiation (browser navigation links)
router.get('/github/auth', integrationController.githubAuth);

// OAuth callback routes (invoked by GitHub)
router.get('/github/callback', integrationController.githubCallback);

// Integration management routes (authenticated API calls)
router.get('/status', authenticateToken, integrationController.getIntegrationStatus);
router.post('/config', authenticateToken, integrationController.setIntegrationConfig);
router.post('/disconnect', authenticateToken, integrationController.disconnectService);

module.exports = router;
