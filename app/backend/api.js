const app = require("./src/app");
const connectDB = require("./src/config/database");

module.exports = async (req, res) => {
  try {
    if (process.env.MONGODB_URI) {
      await connectDB();
    }
  } catch (err) {
    console.error("Database connection error in serverless handler:", err.message);
  }
  return app(req, res);
};
