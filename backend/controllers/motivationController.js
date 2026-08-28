const MotivationQuote = require('../models/MotivationQuote');

// Initial 30 Brutal Motivation Quotes Library
const DEFAULT_BRUTAL_QUOTES = [
  "Are you actually trying, or just pretending to?",
  "You don’t need more motivation. You need to stop making excuses.",
  "Be honest: are you tired, or are you avoiding the work?",
  "You say you want it. Your actions say otherwise.",
  "How badly do you want it if you won’t work for it?",
  "Stop planning the life you want. Start building it.",
  "Nobody is coming to save your future. Get up.",
  "You know what to do. So why aren’t you doing it?",
  "Your potential means nothing without execution.",
  "Dreaming about it isn’t progress.",
  "You’re not stuck. You’re hesitating.",
  "Every day you delay is a day someone else gets ahead.",
  "Discipline is doing it when you don’t feel like it.",
  "If you keep choosing comfort, don’t complain about the results.",
  "You can make excuses, or you can make progress. Not both.",
  "Your future self is watching what you do today.",
  "Stop negotiating with the version of you that wants to quit.",
  "You’ve spent enough time thinking. Now execute.",
  "Wanting it is easy. Proving it is hard.",
  "Are you building your future, or distracting yourself from it?",
  "You’re not lazy by accident. You’re practicing it every day.",
  "Imagine wasting your potential because comfort felt better.",
  "One day, you’ll wish you had started today.",
  "You keep saying ‘tomorrow’ like you own it.",
  "Nobody cares about your excuses. Neither should you.",
  "You’re capable of more. Act like it.",
  "If you keep doing what you’re doing, you’ll keep getting what you’re getting.",
  "Your competition is working while you’re waiting to feel motivated.",
  "Stop being impressed by the person you could become. Become them.",
  "The life you want is hidden behind the work you keep avoiding."
];

/**
 * Seed initial default quotes if database collection is empty
 */
async function seedDefaultQuotes() {
  try {
    const count = await MotivationQuote.countDocuments();
    if (count === 0) {
      console.log("[Motivation Controller] Seeding initial 30 brutal motivation quotes...");
      const quoteDocs = DEFAULT_BRUTAL_QUOTES.map((text, idx) => ({
        quoteText: text,
        author: "Consistency Daily",
        order: idx + 1,
        isActive: true
      }));
      await MotivationQuote.insertMany(quoteDocs);
      console.log("[Motivation Controller] Seeded 30 brutal motivation quotes successfully.");
    }
  } catch (err) {
    console.error("[Motivation Controller] Error seeding default quotes:", err);
  }
}

/**
 * Public Endpoint: GET /api/motivation/quotes
 * Returns all active motivation quotes for client devices
 */
async function getPublicQuotes(req, res) {
  try {
    // Ensure seeding is checked
    await seedDefaultQuotes();

    const quotes = await MotivationQuote.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const quoteTexts = quotes.map(q => q.quoteText);
    return res.json({
      success: true,
      count: quoteTexts.length,
      quotes: quoteTexts,
      items: quotes
    });
  } catch (err) {
    console.error("[Motivation Controller] Error fetching public quotes:", err);
    return res.status(500).json({ success: false, message: "Server error fetching quotes." });
  }
}

/**
 * Admin Endpoint: GET /api/admin/motivation-quotes
 * Returns all quotes (active & inactive) for admin management
 */
async function getAdminQuotes(req, res) {
  try {
    await seedDefaultQuotes();
    const quotes = await MotivationQuote.find()
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return res.json({
      success: true,
      count: quotes.length,
      quotes
    });
  } catch (err) {
    console.error("[Motivation Controller] Error fetching admin quotes:", err);
    return res.status(500).json({ success: false, message: "Server error fetching admin quotes." });
  }
}

/**
 * Admin Endpoint: POST /api/admin/motivation-quotes
 * Creates a new motivation quote
 */
async function createQuote(req, res) {
  try {
    const { quoteText, author, order, isActive } = req.body;
    if (!quoteText || !quoteText.trim()) {
      return res.status(400).json({ success: false, message: "Quote text is required." });
    }

    const highestOrderDoc = await MotivationQuote.findOne().sort({ order: -1 }).lean();
    const nextOrder = order !== undefined ? Number(order) : ((highestOrderDoc?.order || 0) + 1);

    const newQuote = new MotivationQuote({
      quoteText: quoteText.trim(),
      author: author ? author.trim() : "Consistency Daily",
      order: nextOrder,
      isActive: isActive !== undefined ? Boolean(isActive) : true
    });

    await newQuote.save();

    return res.json({
      success: true,
      message: "Motivation quote created successfully.",
      quote: newQuote
    });
  } catch (err) {
    console.error("[Motivation Controller] Error creating quote:", err);
    return res.status(500).json({ success: false, message: "Server error creating quote." });
  }
}

/**
 * Admin Endpoint: PUT /api/admin/motivation-quotes/:id
 * Updates an existing motivation quote
 */
async function updateQuote(req, res) {
  try {
    const { id } = req.params;
    const { quoteText, author, order, isActive } = req.body;

    const quote = await MotivationQuote.findById(id);
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }

    if (quoteText !== undefined) quote.quoteText = quoteText.trim();
    if (author !== undefined) quote.author = author.trim();
    if (order !== undefined) quote.order = Number(order);
    if (isActive !== undefined) quote.isActive = Boolean(isActive);

    await quote.save();

    return res.json({
      success: true,
      message: "Motivation quote updated successfully.",
      quote
    });
  } catch (err) {
    console.error("[Motivation Controller] Error updating quote:", err);
    return res.status(500).json({ success: false, message: "Server error updating quote." });
  }
}

/**
 * Admin Endpoint: DELETE /api/admin/motivation-quotes/:id
 * Deletes a motivation quote
 */
async function deleteQuote(req, res) {
  try {
    const { id } = req.params;
    const deleted = await MotivationQuote.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Quote not found." });
    }

    return res.json({
      success: true,
      message: "Motivation quote deleted successfully.",
      id
    });
  } catch (err) {
    console.error("[Motivation Controller] Error deleting quote:", err);
    return res.status(500).json({ success: false, message: "Server error deleting quote." });
  }
}

module.exports = {
  seedDefaultQuotes,
  getPublicQuotes,
  getAdminQuotes,
  createQuote,
  updateQuote,
  deleteQuote
};
