const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'consistency_app_profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

const groupStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'consistency_app_groups',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

const badgeStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'consistency_app_badges',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [], 
  },
});

const chatStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isAudio = file.mimetype.startsWith('audio/') || 
                    /\.(3gp|m4a|wav|mp3|webm|ogg)$/i.test(file.originalname);
    
    if (isAudio) {
      return {
        folder: 'consistency_app_chat',
        resource_type: 'video', 
        format: 'mp3', 
        transformation: [
          { bit_rate: '32k', quality: 'auto:low' } 
        ]
      };
    }

    return {
      folder: 'consistency_app_chat',
      resource_type: 'auto'
    };
  },
});

const uploadProfile = multer({ storage: profileStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadGroup = multer({ storage: groupStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadBadge = multer({ storage: badgeStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadChat = multer({ 
  storage: chatStorage, 
  limits: { fileSize: 5 * 1024 * 1024 } 
});

const deleteFromCloudinary = async (url) => {
  if (!url || !url.includes('cloudinary.com')) return;
  try {
    let resource_type = 'image';
    if (url.includes('/video/upload/')) resource_type = 'video';
    if (url.includes('/raw/upload/')) resource_type = 'raw';

    const parts = url.split('/');
    const folderPart = parts[parts.length - 2];
    const fileName = parts[parts.length - 1].split('.')[0];
    const publicId = `${folderPart}/${fileName}`;
    
    await cloudinary.uploader.destroy(publicId, { resource_type });
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
};

function getAchievementCredentials() {
  const achName = process.env.ACHIEVEMENT_CLOUDINARY_CLOUD_NAME;
  const achKey = process.env.ACHIEVEMENT_CLOUDINARY_API_KEY;
  const achSecret = process.env.ACHIEVEMENT_CLOUDINARY_API_SECRET;
  if (achName && achKey && achSecret) {
    return { cloud_name: achName.trim(), api_key: achKey.trim(), api_secret: achSecret.trim() };
  }
  return {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  };
}

const achievementStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const creds = getAchievementCredentials();
    return {
      folder: process.env.ACHIEVEMENT_CLOUDINARY_FOLDER || 'consistency_app_achievements',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      cloud_name: creds.cloud_name,
      api_key: creds.api_key,
      api_secret: creds.api_secret,
      transformation: [
        { quality: 'auto', fetch_format: 'auto' }
      ]
    };
  }
});

// Strictly enforce 1.5MB file size limit on the server for achievement photos
const uploadAchievementPhoto = multer({ 
  storage: achievementStorage, 
  limits: { fileSize: Math.floor(1.5 * 1024 * 1024) }, // 1.5MB max per image
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files (JPG, PNG, WebP) are allowed.'), false);
    }
    cb(null, true);
  }
});

const deleteFromAchievementCloudinary = async (publicIdOrUrl) => {
  if (!publicIdOrUrl) return;
  try {
    const creds = getAchievementCredentials();
    let publicId = publicIdOrUrl;
    if (publicIdOrUrl.includes('cloudinary.com')) {
      const parts = publicIdOrUrl.split('/');
      const folderPart = parts[parts.length - 2];
      const fileName = parts[parts.length - 1].split('.')[0];
      publicId = `${folderPart}/${fileName}`;
    }
    await cloudinary.uploader.destroy(publicId, {
      cloud_name: creds.cloud_name,
      api_key: creds.api_key,
      api_secret: creds.api_secret,
      resource_type: 'image'
    });
  } catch (err) {
    console.error('Achievement Cloudinary delete error:', err);
  }
};

module.exports = { 
  cloudinary, 
  uploadProfile, 
  uploadGroup, 
  uploadBadge, 
  uploadChat, 
  uploadAchievementPhoto, 
  deleteFromCloudinary,
  deleteFromAchievementCloudinary,
  getAchievementCredentials
};
