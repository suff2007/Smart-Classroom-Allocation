const session = require("express-session");
const mongoose = require("mongoose");

class MongoSessionStore extends session.Store {
  constructor() {
    super();
    this.indexCreated = false;
    mongoose.connection.on("open", () => {
      this.ensureExpiryIndex().catch((error) => {
        console.error("Unable to initialize session expiry index:", error.message);
      });
    });
    if (mongoose.connection.readyState === 1) {
      this.ensureExpiryIndex().catch((error) => {
        console.error("Unable to initialize session expiry index:", error.message);
      });
    }
  }

  get collection() {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw new Error("MongoDB is unavailable for session storage.");
    }
    return mongoose.connection.db.collection("classroom_sessions");
  }

  async ensureExpiryIndex() {
    if (this.indexCreated || mongoose.connection.readyState !== 1) {
      return;
    }
    await this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    this.indexCreated = true;
  }

  get(sessionId, callback) {
    Promise.resolve()
      .then(() => this.collection.findOne({ _id: sessionId, expiresAt: { $gt: new Date() } }))
      .then((record) => callback(null, record ? record.session : null))
      .catch(callback);
  }

  set(sessionId, sessionData, callback = () => {}) {
    const cookieExpiry = sessionData.cookie?.expires
      ? new Date(sessionData.cookie.expires)
      : new Date(Date.now() + (sessionData.cookie?.maxAge || 1000 * 60 * 60 * 8));
    Promise.resolve()
      .then(() => this.collection.replaceOne(
        { _id: sessionId },
        { _id: sessionId, session: sessionData, expiresAt: cookieExpiry },
        { upsert: true },
      ))
      .then(() => callback(null))
      .catch(callback);
  }

  touch(sessionId, sessionData, callback = () => {}) {
    this.set(sessionId, sessionData, callback);
  }

  destroy(sessionId, callback = () => {}) {
    Promise.resolve()
      .then(() => this.collection.deleteOne({ _id: sessionId }))
      .then(() => callback(null))
      .catch(callback);
  }
}

module.exports = MongoSessionStore;
