// index.js
const express = require("express");
const { Pool } = require("pg");
const dotenv = require("dotenv");
const flash = require("connect-flash");

// Authentication
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LocalStrategy = require("passport-local").Strategy;

dotenv.config({ path: "./postgres.env" });

const app = express();
const port = process.env.PORT || 3000;

// ---------- PostgreSQL pool (Render.com) ----------
  console.log("Running in development mode, using postgres.env variables.");
  poolConfig = {
    user: process.env.PSQL_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DATABASE,
    password: process.env.PSQL_PASSWORD,
    port: process.env.PSQL_PORT,
    ssl: undefined // Explicitly disable SSL for local dev
  };

const pool = new Pool(poolConfig);

//const pool = new Pool({
//  connectionString: process.env.DATABASE_URL,
//  ssl: { rejectUnauthorized: false },
//});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24-hour session
}));
app.use(flash());

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({
    usernameField: 'employee_id',
    passwordField: 'password_hash'
  },
  async (employee_id, password_hash, done) => {
    // ---- 1. Validate input ----
    const empId = parseInt(employee_id, 10);
    if (isNaN(empId)) {
      return done(null, false, { message: 'Invalid Employee ID.' });
    }

    // ---- 2. Query DB ----
    try {
      const result = await pool.query(
        `SELECT * FROM employee WHERE employee_id = $1`,
        [empId]
      );

      if (result.rowCount === 0) {
        return done(null, false, { message: 'No employee found with that ID.' });
      }

      const user = result.rows[0];
      const stored = user.password_hash.trim();

      if (password_hash === stored) {
        console.log(`LOCAL LOGIN SUCCESS: ${user.employee_id}`);
        return done(null, user); 
      } else {
        console.log("LOCAL LOGIN FAILED: wrong password");
        return done(null, false, { message: 'Incorrect password.' });
      }
    } catch (err) {
      console.error("Login DB error:", err);
      return done(err);
    }
  }
));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const displayName = profile.displayName;

    try {
      // 1. Find user by their Google ID
      let result = await pool.query('SELECT * FROM employee WHERE google_id = $1', [googleId]);
      
      if (result.rowCount > 0) {
        // --- User found by Google ID ---
        console.log(`GOOGLE LOGIN: Found user by google_id ${result.rows[0].employee_id}`);
        return done(null, result.rows[0]);
      }

      // 2. Not found? Try to link by email
      result = await pool.query('SELECT * FROM employee WHERE email = $1', [email]);
      
      if (result.rowCount > 0) {
        // --- User found by email, link their Google ID ---
        const user = result.rows[0];
        console.log(`GOOGLE LOGIN: Linking google_id to user ${user.employee_id}`);
        
        await pool.query(
          'UPDATE employee SET google_id = $1, display_name = $2 WHERE employee_id = $3',
          [googleId, displayName, user.employee_id]
        );
        
        // Return the updated user
        user.google_id = googleId;
        user.display_name = displayName;
        return done(null, user);
      }

      // 3. Not found at all. Deny access.
      console.warn(`GOOGLE LOGIN DENIED: No employee found with email ${email}`);
      return done(null, false, { message: 'This Google account is not associated with an employee.' });

    } catch (err) {
      console.error("Google Strategy DB Error:", err);
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.employee_id); // Use the database primary key
});

// Uses the employee_id from the session to fetch the user on each request
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM employee WHERE employee_id = $1', [id]);
    if (result.rowCount === 0) {
      return done(new Error('User not found in session.'));
    }
    done(null, result.rows[0]); // Attaches user object to req.user
  } catch (err) {
    done(err);
  }
});

// ---------- View engine & static ----------
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true })); // for POST body

// ---------------------------------------------------------------------
//  AUTH MIDDLEWARE
// ---------------------------------------------------------------------
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    // User is logged in, proceed to the route
    return next();
  }
  console.log("ensureAuthenticated: User not logged in. Redirecting to /");
  req.flash('error', 'You must be logged in to view that page.');
  res.redirect('/');
}

// ---------------------------------------------------------------------
//  LOGIN PAGE
// ---------------------------------------------------------------------
app.get("/login", (req, res) => {
  const next = req.query.next || "/kiosk";
  res.render("login", { next, error: req.flash('error') });
  
});

app.post("/login", (req, res, next) => {
  const nextRedirect = req.body.next || '/kiosk';
  
  passport.authenticate('local', {
    successRedirect: nextRedirect,       // On success, go where 'next' points
    failureRedirect: '/login?next=' + encodeURIComponent(nextRedirect), // On fail, reload login page
    failureFlash: true                   // Use flash messages for errors
  })(req, res, next);
});

// ---------------------------------------------------------------------
//  Auth Routes
// ---------------------------------------------------------------------

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/', failureFlash: true }),
  (req, res) => {    if (req.user.role === 'manager') {
      res.redirect('/manager');
    } else {
      res.redirect('/kiosk');
    }
});

// ---------------------------------------------------------------------
//  LOGOUT
// ---------------------------------------------------------------------
app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    req.flash('error', 'You have been logged out.');
    res.redirect('/');
  });
});

// ---------------------------------------------------------------------
//  NAVIGATION
// ---------------------------------------------------------------------
app.get("/", (req, res) => { res.render("navigation", { user: req.user, error: req.flash('error') }); });
app.get("/manager", ensureAuthenticated, (req, res) => {res.render("manager", { user: req.user });});
app.get("/cashier", ensureAuthenticated, (req, res) => {res.render("cashier", { user: req.user });});
app.get("/kitchen", ensureAuthenticated, (req, res) => {res.render("kitchen", { user: req.user });});
app.get("/menu-board", (req, res) => res.render("menu-board"));

// ---------------------------------------------------------------------
//  1. KIOSK MENU – PROTECTED
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

// ---------------------------------------------------------------------
//  2. ORDER PAGE – PROTECTED
// ---------------------------------------------------------------------
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
  } catch (err) {
    console.error("DB error in /order:", err);
    return res.status(500).send("Database error");
  }

  res.render("order", { menu });
});

// ---------------------------------------------------------------------
//  3. SUMMARY PAGE – PROTECTED
// ---------------------------------------------------------------------
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