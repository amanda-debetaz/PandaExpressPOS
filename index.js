// index.js
const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const app = express();
const port = process.env.PORT || 3000;

// ---------- PostgreSQL ----------
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
app.use(express.urlencoded({ extended: true }));

// ---------- Session ----------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 60 * 1000, secure: process.env.NODE_ENV === "production" },
  })
);

// ---------- Passport ----------
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const res = await pool.query("SELECT * FROM employee WHERE id = $1", [id]);
    done(null, res.rows[0] || { id });
  } catch (e) {
    done(e);
  }
});

// ---------- Google Strategy ----------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI,
    },
    async (accessToken, refreshToken, profile, done) => {
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value?.toLowerCase();

      // ---- Restrict to your domain (customise) ----
      if (!email?.endsWith("@pandaexpress.com")) {
        return done(null, false, { message: "Use a Panda Express account" });
      }

      try {
        // Upsert employee record (you may keep employee_id = 9999)
        const upsert = await pool.query(
          `INSERT INTO employee (google_id, email, employee_id)
           VALUES ($1, $2, 9999)
           ON CONFLICT (google_id) DO UPDATE SET email = $2
           RETURNING id`,
          [googleId, email]
        );
        const user = upsert.rows[0];
        return done(null, user);
      } catch (e) {
        return done(e);
      }
    }
  )
);

// ---------- Activity / auto-logout ----------
let lastActivity = Date.now();
app.use((req, res, next) => {
  if (req.isAuthenticated()) lastActivity = Date.now();
  next();
});
setInterval(() => {
  if (Date.now() - lastActivity > 30 * 60 * 1000) {
    console.log("Auto-logout (30 min inactivity)");
    // Sessions will expire via cookie maxAge anyway
  }
}, 60_000);

// ---------- Auth middleware ----------
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
}

// ---------- Login routes ----------
app.get("/login", (req, res) => {
  const next = req.query.next || "/kiosk";
  const error = req.query.error;
  res.render("login", { next, error });
});

app.post("/login", (req, res) => {
  const next = req.body.next || "/kiosk";
  // Pass the desired redirect as OAuth "state"
  res.redirect(`/auth/google?state=${encodeURIComponent(next)}`);
});

// Google OAuth entry point
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth callback
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=oauth_failed" }),
  (req, res) => {
    const redirectTo = req.query.state ? decodeURIComponent(req.query.state) : "/kiosk";
    console.log(`OAuth success → ${req.user.email || "unknown"}`);
    res.redirect(redirectTo);
  }
);

// Logout
app.get("/logout", (req, res) => {
  req.logout(() => {});
  res.redirect("/login");
});

// ---------- Navigation (unchanged) ----------
app.get("/", (req, res) => res.render("navigation"));
app.get("/manager", requireAuth, (req, res) => res.render("manager"));
app.get("/cashier", requireAuth, (req, res) => res.render("cashier"));
app.get("/kitchen", requireAuth, (req, res) => res.render("kitchen"));
app.get("/menu-board", requireAuth, (req, res) => res.render("menu-board"));

// ---------- 1. KIOSK MENU ----------
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

// ---------- 2. ORDER ----------
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

// ---------- 3. SUMMARY ----------
app.get("/summary", requireAuth, (req, res) => {
  const { entree, side } = req.query;
  const find = (arr, name) => arr.find((i) => i.name === name) || null;
  const selEntree = entree ? find(menuCache.entrees, entree) : null;
  const selSide = side ? find(menuCache.sides, side) : null;

  const items = [];
  let total = 0;
  if (selEntree) { items.push(selEntree); total += selEntree.price; }
  if (selSide)   { items.push(selSide);   total += selSide.price;   }

  const order = { items, total: total.toFixed(2) };
  res.render("summary", { order });
});

// ---------- 4. TEST DB ----------
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0].now });
  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ success: false, error: "Database connection failed" });
  }
});

// ---------- 5. MENU BOARD ---------

app.get("/menu-board", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, price, category_id
      FROM menu_item
      WHERE is_active = true
      ORDER BY name
    `);

    const grouped = { entrees: [], a_la_carte: [], sides: [], appetizers: [] };
    result.rows.forEach(row => {
      const price = parseFloat(row.price);
      if (row.category_id === 1) grouped.entrees.push({ name: row.name, price });
      else if (row.category_id === 3) grouped.a_la_carte.push({ name: row.name, price });
      else if (row.category_id === 4) grouped.sides.push({ name: row.name, price });
      else if (row.category_id === 2) grouped.appetizers.push({ name: row.name, price });
    });

    res.render("menu-board", { menu: grouped }); // <-- pass menu here
  } catch (err) {
    console.error("Menu Board query error:", err);
    res.status(500).send("Unable to load menu board");
  }
}); 

// ---------- START ----------
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log("Login → /login (Google OAuth)");
});