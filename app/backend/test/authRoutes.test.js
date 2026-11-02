const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const { createAuthRouter, requireRole } = require("../src/routes/authRoutes");

function createUserModel() {
  const users = [
    { _id: "coordinator-id", name: "Demo Coordinator", email: "coordinator@example.edu", passwordHash: bcrypt.hashSync("coordinator-password", 4), role: "COORDINATOR" },
    { _id: "admin-id", name: "Demo Admin", email: "admin@example.edu", passwordHash: bcrypt.hashSync("admin-password", 4), role: "ADMIN" },
  ];
  return {
    users,
    async findOne(query) { return users.find((user) => user.email === query.email) || null; },
    findById(id) { return { lean: async () => users.find((user) => String(user._id) === String(id)) || null }; },
  };
}

test("only Admin and Coordinator accounts can log in; public sign-up is disabled", async (t) => {
  const UserModel = createUserModel();
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-auth-session-secret", resave: false, saveUninitialized: false }));
  app.use("/api/auth", createAuthRouter({ UserModel }));
  app.get("/api/admin-only", requireRole("ADMIN"), (_req, res) => res.json({ ok: true }));
  app.get("/api/reviewer-only", requireRole("ADMIN", "COORDINATOR"), (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Unapproved Account", email: "unapproved@example.edu", password: "valid-demo-password" }),
  });
  assert.equal(signup.status, 403);
  assert.equal((await signup.json()).error.code, "SIGNUP_DISABLED");
  assert.deepEqual(UserModel.users.map((user) => user.role).sort(), ["ADMIN", "COORDINATOR"]);

  const coordinatorLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "coordinator@example.edu", password: "coordinator-password", role: "COORDINATOR" }),
  });
  assert.equal(coordinatorLogin.status, 200);
  const coordinatorCookie = coordinatorLogin.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(`${baseUrl}/api/reviewer-only`, { headers: { cookie: coordinatorCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin-only`, { headers: { cookie: coordinatorCookie } })).status, 403);

  const mismatch = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "coordinator@example.edu", password: "coordinator-password", role: "ADMIN" }),
  });
  assert.equal(mismatch.status, 403);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie: coordinatorCookie } });
  assert.equal(logout.status, 200);
  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: coordinatorCookie } });
  assert.equal((await sessionResponse.json()).authenticated, false);
});
