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

// Auth validation rules
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s\-']+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 4, max: 20 }).withMessage('Username must be between 4 and 20 characters')
    .matches(/^[!-~]+$/).withMessage('Username can only contain alphanumeric and special characters (no spaces)'),
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
  body('username')
    .optional()
    .trim()
    .isLength({ min: 4, max: 20 }).withMessage('Username must be between 4 and 20 characters')
    .matches(/^[!-~]+$/).withMessage('Username can only contain alphanumeric and special characters (no spaces)'),
  body('oldPassword')
    .optional()
    .notEmpty().withMessage('Current password is required when changing password'),
  body('newPassword')
    .optional()
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters long'),
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
  body('summary')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Summary must not exceed 500 characters'),
  validate
];

const updateDayValidation = [
  param('id')
    .isMongoId().withMessage('Invalid day ID'),
  body('categories')
    .optional()
    .isArray().withMessage('Categories must be an array'),
  body('summary')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Summary must not exceed 500 characters'),
  validate
];

// Goal validation rules
const createGoalValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters'),
  body('deadline')
    .notEmpty().withMessage('Deadline is required')
    .isISO8601().withMessage('Deadline must be a valid date'),
  body('tasks')
    .optional()
    .isArray().withMessage('Tasks must be an array'),
  validate
];

const updateGoalValidation = [
  param('id')
    .isMongoId().withMessage('Invalid goal ID'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters'),
  body('deadline')
    .optional()
    .isISO8601().withMessage('Deadline must be a valid date'),
  body('tasks')
    .optional()
    .isArray().withMessage('Tasks must be an array'),
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
    .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
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
    .isLength({ min: 3, max: 100 }).withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must not exceed 500 characters'),
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
    .isLength({ min: 3, max: 50 }).withMessage('Template name must be between 3 and 50 characters'),
  body('categories')
    .optional()
    .isArray().withMessage('Categories must be an array'),
  validate
];

const updateTemplateValidation = [
  param('id')
    .isMongoId().withMessage('Invalid template ID'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 }).withMessage('Template name must be between 3 and 50 characters'),
  body('categories')
    .optional()
    .isArray().withMessage('Categories must be an array'),
  validate
];

// Group validation rules
const createGroupValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Group name is required')
    .isLength({ min: 3, max: 50 }).withMessage('Group name must be between 3 and 50 characters'),
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

const editGroupValidation = [
  param('groupId')
    .isMongoId().withMessage('Invalid group ID'),
  body('name')
    .trim()
    .notEmpty().withMessage('Group name is required')
    .isLength({ min: 3, max: 50 }).withMessage('Group name must be between 3 and 50 characters'),
  validate
];

const removeMemberValidation = [
  param('groupId')
    .isMongoId().withMessage('Invalid group ID'),
  body('targetUserId')
    .isMongoId().withMessage('Invalid target user ID'),
  validate
];

// Review validation rules
const submitReviewValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('description')
    .trim()
    .notEmpty().withMessage('Review description is required')
    .isLength({ min: 10, max: 1000 }).withMessage('Review must be between 10 and 1000 characters'),
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
  submitReviewValidation,
  userSearchValidation
};