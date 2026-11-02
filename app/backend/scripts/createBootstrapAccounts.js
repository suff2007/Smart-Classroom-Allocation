const path = require("node:path");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const User = require("../src/models/User");


async function ensureBootstrapAccount(account) {
  if (!account || !account.email || !account.password || !account.role || !account.name) {
    return null;
  }

  const email = account.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(account.password, 12);

  const user = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        name: account.name,
        email,
        passwordHash,
        role: account.role,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  console.log(`Credentials synchronised for ${account.role}: ${email}`);
  return user;
}

async function main() {
  const accounts = [
    {
      name: process.env.BOOTSTRAP_ADMIN_NAME || "System Administrator",
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
      role: "ADMIN",
    },
    {
      name: process.env.BOOTSTRAP_COORDINATOR_NAME || "Campus Coordinator",
      email: process.env.BOOTSTRAP_COORDINATOR_EMAIL,
      password: process.env.BOOTSTRAP_COORDINATOR_PASSWORD,
      role: "COORDINATOR",
    },
  ];

  const configuredAccounts = accounts.filter((account) => account.email && account.password);
  if (configuredAccounts.length === 0) {
    console.log("No bootstrap account credentials were configured. Set BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD and BOOTSTRAP_COORDINATOR_EMAIL/BOOTSTRAP_COORDINATOR_PASSWORD in backend/.env.");
    return;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required to create bootstrap accounts.");
  }

  await mongoose.connect(mongoUri);
  try {
    for (const account of configuredAccounts) {
      await ensureBootstrapAccount(account);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Bootstrap account creation failed:", error.message);
  process.exitCode = 1;
});
