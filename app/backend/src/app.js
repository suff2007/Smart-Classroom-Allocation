const express = require("express");
const session = require("express-session");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const MongoSessionStore = require("./services/mongoSessionStore");
const classroomRoutes = require("./routes/classroomRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();
if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || !process.env.MONGODB_URI)) {
  throw new Error("SESSION_SECRET and MONGODB_URI must be configured in production.");
}
const allowedOrigins = new Set([
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:5173", "http://127.0.0.1:5173"]),
  ...(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
]);
function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }
  const normalized = origin.replace(/\/+$/, "");
  if (allowedOrigins.has(normalized)) {
    return true;
  }
  if (process.env.NODE_ENV === "production") {
    return Array.from(allowedOrigins).some(
      (allowed) => allowed.includes(".vercel.app") && normalized.endsWith(".vercel.app")
    );
  }
  try {
    const parsedOrigin = new URL(normalized);
    return (
      parsedOrigin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsedOrigin.hostname)
    );
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      error: {
        code: "ORIGIN_NOT_ALLOWED",
        message: "This request origin is not allowed.",
      },
    });
  }
  return next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("The request origin is not allowed."));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-review-api-key"],
}));

app.use(express.json());
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
app.use(session({
  name: "classroom_session",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  ...(process.env.MONGODB_URI ? { store: new MongoSessionStore() } : {}),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    service: "Smart Classroom Allocation Backend API",
    endpoints: {
      health: "/api/health",
      dbHealth: "/api/db-health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Classroom Allocation API is running",
  });
});

app.get("/api/db-health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.json({ connected });
});

app.use("/api/auth", authRoutes);
app.use("/api/classrooms", classroomRoutes);
app.use("/api/timetable", timetableRoutes);

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  console.error("API request failed:", error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  return res.status(status).json({
    error: {
      code: status === 400 ? "INVALID_REQUEST_BODY" : "INTERNAL_SERVER_ERROR",
      message: status === 400
        ? "The request body is invalid JSON."
        : "The request could not be completed.",
    },
  });
});

module.exports = app;
