// index.js
const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;

// ---------- PostgreSQL pool (Render.com) ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---------- Graceful shutdown ----------
process.on("SIGINT", () => {
  pool.end();
  console.log("Application shutdown");
  process.exit(0);
});

// ---------- View engine & static ----------
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true })); // for POST body

// ---------------------------------------------------------------------
//  GLOBAL LOGIN STATE
// ---------------------------------------------------------------------
let LOGGED_IN = false;
let lastActivity = Date.now();

// Update activity on every request when logged in
app.use((req, res, next) => {
  if (LOGGED_IN) lastActivity = Date.now();
  next();
});

// Auto-logout after 30 minutes of inactivity
setInterval(() => {
  if (LOGGED_IN && Date.now() - lastActivity > 30 * 60 * 1000) {
    console.log("Auto-logout: 30 minutes of inactivity");
    LOGGED_IN = false;
  }
}, 60_000); // check every minute

// ---------------------------------------------------------------------
//  AUTH MIDDLEWARE
// ---------------------------------------------------------------------
function requireAuth(req, res, next) {
  if (LOGGED_IN) {
    return next();
  }
  res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
}

// ---------------------------------------------------------------------
//  LOGIN PAGE
// ---------------------------------------------------------------------
app.get("/login", (req, res) => {
  const next = req.query.next || "/kiosk";
  res.render("login", { next, error: null });
});

app.post("/login", async (req, res) => {
  const { employee_id, password_hash, next } = req.body;

  // Only allow kiosk employee_id = 9999
  if (employee_id !== "9999") {
    return res.render("login", {
      next,
      error: "Access denied. Kiosk login only.",
    });
  }

  try {
    const result = await pool.query(
      `SELECT password_hash FROM employee WHERE employee_id = $1`,
      [9999]
    );

    if (result.rowCount === 0) {
      return res.render("login", {
        next,
        error: "Kiosk user not found in database.",
      });
    }

    const storedHash = result.rows[0].password_hash;

    if (password_hash === storedHash) {
      LOGGED_IN = true;
      lastActivity = Date.now();
      console.log("Kiosk login successful (9999)");
      return res.redirect(next);
    } else {
      res.render("login", {
        next,
        error: "Incorrect password.",
      });
    }
  } catch (err) {
    console.error("Login DB error:", err);
    res.render("login", { next, error: "Database error." });
  }
});

// ---------------------------------------------------------------------
//  LOGOUT
// ---------------------------------------------------------------------
app.get("/logout", (req, res) => {
  LOGGED_IN = false;
  console.log("Kiosk logged out");
  res.redirect("/login");
});

// ---------------------------------------------------------------------
//  NAVIGATION
// ---------------------------------------------------------------------
app.get("/", (req, res) => res.render("navigation"));
app.get("/manager", (req, res) => res.render("manager"));
app.get("/cashier", (req, res) => res.render("cashier"));
app.get("/kitchen", (req, res) => res.render("kitchen"));
app.get("/menu-board", (req, res) => res.render("menu-board"));

// ---------------------------------------------------------------------
//  1. KIOSK MENU – PROTECTED
// ---------------------------------------------------------------------
let menuCache = { entrees: [], a_la_carte: [], sides: [], appetizers: [] };

app.get("/kiosk", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, price, category_id
      FROM menu_item
      WHERE is_active = true
      ORDER BY name
    `);

    const grouped = { entrees: [], a_la_carte: [], sides: [], appetizers: [] };
    result.rows.forEach((row) => {
      const price = parseFloat(row.price);
      if (row.category_id === 1) grouped.entrees.push({ name: row.name, price });
      else if (row.category_id === 3) grouped.a_la_carte.push({ name: row.name, price });
      else if (row.category_id === 4) grouped.sides.push({ name: row.name, price });
      else if (row.category_id === 2) grouped.appetizers.push({ name: row.name, price });
    });

    menuCache = grouped;
    res.render("menu", { menu: grouped });
  } catch (err) {
    console.error("Menu query error:", err);
    res.status(500).send("Unable to load menu");
  }
});

// ---------------------------------------------------------------------
//  2. ORDER PAGE – PROTECTED
// ---------------------------------------------------------------------
app.get("/order", requireAuth, async (req, res) => {
  let menu = { entrees: [], sides: [] };

  try {
    const result = await pool.query(`
      SELECT name, price, category_id
      FROM menu_item
      WHERE is_active = true
      ORDER BY name
    `);

    result.rows.forEach((row) => {
      const price = parseFloat(row.price);
      if (row.category_id === 1) menu.entrees.push({ name: row.name, price });
      else if (row.category_id === 4) menu.sides.push({ name: row.name, price });
    });
  } catch (err) {
    console.error("DB error in /order:", err);
    return res.status(500).send("Database error");
  }

  res.render("order", { menu });
});

// ---------------------------------------------------------------------
//  3. SUMMARY PAGE – PROTECTED
// ---------------------------------------------------------------------
app.get("/summary", requireAuth, (req, res) => {
  const { entree, side } = req.query;

  const find = (arr, name) => arr.find((i) => i.name === name) || null;
  const selEntree = entree ? find(menuCache.entrees, entree) : null;
  const selSide = side ? find(menuCache.sides, side) : null;

  const items = [];
  let total = 0;

  if (selEntree) {
    items.push(selEntree);
    total += selEntree.price;
  }
  if (selSide) {
    items.push(selSide);
    total += selSide.price;
  }

  const order = { items, total: total.toFixed(2) };
  res.render("summary", { order });
});

// ---------------------------------------------------------------------
//  4. TEST DB CONNECTION
// ---------------------------------------------------------------------
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0].now });
  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ success: false, error: "Database connection failed" });
  }
});

// ---------------------------------------------------------------------
//  START SERVER
// ---------------------------------------------------------------------
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log("Kiosk login: employee_id = 9999 + password from DB");
});