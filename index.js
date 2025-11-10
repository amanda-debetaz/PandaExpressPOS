// index.js
const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const flash = require("connect-flash");

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

const isProduction = process.env.NODE_ENV === 'production';

// ---------- PostgreSQL ----------
let poolConfig;

if (isProduction) {
  console.log("Running in production mode, using DATABASE_URL.");
  poolConfig = {
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false }
  };
} else {
  console.log("Running in development mode, using postgres.env variables.");
  poolConfig = {
    user: process.env.PSQL_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DATABASE,
    password: process.env.PSQL_PASSWORD,
    port: process.env.PSQL_PORT,
    ssl: undefined
  };
}

const pool = new Pool(poolConfig);

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
    cookie: { maxAge: 30 * 60 * 1000, secure: isProduction},
  })
);

// ---------- Passport ----------
app.use(flash()); 
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user.employee_id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query(
      'SELECT * FROM employee WHERE employee_id = $1', [id]
    );
    if (result.rowCount > 0) {
      done(null, result.rows[0]); 
    } else {
      done(null, false); 
    }
  } catch (err) {
    done(err);
  }
});

// --- 1. LOCAL (Employee ID / Password) STRATEGY ---
passport.use(new LocalStrategy(
  { usernameField: 'employee_id', passwordField: 'password_hash' }, 
  async (employee_id, password, done) => {
    
    const empId = parseInt(employee_id, 10);
    if (isNaN(empId)) {
      console.log(`LOCAL LOGIN FAILED: Invalid ID format "${employee_id}"`);
      return done(null, false, { message: 'Employee ID must be a number.' });
    }

    try {
      const result = await pool.query(
        `SELECT employee_id, password_hash, display_name, role 
         FROM employee WHERE employee_id = $1`,
        [empId]
      );

      if (result.rowCount === 0) {
        console.log(`LOCAL LOGIN FAILED: No user for ID ${empId}`);
        return done(null, false, { message: 'Incorrect Employee ID.' });
      }

      const user = result.rows[0];
      const storedHash = user.password_hash.trim();

      if (password === storedHash) { 
        console.log(`LOCAL LOGIN SUCCESS: ${user.employee_id}`);
        return done(null, user);
      } else {
        console.log(`LOCAL LOGIN FAILED: Wrong password for ${user.employee_id}`);
        return done(null, false, { message: 'Incorrect password.' });
      }
    } catch (err) {
      console.error("Local Strategy DB Error:", err);
      return done(err);
    }
  }
));

// --- 2. GOOGLE (OAuth2) STRATEGY ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    const google_id = profile.id;
    const email = profile.emails[0].value;
    const display_name = profile.displayName;

    try {
      let result = await pool.query(
        'SELECT * FROM employee WHERE google_id = $1', [google_id]
      );

      if (result.rowCount > 0) {
        const user = result.rows[0];
        console.log(`GOOGLE LOGIN: Found user by google_id ${user.employee_id}`);
        return done(null, user);
      }

      console.log(`GOOGLE LOGIN: No user found for google_id. Checking email: ${email}`);
      result = await pool.query(
        'SELECT * FROM employee WHERE email = $1', [email]
      );

      if (result.rowCount === 0) {
        console.warn(`GOOGLE LOGIN DENIED: No employee found with email ${email}`);
        return done(null, false, { message: 'This Google account is not associated with an authorized employee.' });
      }

      const user = result.rows[0];
      console.log(`GOOGLE LOGIN: Linking google_id to user ${user.employee_id}`);
      
      await pool.query(
        'UPDATE employee SET google_id = $1, display_name = $2 WHERE employee_id = $3',
        [google_id, user.display_name || display_name, user.employee_id]
      );
      
      user.google_id = google_id; 
      user.display_name = user.display_name || display_name;
      return done(null, user);

    } catch (err) {
      console.error("Google Strategy DB Error:", err);
      return done(err);
    }
  }
));

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
  if (req.isAuthenticated()) {
    return next(); 
  }
  console.log("requireAuth: User not logged in. Redirecting to /");
  req.flash('error', 'You must be logged in to view that page.');
  res.redirect('/');
}

// ---------- Login routes ----------
app.get("/login", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/'); 
  }
  const next = req.query.next || '/';
  res.render("login", { 
    error: req.flash('error'),
    next: next
  });
});

app.post("/login", (req, res, next) => {
  const nextRedirect = req.body.next || '/';

  passport.authenticate('local', (err, user, info) => {
    if (err) { return next(err); }
    if (!user) {
      req.flash('error', info.message);
      return res.redirect('/login?next=' + encodeURIComponent(nextRedirect));
    }
    req.logIn(user, (err) => {
      if (err) { return next(err); }
      return res.redirect(nextRedirect);
    });
  })(req, res, next);
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
    const redirectTo = req.query.state ? decodeURIComponent(req.query.state) : "/";
    console.log(`OAuth success → ${req.user.email || "unknown"}`);
    res.redirect(redirectTo);
  }
);

// Logout
app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    req.flash('error', 'You have been logged out.');
    res.redirect('/');
  });
});

// ---------- Navigation (unchanged) ----------
app.get("/", (req, res) => {
  res.render("navigation", { 
    user: req.user,
    error: req.flash('error'),
    success: req.flash('success')
  });
});
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
