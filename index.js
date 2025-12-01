// index.js
require('reflect-metadata');

const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const flash = require("connect-flash");
require('dotenv').config({ path: './postgres.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

const isProduction = process.env.NODE_ENV === 'production';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());               // <-- add once if not already present

// ---------- PostgreSQL ----------
// All DB access uses Prisma. No direct pg pool needed.

// ---------- Graceful shutdown ----------
async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  try { await prisma.$disconnect(); } catch (e) { console.error('Prisma disconnect error', e); }
  process.exit(0);
}
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => shutdown(sig)));

// ---------- View engine & static ----------
app.set("view engine", "ejs");
app.use(express.static("public"));


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
    const user = await prisma.employee.findUnique({
      where: { employee_id: id }
    });
    if (user) {
      done(null, user); 
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
      const user = await prisma.employee.findUnique({
        where: { employee_id: empId },
        select: {
          employee_id: true,
          password_hash: true,
          display_name: true,
          role: true
        }
      });

      if (!user) {
        console.log(`LOCAL LOGIN FAILED: No user for ID ${empId}`);
        return done(null, false, { message: 'Incorrect Employee ID.' });
      }

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
      let user = await prisma.employee.findUnique({
        where: { google_id: google_id }
      });

      if (user) {
        console.log(`GOOGLE LOGIN: Found user by google_id ${user.employee_id}`);
        return done(null, user);
      }

      console.log(`GOOGLE LOGIN: No user found for google_id. Checking email: ${email}`);
      user = await prisma.employee.findUnique({
        where: { email: email }
      });

      if (!user) {
        console.warn(`GOOGLE LOGIN DENIED: No employee found with email ${email}`);
        return done(null, false, { message: 'This Google account is not associated with an authorized employee.' });
      }

      console.log(`GOOGLE LOGIN: Linking google_id to user ${user.employee_id}`);
      
      const updatedUser = await prisma.employee.update({
        where: { employee_id: user.employee_id },
        data: {
          google_id: google_id,
          display_name: user.display_name || display_name
        }
      });
      
      return done(null, updatedUser);

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
app.get("/manager", async (req, res) => {
  const employees = await prisma.employee.findMany({
    where: { is_active: true }
  });

  res.render("manager", { employees });
});
app.get("/cashier", requireAuth, (req, res) => res.render("cashier"));

let doneViewCutoff = new Date("2025-11-08T00:00:00Z");
app.get("/kitchen", requireAuth, async (req, res) => {
  try {
    const cutoff = doneViewCutoff;

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { status: { not: 'done' } },
          { status: 'done', completed_at: { gte: cutoff } }
        ]
      },
      orderBy: { created_at: 'asc' },
      include: {
        order_item: {
          include: {
            menu_item: { select: { name: true } },
            order_item_option: {
              include: { option: { select: { name: true, menu_item: { select: { category_id: true } } } } },
            },
          },
        },
      },
    });

    // Load items that are prepared on the line (entrees/sides) for batch-cook UI
    const prepItems = await prisma.menu_item.findMany({
      where: { is_active: true, category_id: { in: PREPARED_CATEGORY_IDS } },
      select: { menu_item_id: true, name: true, category_id: true },
      orderBy: { name: 'asc' },
    });

    const ctFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      day: '2-digit'
    });

    const viewOrders = orders.map((o) => ({
      orderId: o.order_id,
      placedAt: o.created_at,
      placedAtCT: ctFormatter.format(o.created_at),
      status: o.status,
      dineOption: o.dine_option,
      notes: o.notes ?? null,
      items: o.order_item.map((oi) => {
        // Derive pretty option labels with counts and half-sides when applicable
        const options = [];
        const oios = oi.order_item_option || [];
        // Gather side options (category 4) and entree options (category 3)
        const sideOpts = [];
        const entreeOpts = [];
        for (const x of oios) {
          const cat = x.option?.menu_item?.category_id;
          const name = x.option?.name;
          const qty = x.qty || 1;
          if (!name) continue;
          if (cat === 4) sideOpts.push({ name, qty });
          else if (cat === 3) entreeOpts.push({ name, qty });
          else options.push(name); // fallback
        }
        const totalSideUnits = sideOpts.reduce((s, v) => s + (v.qty || 1), 0);
        if (totalSideUnits >= 2) {
          // Show each side unit as 1/2
          for (const s of sideOpts) {
            const units = s.qty || 1;
            for (let i = 0; i < units; i++) options.push(`${s.name} (1/2)`);
          }
        } else if (totalSideUnits === 1) {
          // Single full side
          for (const s of sideOpts) {
            // if somehow multiple entries, still list by qty
            for (let i = 0; i < (s.qty || 1); i++) options.push(`${s.name}`);
          }
        }
        // Entrees with counts
        // Collapse by name to show xN succinctly
        const entreeCountMap = new Map();
        for (const e of entreeOpts) {
          entreeCountMap.set(e.name, (entreeCountMap.get(e.name) || 0) + (e.qty || 1));
        }
        for (const [name, count] of entreeCountMap.entries()) {
          options.push(count > 1 ? `${name} x${count}` : name);
        }
        return {
          qty: oi.qty,
          menuItem: { name: oi.menu_item?.name ?? 'Unknown item' },
          options,
        };
      }),
    }));

    const queued = [];
    const cooking = [];
    const done = [];

    for (const o of viewOrders) {
      if (o.status === 'queued') queued.push(o);
      else if (o.status === 'prepping') cooking.push(o);
      else if (o.status === 'done') done.push(o);
    }

    res.render("kitchen", { queued, cooking, done, prepItems });
  } catch (err) {
    console.error("Error fetching kitchen orders via Prisma:", err);
    res.status(500).send("Error loading kitchen queue");
  }
});



app.post("/kitchen/:orderId/status", requireAuth, async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  const { status } = req.body;

  const allowed = ['queued', 'prepping', 'done'];
  if (!allowed.includes(status)) {
    return res.status(400).send("Invalid status");
  }

  try {
    // For prepping/done, ensure we have prepared stock and consume it once per order
    if (status === 'prepping' || status === 'done') {
      await prisma.$transaction(async (tx) => {
        await ensurePreparedAndConsumeForOrder(tx, orderId);
        await tx.order.update({
          where: { order_id: orderId },
          data: {
            status,
            completed_at: status === 'done' ? new Date() : null,
          },
        });
      });
    } else {
      await prisma.order.update({
        where: { order_id: orderId },
        data: { status, completed_at: null },
      });
    }

    res.redirect("/kitchen");
  } catch (err) {
    if (err && err.__insufficientStock) {
      return res.status(400).send(err.message || 'Insufficient prepared stock');
    }
    console.error("Error updating kitchen order status:", err);
    res.status(500).send("Error updating order status");
  }
});

// Cancel order endpoint
app.post("/kitchen/:orderId/cancel", requireAuth, async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);

  try {
    // Delete the order (cascade will delete related order_items and payment)
    await prisma.order.delete({
      where: { order_id: orderId }
    });

    res.redirect("/kitchen");
  } catch (err) {
    console.error("Error cancelling order:", err);
    res.status(500).send("Error cancelling order");
  }
});

app.post("/kitchen/clear-done", requireAuth, (req, res) => {
  doneViewCutoff = new Date();
  res.redirect("/kitchen");
});

app.get("/menu-board", async (req, res) => {
  try {
    const items = await prisma.menu_item.findMany({
      where: { is_active: true },
      select: { name: true, price: true, category_id: true },
      orderBy: { name: 'asc' },
    });

    const grouped = { entrees: [], a_la_carte: [], sides: [], appetizers: [], featured: [] };

    items.forEach(row => {
      const price = Number(row.price);
      if (row.category_id === 1) grouped.entrees.push({ name: row.name, price });
      else if (row.category_id === 3) grouped.a_la_carte.push({ name: row.name, price });
      else if (row.category_id === 4) grouped.sides.push({ name: row.name, price });
      else if (row.category_id === 2) grouped.appetizers.push({ name: row.name, price });
    });

    // Simple featured list: first 5 entrees (fallback to any items if fewer)
    grouped.featured = grouped.entrees.slice(0, 5);
    if (grouped.featured.length === 0) {
      // fallback: take first 5 of any category concatenated
      const all = [...grouped.entrees, ...grouped.a_la_carte, ...grouped.sides, ...grouped.appetizers];
      grouped.featured = all.slice(0, 5);
    }

    let page = (req.query.page || 'entrees').toLowerCase();
    if (!grouped[page]) page = 'entrees';

    res.render("menu-board", { menu: grouped, page });
  } catch (err) {
    console.error("Menu Board query error:", err);
    res.status(500).send("Unable to load menu board");
  }
});

// ---------- 1. KIOSK MENU ----------
let menuCache = { entrees: [], a_la_carte: [], sides: [], appetizers: [] };

app.get("/kiosk", async (req, res) => {
  try {
    // Fetch all active menu items with their categories and ingredient allergens
    const menuItems = await prisma.menu_item.findMany({
      where: { is_active: true },
      include: {
        category: true,
        recipe: {
          include: {
            inventory: { select: { name: true, allergen_info: true } }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Group items by category
    const menu = {
      entrees: [],
      appetizers: [],
      a_la_carte: [],
      sides: []
    };

    // Normalization helpers for allergen strings from inventory
    const stopWords = new Set(['none', 'no', 'n/a', 'na', 'null', '-', '']);
    const stripPhrases = [/^contains\s*:?/i, /^may\s*contain\s*:?/i, /^traces\s*of\s*:?/i];
    const splitRegex = /[,/;&]|\band\b/i;

    function normalizeTokens(text) {
      if (!text) return [];
      let t = String(text).trim();
      // Remove leading phrases like "contains", "may contain"
      for (const rx of stripPhrases) t = t.replace(rx, '').trim();
      return t
        .split(splitRegex)
        .map(s => s.trim().toLowerCase())
        .filter(s => s && !stopWords.has(s));
    }

    function titleCase(s) {
      return s.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
    }

    menuItems.forEach(item => {
      // Collect normalized allergens from each ingredient's allergen_info
      const allergenSet = new Set();
      (item.recipe || []).forEach(r => {
        const s = (r.inventory?.allergen_info || '').trim();
        if (!s) return;
        const toks = normalizeTokens(s);
        toks.forEach(a => allergenSet.add(a));
      });

      const itemData = {
        name: item.name,
        price: parseFloat(item.price),
        allergens: Array.from(allergenSet).map(titleCase)
      };

      // Category IDs from your schema:
      // 1 = Entrees
      // 2 = Appetizers  
      // 3 = A La Carte
      // 4 = Sides
      switch (item.category_id) {
        case 1:
          menu.entrees.push(itemData);
          break;
        case 2:
          menu.appetizers.push(itemData);
          break;
        case 3:
          menu.a_la_carte.push(itemData);
          break;
        case 4:
          menu.sides.push(itemData);
          break;
      }
    });

    res.render("kiosk", { menu });
  } catch (err) {
    console.error("Kiosk query error:", err);
    res.status(500).send("Unable to load kiosk");
  }
});

// ---------- Builder Pages (new) ----------
function findMealPrice(allEntrees, type) {
  const map = { bowl: 'Bowl', plate: 'Plate', 'bigger-plate': 'Bigger Plate' };
  const name = map[type] || 'Plate';
  const found = allEntrees.find(e => e.name === name);
  return found ? found.price : 0;
}

app.get('/builder/:type', async (req, res) => {
  try {
    const type = (req.params.type || 'plate').toLowerCase();
    const isEdit = req.query.edit === '1' || req.query.edit === 'true';
    const editIdx = req.query.idx ? Number(req.query.idx) : null;
    const items = await prisma.menu_item.findMany({
      where: { is_active: true },
      include: {
        category: true,
        recipe: {
          include: {
            inventory: { select: { name: true, allergen_info: true } }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Allergen helpers
    const stopWords = new Set(['none', 'no', 'n/a', 'na', 'null', '-', '']);
    const stripPhrases = [/^contains\s*:?/i, /^may\s*contain\s*:?/i, /^traces\s*of\s*:?/i];
    const splitRegex = /[,/;&]|\band\b/i;
    function normalizeTokens(text) {
      if (!text) return [];
      let t = String(text).trim();
      for (const rx of stripPhrases) t = t.replace(rx, '').trim();
      return t.split(splitRegex).map(s => s.trim().toLowerCase()).filter(s => s && !stopWords.has(s));
    }
    function titleCase(s) { return s.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1)); }

    const menu = { entrees: [], sides: [] };
    const premiumEntrees = new Set(['Honey Walnut Shrimp', 'Black Pepper Sirloin Steak']); // Define premium items

    for (const item of items) {
      const allergenSet = new Set();
      (item.recipe || []).forEach(r => {
        const s = (r.inventory?.allergen_info || '').trim();
        if (!s) return;
        normalizeTokens(s).forEach(a => allergenSet.add(a));
      });
      const itemData = {
        name: item.name,
        price: Number(item.price),
        allergens: Array.from(allergenSet).map(titleCase),
        isPremium: premiumEntrees.has(item.name)
      };
      // Category 3 = A La Carte (actual protein dishes)
      // Category 4 = Sides
      if (item.category_id === 3) menu.entrees.push(itemData);
      else if (item.category_id === 4) menu.sides.push(itemData);
    }

    // Find base price from category 1 (Bowl/Plate/Bigger Plate)
    const mealItems = items.filter(i => i.category_id === 1);
    const basePrice = (() => {
      const map = { bowl: 'Bowl', plate: 'Plate', 'bigger-plate': 'Bigger Plate' };
      const name = map[type] || 'Plate';
      const found = mealItems.find(e => e.name === name);
      return found ? Number(found.price) : 0;
    })();
    // Premium surcharge: $1.50 per premium entree
    const premiumSurcharge = 1.50;
    res.render('builder', { menu, type, price: basePrice, premiumSurcharge, isEdit, editIdx });
  } catch (err) {
    console.error('Builder route error:', err);
    res.status(500).send('Unable to load builder');
  }
});

app.get('/builder/edit', async (req, res) => {
  try {
    const type = (req.query.type || 'plate').toLowerCase();
    const editIdx = req.query.idx ? Number(req.query.idx) : null;
    const items = await prisma.menu_item.findMany({
      where: { is_active: true },
      include: {
        category: true,
        recipe: {
          include: {
            inventory: { select: { name: true, allergen_info: true } }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Allergen helpers
    const stopWords = new Set(['none', 'no', 'n/a', 'na', 'null', '-', '']);
    const stripPhrases = [/^contains\s*:?/i, /^may\s*contain\s*:?/i, /^traces\s*of\s*:?/i];
    const splitRegex = /[,/;&]|\band\b/i;
    function normalizeTokens(text) {
      if (!text) return [];
      let t = String(text).trim();
      for (const rx of stripPhrases) t = t.replace(rx, '').trim();
      return t.split(splitRegex).map(s => s.trim().toLowerCase()).filter(s => s && !stopWords.has(s));
    }
    function titleCase(s) { return s.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1)); }

    const menu = { entrees: [], sides: [] };
    const premiumEntrees = new Set(['Honey Walnut Shrimp', 'Black Pepper Sirloin Steak']); // Define premium items

    for (const item of items) {
      const allergenSet = new Set();
      (item.recipe || []).forEach(r => {
        const s = (r.inventory?.allergen_info || '').trim();
        if (!s) return;
        normalizeTokens(s).forEach(a => allergenSet.add(a));
      });
      const itemData = {
        name: item.name,
        price: Number(item.price),
        allergens: Array.from(allergenSet).map(titleCase),
        isPremium: premiumEntrees.has(item.name)
      };
      // Category 3 = A La Carte (actual protein dishes)
      // Category 4 = Sides
      if (item.category_id === 3) menu.entrees.push(itemData);
      else if (item.category_id === 4) menu.sides.push(itemData);
    }

    // Find base price from category 1 (Bowl/Plate/Bigger Plate)
    const mealItems = items.filter(i => i.category_id === 1);
    const basePrice = (() => {
      const map = { bowl: 'Bowl', plate: 'Plate', 'bigger-plate': 'Bigger Plate' };
      const name = map[type] || 'Plate';
      const found = mealItems.find(e => e.name === name);
      return found ? Number(found.price) : 0;
    })();
    const premiumSurcharge = 1.50;
    res.render('builder', { menu, type, price: basePrice, premiumSurcharge, isEdit: true, editIdx });
  } catch (err) {
    console.error('Builder edit error:', err);
    res.status(500).send('Unable to load builder edit');
  }
});

// Debug route to inspect allergens for a specific item by name
app.get("/debug/allergens/:name", async (req, res) => {
  try {
    const name = req.params.name;
    const item = await prisma.menu_item.findFirst({
      where: { name },
      include: {
        recipe: { include: { inventory: { select: { name: true, allergen_info: true } } } }
      }
    });
    if (!item) return res.status(404).json({ error: "menu_item not found" });

    const stopWords = new Set(['none', 'no', 'n/a', 'na', 'null', '-', '']);
    const stripPhrases = [/^contains\s*:?/i, /^may\s*contain\s*:?/i, /^traces\s*of\s*:?/i];
    const splitRegex = /[,/;&]|\band\b/i;
    function normalizeTokens(text) {
      if (!text) return [];
      let t = String(text).trim();
      for (const rx of stripPhrases) t = t.replace(rx, '').trim();
      return t
        .split(splitRegex)
        .map(s => s.trim().toLowerCase())
        .filter(s => s && !stopWords.has(s));
    }
    function titleCase(s) { return s.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1)); }

    const ingredients = (item.recipe || []).map(r => ({
      ingredient: r.inventory?.name || 'Unknown',
      allergen_info: r.inventory?.allergen_info || ''
    }));

    const allergensSet = new Set();
    ingredients.forEach(i => normalizeTokens(i.allergen_info).forEach(a => allergensSet.add(a)));

    res.json({
      item: item.name,
      allergens: Array.from(allergensSet).map(titleCase),
      ingredients
    });
  } catch (err) {
    console.error("Debug allergens error:", err);
    res.status(500).json({ error: "failed to fetch" });
  }
});

// ---------- 2. ORDER ----------
app.get("/order", requireAuth, async (req, res) => {
  const menu = { entrees: [], sides: [], a_la_carte: [] };
  try {
    const items = await prisma.menu_item.findMany({
      where: { is_active: true },
      select: { name: true, price: true, category_id: true },
      orderBy: { name: 'asc' },
    });
    items.forEach((row) => {
      const price = Number(row.price);
      if (row.category_id === 1) menu.entrees.push({ name: row.name, price });
      else if (row.category_id === 4) menu.sides.push({ name: row.name, price });
      else if (row.category_id === 3) menu.a_la_carte.push({ name: row.name, price });
    });
    res.render("order", { menu });
  } catch (err) {
    console.error("DB error in /order:", err);
    res.status(500).send("Database error");
  }
});

// ---------- 3. SUMMARY (Now supports full cart) ----------
app.post("/summary", requireAuth, async (req, res) => {
  const { cart: rawCart } = req.body;

  if (!rawCart || !Array.isArray(rawCart) || rawCart.length === 0) {
    return res.render("summary", {
      order: { items: [], total: "0.00" }
    });
  }

  // Parse cart if it's a string (from form submit)
  let cart = typeof rawCart === 'string' ? JSON.parse(rawCart) : rawCart;

  // Calculate total
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2);

  // Format items for summary.ejs
  const items = cart.map(item => ({
    name: `${item.name} × ${item.quantity}`,
    price: (item.price * item.quantity).toFixed(2)
  }));

  const order = { items, total };

  res.render("summary", { order });
});

// -------------------------------------------------
// 4. CART API (session based)
// -------------------------------------------------

// 1. Add item to cart
app.post("/api/cart/add", requireAuth, (req, res) => {
  const { name, price } = req.body;
  if (!name || price === undefined) return res.status(400).json({error: "missing data"});

  // initialise cart if needed
  if (!req.session.cart) req.session.cart = [];

  const existing = req.session.cart.find(i => i.name === name);
  if (existing) {
    existing.quantity += 1;
  } else {
    req.session.cart.push({ name, price: parseFloat(price), quantity: 1 });
  }

  res.json({ success: true, cart: req.session.cart });
});

// 2. Get current cart (for the modal)
app.get("/api/cart", requireAuth, (req, res) => {
  res.json({ cart: req.session.cart || [] });
});

// 3. Clear cart
app.delete("/api/cart/clear", requireAuth, (req, res) => {
  req.session.cart = [];
  res.json({ success: true });
});

// 4. Checkout - place order to database
app.post("/api/checkout", async (req, res) => {
  try {
    const { cart, paymentMethod, dineOption } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    if (!paymentMethod) {
      return res.status(400).json({ error: "Payment method is required" });
    }

    if (!dineOption) {
      return res.status(400).json({ error: "Dine option is required" });
    }

    // Validate dine option
    const validDineOptions = ['dine_in', 'takeout'];
    if (!validDineOptions.includes(dineOption)) {
      return res.status(400).json({ error: "Invalid dine option" });
    }

    // Total uses the combo prices already calculated on the front end
    const total = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Menu items by name (Bowl / Plate / Bigger Plate / a la carte, etc.)
    const itemNames = cart.map((item) => item.name);
    const menuItems = await prisma.menu_item.findMany({
      where: { name: { in: itemNames } },
      select: { menu_item_id: true, name: true },
    });

    const menuItemByName = {};
    menuItems.forEach((mi) => {
      menuItemByName[mi.name] = mi;
    });

    // Collect option names from all cart items (sides + entrees)
    const optionNameSet = new Set();
    cart.forEach((item) => {
      if (Array.isArray(item.options)) {
        item.options.forEach((opt) => {
          if (opt && opt.name) optionNameSet.add(opt.name);
        });
      }
    });

    let optionByName = {};
    if (optionNameSet.size > 0) {
      const optionNames = Array.from(optionNameSet);
      const options = await prisma.option.findMany({
        where: { name: { in: optionNames } },
        select: { option_id: true, name: true },
      });
      options.forEach((o) => {
        // if duplicate names exist (different groups), just keep the first
        if (!optionByName[o.name]) {
          optionByName[o.name] = o;
        }
      });
    }

    const order = await prisma.order.create({
      data: {
        employee_id: 9999, // kiosk pseudo-employee
        dine_option: dineOption,
        status: "queued",
        order_item: {
          create: cart.map((item) => {
            const mi = menuItemByName[item.name];
            if (!mi) {
              throw new Error(`Unknown menu item: ${item.name}`);
            }

            const orderItemData = {
              qty: item.quantity,
              unit_price: item.price,
              discount_amount: 0,
              tax_amount: 0,
              menu_item: {
                connect: { menu_item_id: mi.menu_item_id },
              },
            };

            // Attach options for Bowls / Plates / Bigger Plates, etc.
            if (Array.isArray(item.options) && item.options.length > 0) {
              const optionCreates = [];
              item.options.forEach((opt) => {
                const row = optionByName[opt.name];
                if (!row) return; // silently skip if not configured
                const qty = Number(opt.qty) || 1;
                optionCreates.push({
                  qty,
                  option: { connect: { option_id: row.option_id } },
                });
              });

              if (optionCreates.length > 0) {
                orderItemData.order_item_option = { create: optionCreates };
              }
            }

            return orderItemData;
          }),
        },
        payment: {
          create: {
            method: paymentMethod,
            amount: total,
          },
        },
      },
      include: {
        order_item: true,
        payment: true,
      },
    });

    res.json({ success: true, order_id: order.order_id });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ success: false, error: "Checkout failed" });
  }
});

// ---------- Prepared stock helpers and endpoints (KV via pricing_settings) ----------

// Prepared categories: keep a single source
const PREPARED_CATEGORY_IDS = [3, 4];
const PREPARED_CATEGORY_SET = new Set(PREPARED_CATEGORY_IDS);
const prepKey = (menuItemId) => `prep:mi:${menuItemId}`;

async function kvAdjustPrepared(menuItemId, delta, tx = prisma) {
  const key = prepKey(menuItemId);
  const row = await tx.pricing_settings.findUnique({ where: { key } });
  if (!row) {
    await tx.pricing_settings.create({
      data: { key, value: delta },
    });
  } else {
    // Prisma supports numeric increments for Decimal
    await tx.pricing_settings.update({
      where: { key },
      data: { value: (Number(row.value) + delta) },
    });
  }
}

// (Optional helper removed: kvGetPreparedMany was unused)

async function computeConsumptionMapForOrder(tx, orderId) {
  const ord = await tx.order.findUnique({
    where: { order_id: orderId },
    include: {
      order_item: {
        include: {
          menu_item: { select: { menu_item_id: true, category_id: true } },
          order_item_option: {
            include: {
              option: {
                select: {
                  menu_item_id: true,
                  menu_item: { select: { category_id: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!ord) throw new Error('Order not found for stock computation');

  const consumeMap = new Map();
  for (const oi of ord.order_item) {
    // If the base menu_item itself is a prepared category (3 or 4), count it directly
    if (oi.menu_item && PREPARED_CATEGORY_SET.has(oi.menu_item.category_id)) {
      consumeMap.set(
        oi.menu_item.menu_item_id,
        (consumeMap.get(oi.menu_item.menu_item_id) || 0) + oi.qty
      );
    }

    const oios = oi.order_item_option || [];
    if (oios.length === 0) continue;

    // Compute total side "units" on this order item (to detect halves)
    let totalSideUnits = 0;
    for (const oio of oios) {
      const cat = oio.option?.menu_item?.category_id;
      if (cat === 4) totalSideUnits += (oio.qty || 1);
    }

    for (const oio of oios) {
      const mid = oio.option?.menu_item_id;
      const cat = oio.option?.menu_item?.category_id;
      if (!mid || !cat) continue;

      let perItemServings = oio.qty || 1;
      if (cat === 4) {
        // Sides: if there are 2 side units, treat each as half (0.5) so they sum to 1
        if (totalSideUnits >= 2) {
          perItemServings = perItemServings / 2; // halves
        }
      }
      // Entrees (cat 3) and others: count qty as-is
      const servings = perItemServings * oi.qty;
      consumeMap.set(mid, (consumeMap.get(mid) || 0) + servings);
    }
  }
  return consumeMap;
}

// Ensure sufficient prepared stock exists and consume it once per order
async function ensurePreparedAndConsumeForOrder(tx, orderId) {
  // Idempotency: check a KV flag so we don't double-consume
  const consumedKey = `prep:consumed:order:${orderId}`;
  const existingFlag = await tx.pricing_settings.findUnique({ where: { key: consumedKey } });
  if (existingFlag) return; // already consumed for this order

  const consumeMap = await computeConsumptionMapForOrder(tx, orderId);
  if (!consumeMap || consumeMap.size === 0) {
    // Nothing to consume
    await tx.pricing_settings.create({ data: { key: consumedKey, value: 1 } });
    return;
  }

  // Check availability
  const shortages = [];
  for (const [mid, need] of consumeMap.entries()) {
    const key = prepKey(mid);
    const row = await tx.pricing_settings.findUnique({ where: { key } });
    const have = Number(row?.value ?? 0);
    if (have < need) {
      shortages.push({ menu_item_id: mid, have, need });
    }
  }

  if (shortages.length > 0) {
    const names = await tx.menu_item.findMany({
      where: { menu_item_id: { in: shortages.map(s => s.menu_item_id) } },
      select: { menu_item_id: true, name: true },
    });
    const nameMap = new Map(names.map(n => [n.menu_item_id, n.name]));
    const msg = 'Insufficient prepared stock: ' + shortages.map(s => `${nameMap.get(s.menu_item_id) || '#'+s.menu_item_id} (have ${s.have}, need ${s.need})`).join(', ');
    const err = new Error(msg);
    err.__insufficientStock = true;
    throw err;
  }

  // Consume
  for (const [mid, need] of consumeMap.entries()) {
    await kvAdjustPrepared(mid, -need, tx);
  }
  await tx.pricing_settings.create({ data: { key: consumedKey, value: 1 } });
}

// Cook a batch: subtract inventory by recipe and increase KV prepared stock
app.post('/kitchen/stock/:menuItemId/cook', requireAuth, async (req, res) => {
  const menuItemId = parseInt(req.params.menuItemId, 10);
  const servings = Math.max(0, parseInt(req.body?.servings ?? '0', 10));
  if (!Number.isFinite(menuItemId) || servings <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid inputs' });
  }

  try {
    // Load recipe with inventory info
    const recipeRows = await prisma.recipe.findMany({
      where: { menu_item_id: menuItemId },
      include: {
        inventory: { select: { ingredient_id: true, current_quantity: true, servings_per_unit: true, name: true } },
      },
    });

    if (recipeRows.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipe configured for this item' });
    }

    // Compute integer units needed from each inventory item
    const consumption = recipeRows.map((r) => {
      const perServing = Number(r.qty_per_item);
      const spu = r.inventory.servings_per_unit || 1; // safe default
      const totalServings = servings * perServing; // servings equivalent
      const unitsNeeded = Math.ceil(totalServings / spu);
      return {
        ingredient_id: r.inventory.ingredient_id,
        name: r.inventory.name,
        unitsNeeded,
        current: r.inventory.current_quantity ?? 0,
      };
    });

    // Validate availability
    const insufficient = consumption.filter((c) => c.current < c.unitsNeeded);
    if (insufficient.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient inventory for batch',
        details: insufficient.map((c) => ({ ingredient_id: c.ingredient_id, name: c.name, have: c.current, need: c.unitsNeeded })),
      });
    }

    // Apply updates in a transaction
    await prisma.$transaction(async (tx) => {
      // Decrement inventory units
      for (const c of consumption) {
        await tx.inventory.update({
          where: { ingredient_id: c.ingredient_id },
          data: { current_quantity: { decrement: c.unitsNeeded } },
        });
      }

      // Increase KV prepared stock
      await kvAdjustPrepared(menuItemId, servings, tx);
    });

    const key = prepKey(menuItemId);
    const row = await prisma.pricing_settings.findUnique({ where: { key } });
    res.json({ success: true, stock: { menu_item_id: menuItemId, servings_available: Number(row?.value ?? 0) } });
  } catch (err) {
    console.error('Cook batch error:', err);
    res.status(500).json({ success: false, error: 'Failed to cook batch' });
  }
});

// Discard all remaining prepared stock (end-of-day)
app.post('/kitchen/stock/discard', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.pricing_settings.findMany({ where: { key: { startsWith: 'prep:mi:' } } });
    await prisma.$transaction(rows.map((r) => prisma.pricing_settings.update({ where: { key: r.key }, data: { value: 0 } })));
    res.json({ success: true });
  } catch (err) {
    console.error('Discard stock error:', err);
    res.status(500).json({ success: false, error: 'Failed to discard stock' });
  }
});

// Get current prepared stock snapshot
app.get('/kitchen/stock', requireAuth, async (req, res) => {
  try {
    const rows = await prisma.pricing_settings.findMany({ where: { key: { startsWith: 'prep:mi:' } }, orderBy: { key: 'asc' } });
    const ids = rows.map((r) => parseInt(r.key.split(':')[2], 10)).filter((n) => Number.isFinite(n));
    const items = await prisma.menu_item.findMany({ where: { menu_item_id: { in: ids } }, select: { menu_item_id: true, name: true, category_id: true } });
    const map = new Map(items.map((i) => [i.menu_item_id, i]));
    const stock = ids.map((id, idx) => ({
      menu_item_id: id,
      servings_available: Number(rows[idx].value),
      menu_item: map.get(id) || null,
    }));
    res.json({ success: true, stock });
  } catch (err) {
    console.error('Get stock error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch stock' });
  }
});

// --- EMPLOYEE ROUTES ---

// Get all employees
app.get('/api/employees', async (req, res) => {
  const employees = await prisma.employee.findMany();
  res.json(employees);
});

// Add Employee route
app.post("/api/employees", async (req, res) => {
  try {
    const { display_name, email, role } = req.body;

    if (!display_name || !role) {
      return res.status(400).json({ error: "Name and role are required" });
    }

    // Default password
    const defaultPassword = "password123";

    const newEmployee = await prisma.employee.create({
      data: {
        display_name,
        email,
        role,
        password_hash: defaultPassword, // store default password directly
        is_active: true
      }
    });

    res.json(newEmployee);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add employee" });
  }
});

// Update employee info
app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  const { display_name, email, role } = req.body;

  const updated = await prisma.employee.update({
    where: { employee_id: parseInt(id) },
    data: { display_name, email, role }
  });

  res.json(updated);
});

// Change employee role
app.put("/api/employees/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) return res.status(400).json({ error: "Role is required" });

    const updated = await prisma.employee.update({
      where: { employee_id: parseInt(id) },
      data: { role }
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

// Deactivate employee
app.put('/api/employees/:id/deactivate', async (req, res) => {
  const updated = await prisma.employee.update({
    where: { employee_id: parseInt(req.params.id) },
    data: { is_active: false }
  });
  res.json(updated);
});

// Reactivate employee
app.put('/api/employees/:id/reactivate', async (req, res) => {
  const updated = await prisma.employee.update({
    where: { employee_id: parseInt(req.params.id) },
    data: { is_active: true }
  });
  res.json(updated);
});

// Reset password for employee
app.put("/api/employees/:id/reset-password", async (req, res) => {
  const { id } = req.params;

  // Generate a simple random password
  const newPassword = Math.random().toString(36).slice(-8); // 8-char alphanumeric

  const updated = await prisma.employee.update({
    where: { employee_id: parseInt(id) },
    data: { password_hash: newPassword } // store as plain text
  });

  res.json({ newPassword });
});

// --- Shifts ---
// Create shift
app.post("/api/shifts", async (req, res) => {
  const { manager_id, shift_date, start_time, end_time } = req.body;

  if (!manager_id || !shift_date || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const shift = await prisma.shift_schedule.create({
      data: {
        manager_id: Number(manager_id), // ensure Int
        shift_date: new Date(shift_date),
        start_time: new Date(`1970-01-01T${start_time}:00`),
        end_time: new Date(`1970-01-01T${end_time}:00`),
      },
    });
    res.json(shift);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a shift
app.delete("/api/shifts/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Delete all assignments for this shift
    await prisma.shift_assignment.deleteMany({
      where: {
        shift_schedule: {
          schedule_id: Number(id)  // <- use relation filter
        }
      }
    });

    // Delete the shift itself
    await prisma.shift_schedule.delete({
      where: { schedule_id: Number(id) }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete shift" });
  }
});
// Assign employee to shift
app.post("/api/shifts/:id/assign", async (req, res) => {
  const { id } = req.params;
  const { employee_id } = req.body;

  if (!employee_id) {
    return res.status(400).json({ error: "Employee ID is required" });
  }

  try {
    // Fetch the employee role first
    const employee = await prisma.employee.findUnique({
      where: { employee_id: Number(employee_id) },
      select: { role: true },
    });

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // Create the shift assignment
    await prisma.shift_assignment.create({
      data: {
        role: employee.role,
        employee: {
          connect: { employee_id: Number(employee_id) } // connect to existing employee
        },
        shift_schedule: {
          connect: { schedule_id: Number(id) } // connect to existing shift
        }
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to assign employee" });
  }
});

// Remove employee from shift
app.post("/api/shifts/:id/remove", async (req, res) => {
  const { id } = req.params;
  const { employee_id } = req.body;

  if (!employee_id) {
    return res.status(400).json({ error: "Employee ID is required" });
  }

  try {
    await prisma.shift_assignment.deleteMany({
      where: {
        employee: {
          employee_id: Number(employee_id) // filter by related employee
        },
        shift_schedule: {
          schedule_id: Number(id) // filter by related shift
        }
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove employee" });
  }
});

// List shifts by date
app.get("/api/shifts/date/:date", async (req, res) => {
  const { date } = req.params;
  try {
    const shifts = await prisma.shift_schedule.findMany({
      where: { shift_date: new Date(date) },
      include: {
        shift_assignment: {
          include: { employee: true } // include employee info
        }
      },
      orderBy: { start_time: 'asc' }
    });

    // Format start/end times as HH:MM AM/PM
    const formattedShifts = shifts.map(s => {
      const formatTime = t => {
        const dateObj = new Date(t);
        let hours = dateObj.getHours();
        const minutes = dateObj.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
      };

      return {
        shift_id: s.schedule_id, // renamed for frontend
        start: formatTime(s.start_time),
        end: formatTime(s.end_time),
        shift_assignment: s.shift_assignment // pass the array of assignments with employee data
      };
    });

    res.json(formattedShifts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch shifts" });
  }
});

// List shifts for employee
app.get("/api/shifts/employee/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const shifts = await prisma.shiftAssignment.findMany({
      where: { employee_id: parseInt(id) },
      include: { shift: true }
    });

    // Map to a simple format for frontend
    const result = shifts.map(a => ({
      shift_id: a.shift.shift_id,
      date: a.shift.date,
      start_time: a.shift.start_time,
      end_time: a.shift.end_time,
      role: a.role
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- MENU ROUTES ---
app.post("/api/menu", async (req, res) => {
  try {
    const { menu_item_id, name, price, category_id, is_active } = req.body;

    const created = await prisma.menu_item.create({
      data: {
        menu_item_id: menu_item_id || undefined,
        name,
        price,
        category_id,
        is_active
      }
    });

    res.json(created);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET all menu items with category info
app.get("/api/menu", async (req, res) => {
  try {
    const items = await prisma.menu_item.findMany({
      include: { category: true },
      orderBy: { name: 'asc' }
    });
    res.json(items);
  } catch (err) {
    console.error("Failed to fetch menu items:", err);
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

// Get menu item by ID
app.get("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  const item = await prisma.menu_item.findUnique({ where: { menu_item_id: parseInt(id) } });
  if (!item) return res.status(404).json({ error: "Menu item not found" });
  res.json(item);
});

// Delete menu item
app.delete("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.menu_item.delete({ where: { menu_item_id: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get recipe for a menu item
app.get("/api/menu/:id/recipe", async (req, res) => {
  const { id } = req.params;
  const recipe = await prisma.recipe.findMany({
    where: { menu_item_id: parseInt(id) },
    select: { 
      ingredient_id: true, 
      qty_per_item: true, 
      qty_unit: true 
    }
  });
  res.json(recipe);
});

// Update recipe
app.put("/api/menu/:id/recipe", async (req, res) => {
  const { id } = req.params;
  const { ingredients } = req.body;

  try {
    // Delete existing recipe first
    await prisma.recipe.deleteMany({ where: { menu_item_id: parseInt(id) } });

    // Insert new recipe, defaulting qty_unit to "units" if missing
    const createData = ingredients.map(i => ({
      menu_item_id: parseInt(id),
      ingredient_id: i.ingredient_id,
      qty_per_item: i.qty_per_item,
      qty_unit: i.qty_unit || "units"
    }));

    await prisma.recipe.createMany({ data: createData });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update recipe" });
  }
});

// --- INVENTORY ROUTES ---
// GET all inventory items
app.get('/api/inventory', async (req, res) => {
  try {
    const items = await prisma.inventory.findMany({
      orderBy: { ingredient_id: 'asc' },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// POST add a new inventory item
app.post('/api/inventory', async (req, res) => {
  try {
    const {
      name,
      unit,
      current_quantity,
      cost_per_unit,
      servings_per_unit,
      par_level = 0,       // default if not provided
      reorder_point = 0,   // default if not provided
      is_active = true     // default if not provided
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !unit ||
      current_quantity == null ||
      cost_per_unit == null ||
      servings_per_unit == null
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const item = await prisma.inventory.create({
      data: {
        name,
        unit,
        current_quantity: Number(current_quantity),
        cost_per_unit: Number(cost_per_unit),
        servings_per_unit: Number(servings_per_unit),
        par_level: Number(par_level),
        reorder_point: Number(reorder_point),
        is_active: Boolean(is_active),
      },
    });

    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add inventory item' });
  }
});

// PUT update an inventory item by ID
app.put('/api/inventory/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { current_quantity, name, unit, cost_per_unit } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ingredient ID' });
    }

    const item = await prisma.inventory.update({
      where: { ingredient_id: id },
      data: {
        ...(current_quantity !== undefined && { current_quantity }),
        ...(name && { name }),
        ...(unit && { unit }),
        ...(cost_per_unit !== undefined && { cost_per_unit }),
      },
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// DELETE an inventory item by ID
app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ingredient ID' });

    // Check if the ingredient is referenced in any recipe
    const recipeRef = await prisma.recipe.findFirst({
      where: { ingredient_id: id }
    });

    if (recipeRef) {
      return res.status(400).json({
        error: `Cannot delete ingredient ID ${id} because it is used in a recipe`
      });
    }

    const deleted = await prisma.inventory.delete({
      where: { ingredient_id: id },
    });

    res.json({ message: `Deleted ingredient ID ${id}`, deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// ---------- REPORTS ----------

// Sales Report
app.get('/api/sales-report', async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: "Start and end dates are required" });
    }

    const stats = await prisma.store_statistics.findMany({
      where: {
        stats_date: {
          gte: new Date(start + "T00:00:00Z"),
          lte: new Date(end + "T23:59:59Z")
        }
      }
    });

    // Compute totals
    const totalOrders = stats.reduce((sum, s) => sum + (s.total_orders || 0), 0);
    const revenue = stats.reduce((sum, s) => sum + Number(s.revenue || 0), 0);

    res.json({ totalOrders, revenue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sales report' });
  }
});

// X Report
app.get("/api/x-report", async (req, res) => {
  try {
    // Select orders that are "done", same as Z report
    const orders = await prisma.order.findMany({
      where: { status: "done" }, // same filter as Z report
      include: { order_item: { include: { menu_item: true } } },
    });

    // Aggregate totals
    let totalOrders = orders.length;
    let totalRevenue = 0;
    const itemsMap = {};

    for (const order of orders) {
      for (const item of order.order_item) {
        const key = item.menu_item.name;
        const revenue = parseFloat(item.unit_price) * item.qty;
        totalRevenue += revenue;

        if (!itemsMap[key]) itemsMap[key] = { quantitySold: 0, revenue: 0 };
        itemsMap[key].quantitySold += item.qty;
        itemsMap[key].revenue += revenue;
      }
    }

    const items = Object.keys(itemsMap).map(name => ({
      name,
      ...itemsMap[name],
    }));

    res.json({
      totalOrders,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate X report" });
  }
});

//Z Report
app.get("/api/z-report", async (req, res) => {
  try {
    // Fetch all orders that haven't been included in a Z report yet
    const orders = await prisma.order.findMany({
      where: { status: "done" }, // maybe you want a "z_reported: false" flag in production
      include: { order_item: { include: { menu_item: true } } },
    });

    // Aggregate sales per menu item
    const salesMap = {};
    let totalOrders = 0;
    let totalRevenue = 0;

    for (const order of orders) {
      totalOrders += 1;
      for (const item of order.order_item) {
        const key = item.menu_item.name;
        const revenue = parseFloat(item.unit_price) * item.qty;
        totalRevenue += revenue;

        if (!salesMap[key]) {
          salesMap[key] = { name: key, quantitySold: 0, revenue: 0 };
        }
        salesMap[key].quantitySold += item.qty;
        salesMap[key].revenue += revenue;
      }
    }

    const items = Object.values(salesMap);

    // Mark these orders as "counted in Z report" by setting a timestamp field
    await prisma.order.updateMany({
      where: { order_id: { in: orders.map(o => o.order_id) } },
      data: { status: "queued" } // or add a boolean like z_reported = true in a real system
    });

    res.json({
      totalOrders,
      totalRevenue,
      items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate Z Report" });
  }
});


// Restock Report
app.get('/api/restock-report', async (req, res) => {
  const items = await prisma.inventory.findMany({
    where: { current_quantity: { lt: prisma.inventory.fields.reorder_point } }
  });
  res.json(items);
});

// Google Maps Weather API Endpoint
app.get('/api/weather', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_WEATHER_API;
    // Coordinates for College Station
    const lat = 30.6280;
    const lon = -96.3344;

    const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lon}&unitsSystem=IMPERIAL`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to fetch weather');
    }

    const conditions = data.weatherCondition;
    const temp = data.temperature;
    
    const iconUrl = conditions.iconBaseUri ? `${conditions.iconBaseUri}.png` : '';

    res.json({
      success: true,
      temp: Math.round(temp.degrees),
      desc: conditions.description?.text || 'Clear',
      icon: iconUrl
    });

  } catch (err) {
    console.error("Weather API Error:", err.message);
    // Fallback data in case API key is invalid/quota exceeded
    res.json({ 
      success: true, 
      temp: 999999, 
      desc: 'Error', 
      icon: 'https://maps.gstatic.com/weather/v1/sunny.png',
      isMock: true 
    });
  }
});

// Google Cloud Translation API Endpoint
app.post('/api/translate', async (req, res) => {
  const { text, target } = req.body;
  const apiKey = process.env.GOOGLE_TRANSLATION_API;

  if (!text || !target) return res.status(400).json({ error: 'Missing data' });

  try {
    // Ensure input is an array for consistent processing
    const inputs = Array.isArray(text) ? text : [text];

    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: inputs,
        target: target,
        format: 'text'
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // Return array of translated strings
    const translations = data.data.translations.map(t => t.translatedText);
    
    res.json({ 
      success: true, 
      translatedText: Array.isArray(text) ? translations : translations[0] 
    });
  } catch (err) {
    console.error("Translation API Error:", err.message);
    res.status(500).json({ success: false, error: 'Translation failed' });
  }
});

// ====================== CALL STAFF REAL-TIME NOTIFICATION ======================
const staffCallClients = new Set(); // holds all open cashier SSE connections

app.get('/api/call-staff/stream', (req, res) => {
  // SSE setup
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.flushHeaders();

  // Send a comment heartbeat every 15s so proxies don’t close it
  const heartbeat = setInterval(() => res.write(`:\n\n`), 15000);

  staffCallClients.add(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    staffCallClients.delete(res);
  });
});

app.post('/api/call-staff', (req, res) => {
  const message = JSON.stringify({
    timestamp: new Date().toISOString(),
    message: 'Customer at kiosk needs assistance!'
  });

  // Broadcast to every connected cashier screen
  staffCallClients.forEach(client => {
    client.write(`data: ${message}\n\n`);
  });

  res.json({ success: true });
});


// ---------- 5. TEST DB ----------
app.get("/test-db", async (req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW() as now`;
    res.json({ success: true, time: result[0].now });
  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ success: false, error: "Database connection failed" });
  }
});

// ---------- START ----------
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log("Login → /login (Google OAuth)");
});