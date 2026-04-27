/**
 * API Response Sanitization Utilities
 * Helps minimize exposure of internal MongoDB object IDs and sensitive data
 */

/**
 * Sanitize user object for API responses
 * Removes sensitive fields and internal IDs where not needed
 */
const sanitizeUser = (user) => {
  if (!user) return null;

  const sanitized = {
    _id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    profilePicture: user.profilePicture,
    currentStreak: user.currentStreak,
    lastActiveAt: user.lastActiveAt,
    isPublicProfile: user.isPublicProfile,
    achievementsPublic: user.achievementsPublic,
    emailNotifications: user.emailNotifications
  };

  // Remove sensitive fields
  delete sanitized.password;
  delete sanitized.failedLoginAttempts;
  delete sanitized.lockUntil;
  delete sanitized.profilePictureId;

  return sanitized;
};

/**
 * Sanitize day object for API responses
 * Removes internal IDs where not needed for frontend
 */
const sanitizeDay = (day) => {
  if (!day) return null;

  const sanitized = {
    _id: day._id,
    date: day.date,
    categories: day.categories,
    summary: day.summary,
    createdAt: day.createdAt,
    updatedAt: day.updatedAt
  };

  // Remove internal userId reference (should be inferred from auth)
  delete sanitized.userId;

  return sanitized;
};

/**
 * Sanitize goal object for API responses
 * Removes internal IDs where not needed
 */
const sanitizeGoal = (goal) => {
  if (!goal) return null;

  const sanitized = {
    _id: goal._id,
    title: goal.title,
    deadline: goal.deadline,
    tasks: goal.tasks,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt
  };

  // Remove internal userId reference
  delete sanitized.userId;

  return sanitized;
};

/**
 * Sanitize achievement object for API responses
 * Removes internal IDs where not needed
 */
const sanitizeAchievement = (achievement) => {
  if (!achievement) return null;

  const sanitized = {
    _id: achievement._id,
    date: achievement.date,
    title: achievement.title,
    description: achievement.description,
    links: achievement.links || [],
    createdAt: achievement.createdAt,
    updatedAt: achievement.updatedAt
  };

  // Remove internal references
  delete sanitized.userId;
  delete sanitized.dayId;
  delete sanitized.link; // Legacy field

  return sanitized;
};

/**
 * Sanitize template object for API responses
 * Removes internal IDs where not needed
 */
const sanitizeTemplate = (template) => {
  if (!template) return null;

  const sanitized = {
    _id: template._id,
    name: template.name,
    categories: template.categories,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt
  };

  // Remove internal userId reference
  delete sanitized.userId;

  return sanitized;
};

/**
 * Sanitize group object for API responses
 * Removes internal IDs where not needed
 */
const sanitizeGroup = (group) => {
  if (!group) return null;

  const sanitized = {
    _id: group._id,
    name: group.name,
    code: group.code,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };

  // Keep owner and members as they're needed for group functionality
  if (group.owner) {
    sanitized.owner = typeof group.owner === 'object' ? sanitizeUser(group.owner) : group.owner;
  }

  if (group.members && Array.isArray(group.members)) {
    sanitized.members = group.members.map(member =>
      typeof member === 'object' ? sanitizeUser(member) : member
    );
  }

  return sanitized;
};

/**
 * Sanitize array of objects
 */
const sanitizeArray = (array, sanitizer) => {
  if (!Array.isArray(array)) return [];
  return array.map(item => sanitizer(item));
};

/**
 * Create a paginated response object
 */
const createPaginatedResponse = (data, pagination) => {
  return {
    data,
    pagination: {
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      itemsPerPage: pagination.itemsPerPage,
      hasNextPage: pagination.hasNextPage,
      hasPrevPage: pagination.hasPrevPage
    }
  };
};

/**
 * Remove MongoDB internal fields from any object
 */
const removeMongoInternalFields = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = { ...obj };

  // Remove MongoDB internal fields
  delete sanitized.__v;
  delete sanitized._doc;

  return sanitized;
};

module.exports = {
  sanitizeUser,
  sanitizeDay,
  sanitizeGoal,
  sanitizeAchievement,
  sanitizeTemplate,
  sanitizeGroup,
  sanitizeArray,
  createPaginatedResponse,
  removeMongoInternalFields
};