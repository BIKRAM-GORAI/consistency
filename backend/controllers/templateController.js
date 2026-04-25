const Template = require('../models/Template');
const User = require('../models/User');

exports.getTemplates = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'User ID required' });

    const templates = await Template.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching templates', error: error.message });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { userId, name, categories } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check limits for free tier
    if (user.subscriptionTier !== 'premium') {
      const templateCount = await Template.countDocuments({ userId });
      if (templateCount >= 5) {
        return res.status(403).json({
          message: 'Free tier limit reached. You can only save up to 5 templates.',
        });
      }
    }

    const newTemplate = new Template({
      userId,
      name,
      categories: categories || [],
    });

    const savedTemplate = await newTemplate.save();
    res.status(201).json(savedTemplate);
  } catch (error) {
    res.status(500).json({ message: 'Error creating template', error: error.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categories } = req.body;

    const template = await Template.findById(id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    if (name) template.name = name;
    if (categories) template.categories = categories;

    const updatedTemplate = await template.save();
    res.status(200).json(updatedTemplate);
  } catch (error) {
    res.status(500).json({ message: 'Error updating template', error: error.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findByIdAndDelete(id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.status(200).json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting template', error: error.message });
  }
};
