const path = require("node:path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = require("./app");
const connectDB = require("./config/database");

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Classroom Allocation API listening on port ${port}`);
});

connectDB().catch((error) => {
  console.error("MongoDB connection failed:", error.message);
});
