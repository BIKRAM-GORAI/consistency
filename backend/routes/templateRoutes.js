const express = require('express');
const router = express.Router();
const {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} = require('../controllers/templateController');
const { createTemplateValidation, updateTemplateValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getTemplates);
router.post('/', authenticateToken, createTemplateValidation, createTemplate);
router.put('/:id', authenticateToken, updateTemplateValidation, updateTemplate);
router.delete('/:id', authenticateToken, deleteTemplate);

module.exports = router;
