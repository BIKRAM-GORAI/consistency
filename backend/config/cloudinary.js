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
  params: {
    folder: 'consistency_app_chat',
    resource_type: 'auto'
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

module.exports = { cloudinary, uploadProfile, uploadGroup, uploadBadge, uploadChat, deleteFromCloudinary };
