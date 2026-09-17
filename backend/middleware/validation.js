const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation middleware to check for validation errors
 * Returns 400 status with error details if validation fails
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * Sanitize text input:
 * 1. Decodes previously escaped HTML entities so data is stored cleanly and not multi-escaped.
 * 2. Encodes dangerous HTML angle brackets (< and >) to prevent script and tag injection (XSS),
 *    while preserving safe punctuation like apostrophes ('), quotes ("), and ampersands (&).
 */
const sanitizeSafeText = (val) => {
  if (typeof val !== 'string') return val;
  let s = val;
  let prev;
  let count = 0;
  while (s !== prev && count < 30) {
    prev = s;
    count++;
    if (!/&(?:amp|lt|gt|quot|apos|#0*39|#x27|#x22|#0*34|#96|#x60|#x2F|#0*47|#x5C|#0*92);/i.test(s)) break;
    s = s
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#0*39;/g, "'")
      .replace(/&#x22;/gi, '"')
      .replace(/&#0*34;/g, '"')
      .replace(/&#96;/g, '`')
      .replace(/&#x60;/gi, '`')
      .replace(/&#x2F;/gi, '/')
      .replace(/&#0*47;/g, '/')
      .replace(/&#x5C;/gi, '\\')
      .replace(/&#0*92;/g, '\\');
  }
  return s
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// Auth validation rules
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 60 }).withMessage('Name must be between 1 and 60 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 4, max: 20 }).withMessage('Username must be between 4 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  validate
];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
  validate
];

const updateProfileValidation = [
  body('emailNotifications')
    .optional()
    .isBoolean().withMessage('emailNotifications must be a boolean'),
  body('isPublicProfile')
    .optional()
    .isBoolean().withMessage('isPublicProfile must be a boolean'),
  body('showOnLeaderboard')
    .optional()
    .isBoolean().withMessage('showOnLeaderboard must be a boolean'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 4, max: 20 }).withMessage('Username must be between 4 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
  body('oldPassword')
    .optional()
    .notEmpty().withMessage('Current password is required when changing password'),
  body('newPassword')
    .optional()
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters long'),
  body('globalStreakReminderEnabled')
    .optional()
    .isBoolean().withMessage('globalStreakReminderEnabled must be a boolean'),
  body('globalStreakReminderTime')
    .optional()
    .trim()
    .matches(/^\d{2}:\d{2}$/).withMessage('globalStreakReminderTime must be in HH:MM format'),
  body('globalStreakReminderType')
    .optional()
    .isIn(['notification', 'alarm']).withMessage('globalStreakReminderType must be notification or alarm'),
  body('motivationRemindersEnabled')
    .optional()
    .isBoolean().withMessage('motivationRemindersEnabled must be a boolean'),
  body('motivationIntervalHours')
    .optional()
    .isNumeric().withMessage('motivationIntervalHours must be a number'),
  body('motivationStartTime')
    .optional()
    .trim()
    .matches(/^\d{2}:\d{2}$/).withMessage('motivationStartTime must be in HH:MM format'),
  body('motivationEndTime')
    .optional()
    .trim()
    .matches(/^\d{2}:\d{2}$/).withMessage('motivationEndTime must be in HH:MM format'),
  validate
];

const achievementPrivacyValidation = [
  body('achievementsPublic')
    .isBoolean().withMessage('achievementsPublic must be a boolean'),
  validate
];

// Day validation rules
const createDayValidation = [
  body('date')
    .trim()
    .notEmpty().withMessage('Date is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be in YYYY-MM-DD format'),
  body('categories')
    .optional()
    .isArray().withMessage('Categories must be an array'),
  body('categories.*.name').optional().trim().customSanitizer(sanitizeSafeText),
  body('categories.*.tasks').optional().isArray(),
  body('categories.*.tasks.*.title').optional().trim().customSanitizer(sanitizeSafeText),
  body('summary')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Summary must not exceed 500 characters')
    .customSanitizer(sanitizeSafeText),
  body('aiSummary')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('AI Insights must not exceed 1000 characters')
    .customSanitizer(sanitizeSafeText),
  body('reminder')
    .optional()
    .isObject().withMessage('Reminder must be an object'),
  body('reminder.enabled')
    .optional()
    .isBoolean().withMessage('reminder.enabled must be a boolean'),
  body('reminder.time')
    .optional()
    .trim()
    .matches(/^$|^\d{2}:\d{2}$/).withMessage('reminder.time must be in HH:MM format'),
  body('reminder.type')
    .optional()
    .isIn(['notification', 'alarm']).withMessage('reminder.type must be notification or alarm'),
  body('reminder.selectedTasks')
    .optional()
    .isArray().withMessage('reminder.selectedTasks must be an array'),
  body('reminder.selectedTasks.*')
    .optional()
    .custom(value => {
      if (typeof value === 'string' && (value.startsWith('temp_task_') || /^[0-9a-fA-F]{24}$/.test(value))) {
        return true;
      }
      throw new Error('reminder.selectedTasks must contain valid task IDs');
    }),
  validate
];

const updateDayValidation = [
  param('id')
    .isMongoId().withMessage('Invalid day ID'),
  body('categories')
    .optional()
    .isArray().withMessage('Categories must be an array'),
  body('categories.*.name').optional().trim().customSanitizer(sanitizeSafeText),
  body('categories.*.tasks').optional().isArray(),
  body('categories.*.tasks.*.title').optional().trim().customSanitizer(sanitizeSafeText),
  body('summary')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Summary must not exceed 500 characters')
    .customSanitizer(sanitizeSafeText),
  body('aiSummary')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('AI Insights must not exceed 1000 characters')
    .customSanitizer(sanitizeSafeText),
  body('reminder')
    .optional()
    .isObject().withMessage('Reminder must be an object'),
  body('reminder.enabled')
    .optional()
    .isBoolean().withMessage('reminder.enabled must be a boolean'),
  body('reminder.time')
    .optional()
    .trim()
    .matches(/^$|^\d{2}:\d{2}$/).withMessage('reminder.time must be in HH:MM format'),
  body('reminder.type')
    .optional()
    .isIn(['notification', 'alarm']).withMessage('reminder.type must be notification or alarm'),
  body('reminder.selectedTasks')
    .optional()
    .isArray().withMessage('reminder.selectedTasks must be an array'),
  body('reminder.selectedTasks.*')
    .optional()
    .custom(value => {
      if (typeof value === 'string' && (value.startsWith('temp_task_') || /^[0-9a-fA-F]{24}$/.test(value))) {
        return true;
      }
      throw new Error('reminder.selectedTasks must contain valid task IDs');
    }),
  validate
];

// Goal validation rules
const createGoalValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters')
    .customSanitizer(sanitizeSafeText),
  body('deadline')
    .notEmpty().withMessage('Deadline is required')
    .isISO8601().withMessage('Deadline must be a valid date')
    .custom((value, { req }) => {
      const clientDateStr = req.headers['x-client-date'];
      let todayStr;
      if (clientDateStr && /^\d{4}-\d{2}-\d{2}$/.test(clientDateStr)) {
        todayStr = clientDateStr;
      } else {
        const now = new Date();
        todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      }
      const deadlineStr = String(value).split('T')[0];
      if (deadlineStr < todayStr) {
        throw new Error('Deadline cannot be in the past. Please select today or a future date.');
      }
      return true;
    }),
  body('tasks')
    .optional()
    .isArray().withMessage('Tasks must be an array'),
  body('tasks.*.title').optional().trim().customSanitizer(sanitizeSafeText),
  body('completedAt')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage('Completed date must be a valid date'),
  validate
];

const updateGoalValidation = [
  param('id')
    .isMongoId().withMessage('Invalid goal ID'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters')
    .customSanitizer(sanitizeSafeText),
  body('deadline')
    .optional()
    .isISO8601().withMessage('Deadline must be a valid date')
    .custom((value, { req }) => {
      if (!value) return true;
      const clientDateStr = req.headers['x-client-date'];
      let todayStr;
      if (clientDateStr && /^\d{4}-\d{2}-\d{2}$/.test(clientDateStr)) {
        todayStr = clientDateStr;
      } else {
        const now = new Date();
        todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      }
      const deadlineStr = String(value).split('T')[0];
      if (deadlineStr < todayStr) {
        throw new Error('Deadline cannot be in the past. Please select today or a future date.');
      }
      return true;
    }),
  body('tasks')
    .optional()
    .isArray().withMessage('Tasks must be an array'),
  body('tasks.*.title').optional().trim().customSanitizer(sanitizeSafeText),
  body('completedAt')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage('Completed date must be a valid date'),
  validate
];

// Achievement validation rules
const createAchievementValidation = [
  body('dayId')
    .isMongoId().withMessage('Invalid day ID'),
  body('date')
    .trim()
    .notEmpty().withMessage('Date is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be in YYYY-MM-DD format'),
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters')
    .customSanitizer(sanitizeSafeText),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
    .customSanitizer(sanitizeSafeText),
  body('links')
    .optional()
    .isArray().withMessage('Links must be an array'),
  validate
];

const updateAchievementValidation = [
  param('id')
    .isMongoId().withMessage('Invalid achievement ID'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters')
    .customSanitizer(sanitizeSafeText),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters')
    .customSanitizer(sanitizeSafeText),
  body('links')
    .optional()
    .isArray().withMessage('Links must be an array'),
  validate
];

// Template validation rules
const createTemplateValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Template name is required')
    .isLength({ min: 3, max: 50 }).withMessage('Template name must be between 3 and 50 characters')
    .customSanitizer(sanitizeSafeText),
  body('categories')
    .optional()
    .isArray().withMessage('Categories must be an array'),
  body('categories.*.name').optional().trim().customSanitizer(sanitizeSafeText),
  body('categories.*.tasks.*.title').optional().trim().customSanitizer(sanitizeSafeText),
  validate
];

const updateTemplateValidation = [
  param('id')
    .isMongoId().withMessage('Invalid template ID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Template name must be between 3 and 50 characters')
    .customSanitizer(sanitizeSafeText),
  body('categories')
    .optional()
    .isArray().withMessage('Categories must be an array'),
  body('categories.*.name').optional().trim().customSanitizer(sanitizeSafeText),
  body('categories.*.tasks.*.title').optional().trim().customSanitizer(sanitizeSafeText),
  validate
];

// Group validation rules
const createGroupValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Group name is required')
    .isLength({ min: 3, max: 25 }).withMessage('Group name must be between 3 and 25 characters')
    .customSanitizer(sanitizeSafeText),
  validate
];

const joinGroupValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Group code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Group code must be exactly 6 characters')
    .isAlphanumeric().withMessage('Group code must contain only letters and numbers'),
  validate
];

const joinPublicGroupValidation = [
  param('groupId').isMongoId().withMessage('Invalid group ID'),
  body('message')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 }).withMessage('Message must not exceed 200 characters')
    .customSanitizer(sanitizeSafeText),
  validate
];

const editGroupValidation = [
  param('groupId')
    .isMongoId().withMessage('Invalid group ID'),
  body('name')
    .trim()
    .notEmpty().withMessage('Group name is required')
    .isLength({ min: 3, max: 25 }).withMessage('Group name must be between 3 and 25 characters')
    .customSanitizer(sanitizeSafeText),
  validate
];

const removeMemberValidation = [
  param('groupId')
    .isMongoId().withMessage('Invalid group ID'),
  body('targetUserId')
    .isMongoId().withMessage('Invalid target user ID'),
  validate
];

const handleJoinRequestValidation = [
  param('groupId').isMongoId().withMessage('Invalid group ID'),
  param('targetUserId').isMongoId().withMessage('Invalid user ID'),
  body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  validate
];

// Review validation rules
const submitReviewValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .customSanitizer(sanitizeSafeText),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('description')
    .trim()
    .notEmpty().withMessage('Review description is required')
    .isLength({ min: 3, max: 1000 }).withMessage('Review must be between 3 and 1000 characters')
    .customSanitizer(sanitizeSafeText),
  body('userBadges')
    .optional()
    .isArray().withMessage('userBadges must be an array'),
  validate
];

// User search validation
const userSearchValidation = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 }).withMessage('Search query must be between 1 and 20 characters'),
  validate
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  updateProfileValidation,
  achievementPrivacyValidation,
  createDayValidation,
  updateDayValidation,
  createGoalValidation,
  updateGoalValidation,
  createAchievementValidation,
  updateAchievementValidation,
  createTemplateValidation,
  updateTemplateValidation,
  createGroupValidation,
  joinGroupValidation,
  editGroupValidation,
  removeMemberValidation,
  handleJoinRequestValidation,
  joinPublicGroupValidation,
  submitReviewValidation,
  userSearchValidation
};