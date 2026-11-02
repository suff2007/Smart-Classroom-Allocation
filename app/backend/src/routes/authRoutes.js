const express = require("express");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const RoomTransfer = require("../models/RoomTransfer");
const EventRequest = require("../models/EventRequest");

function sanitizeUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.createdAt ? { createdAt: user.createdAt } : {}),
  };
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      error: {
        code: "AUTH_REQUIRED",
        message: "You must be signed in to access this resource.",
      },
    });
  }

  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        error: {
          code: "AUTH_REQUIRED",
          message: "You must be signed in to access this resource.",
        },
      });
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action.",
        },
      });
    }

    return next();
  };
}

function isStrongPassword(password) {
  return typeof password === "string" &&
    password.length >= 8 &&
    Buffer.byteLength(password, "utf8") <= 72;
}

function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        reject(regenerateError);
        return;
      }
      req.session.user = user;
      req.session.save((saveError) => {
        if (saveError) reject(saveError);
        else resolve();
      });
    });
  });
}

function createAuthRouter({
  UserModel = User,
  RoomTransferModel = RoomTransfer,
  EventRequestModel = EventRequest,
} = {}) {
  const router = express.Router();

  router.get("/session", async (req, res) => {
    if (!req.session || !req.session.user) {
      return res.json({ authenticated: false, user: null });
    }

    try {
      const user = await UserModel.findById(req.session.user.id).lean();
      if (!user) {
        req.session.destroy(() => {});
        return res.json({ authenticated: false, user: null });
      }
      const safeUser = sanitizeUser(user);
      req.session.user = safeUser;
      return res.json({ authenticated: true, user: safeUser });
    } catch (error) {
      return res.status(500).json({
        error: {
          code: "SESSION_ERROR",
          message: "Unable to restore the authenticated session.",
        },
      });
    }
  });

  // Public registration is disabled: this project uses only pre-created Admin and Coordinator accounts.
  router.post("/signup", (req, res) => {
    return res.status(403).json({
      error: { code: "SIGNUP_DISABLED", message: "Public sign-up is disabled. Use an Admin or Coordinator account." },
    });
  });

  router.post("/login", async (req, res, next) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const requestedRole = typeof req.body?.role === "string" ? req.body.role.trim().toUpperCase() : "";

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          error: { code: "INVALID_EMAIL", message: "A valid email address is required." },
        });
      }

      if (!isStrongPassword(password)) {
        return res.status(400).json({
          error: { code: "INVALID_PASSWORD", message: "Password must be at least 8 characters and no more than 72 UTF-8 bytes." },
        });
      }

      const user = await UserModel.findOne({ email });
      if (!user) {
        return res.status(401).json({
          error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
        });
      }

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) {
        return res.status(401).json({
          error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
        });
      }

      const normalizedRole = requestedRole || user.role;
      if (normalizedRole !== user.role) {
        return res.status(403).json({
          error: {
            code: "ROLE_MISMATCH",
            message: "The selected role does not match the account role.",
          },
        });
      }

      const safeUser = sanitizeUser(user);
      await establishSession(req, safeUser);

      return res.json({
        message: `Signed in as ${safeUser.role.toLowerCase()}.`,
        user: safeUser,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/logout", (req, res) => {
    if (!req.session) {
      return res.json({ message: "No active session to end." });
    }

    req.session.destroy((error) => {
      if (error) {
        return res.status(500).json({
          error: { code: "LOGOUT_FAILED", message: "Unable to end the current session." },
        });
      }
      res.clearCookie("classroom_session");
      return res.json({ message: "Logged out successfully." });
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    return res.json({ user: req.session.user });
  });

  router.get("/admin/summary", requireRole("ADMIN"), async (req, res, next) => {
    try {
      const [userCount, usersByRole, pendingTransfers, savedEvents] = await Promise.all([
        UserModel.countDocuments({}),
        UserModel.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
        RoomTransferModel.countDocuments({ status: "REQUESTED" }),
        EventRequestModel.countDocuments({}),
      ]);
      return res.json({
        userCount,
        usersByRole: Object.fromEntries(usersByRole.map(({ _id, count }) => [_id, count])),
        pendingTransferCount: pendingTransfers,
        savedEventRequestCount: savedEvents,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/admin/users", requireRole("ADMIN"), async (req, res, next) => {
    try {
      const users = await UserModel.find({})
        .select("name email role createdAt")
        .sort({ createdAt: -1 })
        .lean();
      return res.json({ users: users.map(sanitizeUser) });
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/admin/users/:userId/role", requireRole("ADMIN"), async (req, res, next) => {
    try {
      const { userId } = req.params;
      const role = typeof req.body?.role === "string" ? req.body.role.trim().toUpperCase() : "";
      if (!mongoose.Types.ObjectId.isValid(userId) || !["ADMIN", "COORDINATOR"].includes(role)) {
        return res.status(400).json({
          error: {
            code: "INVALID_ROLE_UPDATE",
            message: "A valid user ID and ADMIN or COORDINATOR role are required.",
          },
        });
      }
      if (userId === req.session.user.id) {
        return res.status(400).json({
          error: {
            code: "SELF_ROLE_CHANGE",
            message: "Administrators cannot change their own role.",
          },
        });
      }
      const target = await UserModel.findById(userId);
      if (!target) {
        return res.status(404).json({
          error: { code: "USER_NOT_FOUND", message: "The requested user was not found." },
        });
      }
      if (target.role === "ADMIN" && role !== "ADMIN") {
        const administratorCount = await UserModel.countDocuments({ role: "ADMIN" });
        if (administratorCount <= 1) {
          return res.status(409).json({
            error: {
              code: "LAST_ADMIN_REQUIRED",
              message: "The only administrator account cannot be demoted.",
            },
          });
        }
      }
      target.role = role;
      await target.save();
      return res.json({ user: sanitizeUser(target) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = createAuthRouter();
module.exports.createAuthRouter = createAuthRouter;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
