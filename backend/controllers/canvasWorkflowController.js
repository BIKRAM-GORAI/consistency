const CanvasWorkflow = require('../models/CanvasWorkflow');
const User = require('../models/User');

/**
 * Middleware/Helper to verify if a user has an active premium subscription
 */
const checkPremium = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const isPremium = user.subscriptionTier === 'premium' && (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > new Date());
    if (!isPremium) {
      return res.status(403).json({ message: 'Access denied. The AI Agentic Canvas is exclusive to Premium subscribers.' });
    }
    req.fullUser = user;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error checking subscription tier.', error: error.message });
  }
};

/**
 * GET /api/canvas-workflows
 * Returns a list of saved canvases for the premium user (metadata only)
 */
const getWorkflows = async (req, res) => {
  try {
    const userId = req.user.userId;
    const canvases = await CanvasWorkflow.find({ userId })
      .select('name createdAt updatedAt')
      .sort({ updatedAt: -1 });

    const maxLimit = parseInt(process.env.MAX_LIFETIME_CANVASES, 10) || 30;

    res.json({
      canvases,
      limit: maxLimit,
      count: canvases.length,
      remaining: Math.max(0, maxLimit - canvases.length)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving canvases.', error: error.message });
  }
};

/**
 * GET /api/canvas-workflows/:id
 * Retrieves the full canvas details (nodes, edges)
 */
const getWorkflow = async (req, res) => {
  try {
    const userId = req.user.userId;
    const canvas = await CanvasWorkflow.findById(req.params.id);
    
    if (!canvas) {
      return res.status(404).json({ message: 'Canvas not found.' });
    }
    if (canvas.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only view your own canvases.' });
    }

    res.json(canvas);
  } catch (error) {
    res.status(500).json({ message: 'Server error loading canvas details.', error: error.message });
  }
};

/**
 * POST /api/canvas-workflows
 * Creates a new blank canvas if within the lifetime limit
 */
const createWorkflow = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name } = req.body;

    // 1. Enforce lifetime canvas limit
    const count = await CanvasWorkflow.countDocuments({ userId });
    const maxLimit = parseInt(process.env.MAX_LIFETIME_CANVASES, 10) || 30;

    if (count >= maxLimit) {
      return res.status(429).json({
        message: `Canvas creation failed. You have reached your lifetime limit of ${maxLimit} canvases.`
      });
    }

    // 2. Create the blank canvas
    const canvas = new CanvasWorkflow({
      userId,
      name: name ? name.trim() : 'Untitled Flow',
      nodes: [],
      edges: []
    });

    const saved = await canvas.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating new canvas.', error: error.message });
  }
};

/**
 * PUT /api/canvas-workflows/:id
 * Saves/updates a canvas (name, nodes, edges)
 */
const updateWorkflow = async (req, res) => {
  try {
    const userId = req.user.userId;
    const canvas = await CanvasWorkflow.findById(req.params.id);

    if (!canvas) {
      return res.status(404).json({ message: 'Canvas not found.' });
    }
    if (canvas.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only modify your own canvases.' });
    }

    const { name, nodes, edges } = req.body;
    if (name !== undefined) canvas.name = name.trim();
    if (nodes !== undefined) canvas.nodes = nodes;
    if (edges !== undefined) canvas.edges = edges;

    const saved = await canvas.save();
    res.json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Server error saving canvas updates.', error: error.message });
  }
};

/**
 * DELETE /api/canvas-workflows/:id
 * Deletes a canvas
 */
const deleteWorkflow = async (req, res) => {
  try {
    const userId = req.user.userId;
    const canvas = await CanvasWorkflow.findById(req.params.id);

    if (!canvas) {
      return res.status(404).json({ message: 'Canvas not found.' });
    }
    if (canvas.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only delete your own canvases.' });
    }

    await CanvasWorkflow.findByIdAndDelete(req.params.id);
    res.json({ message: 'Canvas deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting canvas.', error: error.message });
  }
};

module.exports = {
  checkPremium,
  getWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow
};
