const serverless = require("serverless-http");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const JWT_SECRET = process.env.JWT_SECRET || "please-change-this-secret";
const TYPES = ["branches", "orders", "restampings", "replacements"];

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

function sign(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "30d" });
}
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired, sign in again" });
  }
}
function makeId() {
  return "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- public routes (no login required) ----

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const { data: users, error } = await supabase.from("users").select("*").eq("username", username).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  const user = users && users[0];
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Wrong username or password" });
  }
  res.json({ token: sign({ id: user.id, username: user.username, role: user.role }), username: user.username, role: user.role });
});

// One-time setup: creates the very first account. Refuses if any user already exists,
// and requires SETUP_SECRET to match — so this can't be re-run by a stranger later.
app.post("/setup-admin", async (req, res) => {
  const { username, password, secret } = req.body || {};
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return res.status(403).json({ error: "Wrong setup secret" });
  }
  const { count, error: countErr } = await supabase.from("users").select("*", { count: "exact", head: true });
  if (countErr) return res.status(500).json({ error: countErr.message });
  if (count && count > 0) return res.status(400).json({ error: "Setup already completed — an account already exists." });
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: "Username and an 8+ character password are required" });
  }
  const { error: insErr } = await supabase.from("users").insert({
    id: "u_" + Date.now(), username, password_hash: bcrypt.hashSync(password, 10), role: "admin",
  });
  if (insErr) return res.status(500).json({ error: insErr.message });
  res.json({ ok: true });
});

// ---- everything below requires a valid login ----
app.use(authMiddleware);

app.get("/me", (req, res) => res.json({ username: req.user.username, role: req.user.role }));

app.post("/change-password", async (req, res) => {
  const { data: users, error } = await supabase.from("users").select("*").eq("id", req.user.id).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  const user = users && users[0];
  if (!user) return res.status(404).json({ error: "User not found" });
  const { currentPassword, newPassword } = req.body || {};
  if (!bcrypt.compareSync(currentPassword || "", user.password_hash)) {
    return res.status(401).json({ error: "Current password is wrong" });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  const { error: updErr } = await supabase.from("users").update({ password_hash: bcrypt.hashSync(newPassword, 10) }).eq("id", user.id);
  if (updErr) return res.status(500).json({ error: updErr.message });
  res.json({ ok: true });
});

app.get("/users", async (req, res) => {
  const { data, error } = await supabase.from("users").select("username, role");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post("/users", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: "Username and an 8+ character password are required" });
  }
  const { data: existing } = await supabase.from("users").select("id").eq("username", username).limit(1);
  if (existing && existing.length) return res.status(400).json({ error: "That username is already taken" });
  const { error } = await supabase.from("users").insert({
    id: "u_" + Date.now(), username, password_hash: bcrypt.hashSync(password, 10), role: "member",
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ username });
});

// ---- CRUD for each record type, stored as {id, payload jsonb} rows ----
TYPES.forEach((type) => {
  app.get(`/${type}`, async (req, res) => {
    const { data, error } = await supabase.from(type).select("id,payload");
    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map((r) => ({ ...r.payload, id: r.id })));
  });

  app.post(`/${type}`, async (req, res) => {
    const id = req.body.id || makeId();
    const payload = { ...req.body };
    delete payload.id;
    const { error } = await supabase.from(type).insert({ id, payload });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ...payload, id });
  });

  app.post(`/${type}/bulk`, async (req, res) => {
    const records = (req.body.records || []).map((r) => {
      const id = r.id || makeId();
      const payload = { ...r };
      delete payload.id;
      return { id, payload };
    });
    if (records.length) {
      const { error } = await supabase.from(type).insert(records);
      if (error) return res.status(500).json({ error: error.message });
    }
    res.json({ added: records.length });
  });

  app.put(`/${type}/:id`, async (req, res) => {
    const payload = { ...req.body };
    delete payload.id;
    const { error } = await supabase.from(type).update({ payload }).eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ...payload, id: req.params.id });
  });

  app.delete(`/${type}/:id`, async (req, res) => {
    const { error } = await supabase.from(type).delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });
});

const expressHandler = serverless(app);

// Netlify hands us the full path including "/.netlify/functions/api" —
// strip that prefix so Express sees "/login", "/branches", etc.
module.exports.handler = async (event, context) => {
  event.path = event.path.replace(/^\/\.netlify\/functions\/api/, "") || "/";
  return expressHandler(event, context);
};
