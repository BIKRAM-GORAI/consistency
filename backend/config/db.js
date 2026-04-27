const mongoose = require('mongoose');

/**
 * Connect to MongoDB using the MONGO_URI from environment variables
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
// const mongoose = require('mongoose');

// let cached = global.mongoose;

// if (!cached) {
//   cached = global.mongoose = {
//     conn: null,
//     promise: null
//   };
// }

// /**
//  * Connect to MongoDB using the MONGO_URI from environment variables
//  */
// const connectDB = async () => {
//   if (cached.conn) {
//     return cached.conn;
//   }

//   if (!cached.promise) {
//     cached.promise = mongoose.connect(process.env.MONGO_URI, {
//       bufferCommands: false,
//     }).then((mongoose) => mongoose);
//   }

//   try {
//     cached.conn = await cached.promise;
//     console.log(`✅ MongoDB Connected: ${cached.conn.connection.host}`);
//   } catch (error) {
//     cached.promise = null;
//     console.error(`❌ MongoDB Connection Error: ${error.message}`);
//     throw error;
//   }

//   return cached.conn;
// };

// module.exports = connectDB;