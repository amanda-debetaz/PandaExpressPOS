// index.js
const express = require("express");
const { Pool } = require("pg");
const dotenv = require("dotenv");

// --- 1. IMPORT ALL AUTH MODULES ---
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const flash = require("connect-flash");

dotenv.config({ path: "./postgres.env" });

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

const isProduction = process.env.NODE_ENV === 'production';

// --- 2. DYNAMIC POOL CONFIGURATION ---
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

// ---------- PostgreSQL pool ----------
const pool = new Pool(poolConfig);

// ---------- View engine & static ----------
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true })); // for POST body

// --- 3. CONFIGURE MIDDLEWARE (Order is important!) ---
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      maxAge: 24 * 60 * 60 * 1000,
      secure: isProduction
    } 
}));

app.use(flash()); 
app.use(passport.initialize());
app.use(passport.session());

// ---------- Graceful shutdown ----------
process.on("SIGINT", () => {
  pool.end();
  console.log("Application shutdown");
  process.exit(0);
});

// ---------------------------------------------------------------------
//  PASSPORT STRATEGIES
// ---------------------------------------------------------------------

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

// --- 3. PASSPORT SESSION MANAGEMENT ---
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

// ---------------------------------------------------------------------
//  AUTH MIDDLEWARE
// ---------------------------------------------------------------------
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next(); 
  }
  console.log("ensureAuthenticated: User not logged in. Redirecting to /");
  req.flash('error', 'You must be logged in to view that page.');
  res.redirect('/');
}

// ---------------------------------------------------------------------
//  PUBLIC & AUTH ROUTES
// ---------------------------------------------------------------------

app.get("/", (req, res) => {
  res.render("navigation", { 
    user: req.user,
    error: req.flash('error'),
    success: req.flash('success')
  });
});

app.get("/login", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/kiosk'); 
  }
  const next = req.query.next || '/kiosk';
  res.render("login", { 
    error: req.flash('error'),
    next: next
  });
});

app.post("/login", (req, res, next) => {
  const nextRedirect = req.body.next || '/kiosk';

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


app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: '/',
    failureFlash: true
  }),
  (req, res) => {
    if (req.user && req.user.role === 'manager') {
      res.redirect('/manager');
    } else {
      res.redirect('/kiosk');
    }
  }
);

app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    req.flash('error', 'You have been logged out.');
    res.redirect('/');
  });
});

// ---------------------------------------------------------------------
//  PROTECTED EMPLOYEE ROUTES
// ---------------------------------------------------------------------
app.get("/manager", ensureAuthenticated, (req, res) => {
  res.render("manager", { user: req.user });
});
app.get("/cashier", ensureAuthenticated, (req, res) => {
  res.render("cashier", { user: req.user });
});
app.get("/kitchen", ensureAuthenticated, (req, res) => {
  res.render("kitchen", { user: req.user });
});

// ---------------------------------------------------------------------
//  PUBLIC KIOSK ROUTES (Example: Menu-Board)
// ---------------------------------------------------------------------
app.get("/menu-board", async (req, res) => {
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
    
    res.render("menu-board", { menu: grouped }); 
  } catch (err) {
    console.error("Menu Board query error:", err);
    res.status(500).send("Unable to load menu board");
  }
});

// ---------------------------------------------------------------------
//  PROTECTED KIOSK ROUTES (Actual Ordering)
// ---------------------------------------------------------------------
let menuCache = { entrees: [], a_la_carte: [], sides: [], appetizers: [] };

app.get("/kiosk", ensureAuthenticated, async (req, res) => {
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

app.get("/order", ensureAuthenticated, async (req, res) => {
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
  } catch (err)
  {
    console.error("DB error in /order:", err);
    return res.status(500).send("Database error");
  }
  res.render("order", { menu });
});

app.get("/summary", ensureAuthenticated, (req, res) => {
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
//  TEST DB CONNECTION
// ---------------------------------------------------------------------
app.get("/test-db", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0].now, user: req.user.display_name });
  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ success: false, error: "Database connection failed" });
  }
});

// ---------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  if (!isProduction) {
    console.log(`Local dev server: http://localhost:${port}`);
    console.log("Local Kiosk Login: employee_id = 9999 + password from DB");
  }
});
