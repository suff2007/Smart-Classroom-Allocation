const mongoose = require("mongoose");

let cachedConnection = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (cachedConnection) {
    return cachedConnection;
  }

  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  cachedConnection = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  }).then((conn) => {
    console.log("Connected to MongoDB");
    return conn;
  }).catch((err) => {
    cachedConnection = null;
    throw err;
  });

  return cachedConnection;
}

module.exports = connectDB;
