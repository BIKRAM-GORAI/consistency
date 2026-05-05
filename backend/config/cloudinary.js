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

const uploadProfile = multer({ storage: profileStorage });
const uploadGroup = multer({ storage: groupStorage });

/**
 * Extracts public_id from a Cloudinary URL and deletes the image.
 * URL format: https://res.cloudinary.com/[cloud_name]/image/upload/v[version]/[folder]/[public_id].[ext]
 */
const deleteFromCloudinary = async (url) => {
  if (!url || !url.includes('cloudinary.com')) return;
  try {
    const parts = url.split('/');
    const folderPart = parts[parts.length - 2];
    const fileName = parts[parts.length - 1].split('.')[0];
    const publicId = `${folderPart}/${fileName}`;
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
};

module.exports = { cloudinary, uploadProfile, uploadGroup, deleteFromCloudinary };
