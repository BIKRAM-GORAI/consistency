const mongoose = require('mongoose');
const dns = require('dns');

// Solve Node.js DNS resolution issues with MongoDB Atlas SRV on some Windows environments
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('Failed to set custom DNS servers:', err.message);
}

// Cache the connection to prevent multiple connections on Vercel (Serverless)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

/**
 * Connect to MongoDB using the MONGO_URI from environment variables
 */
const connectDB = async () => {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const opts = {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      bufferCommands: false, // Recommended for serverless
    };

    cached.promise = mongoose.connect(process.env.MONGO_URI, opts).then((mongoose) => {
      console.log('✅ New MongoDB Connection established');
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Do not throw, allow server to try again on next request
  }

  return cached.conn;
};

module.exports = connectDB;