const express = require('express');
const router = express.Router();
const canvasWorkflowController = require('../controllers/canvasWorkflowController');
const { authenticateToken } = require('../middleware/auth');

// Apply auth token validation and premium check globally for these endpoints
router.use(authenticateToken);
router.use(canvasWorkflowController.checkPremium);

// CRUD endpoints for saved canvases
router.get('/', canvasWorkflowController.getWorkflows);
router.get('/:id', canvasWorkflowController.getWorkflow);
router.post('/', canvasWorkflowController.createWorkflow);
router.put('/:id', canvasWorkflowController.updateWorkflow);
router.delete('/:id', canvasWorkflowController.deleteWorkflow);

module.exports = router;
