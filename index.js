// index.js  (copy-paste this whole file)
const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: './postgres.env' });

const app = express();
const port = process.env.PORT || 3000;

// ---------- PostgreSQL pool ----------
const pool = new Pool({
    user: process.env.PSQL_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DATABASE,
    password: process.env.PSQL_PASSWORD,
    port: process.env.PSQL_PORT,
    ssl: { rejectUnauthorized: false }
});

// ---------- Graceful shutdown ----------
process.on('SIGINT', () => {
    pool.end();
    console.log('Application shutdown');
    process.exit(0);
});

// ---------- View engine & static ----------
app.set('view engine', 'ejs');
app.use(express.static('public'));

// ---------------------------------------------------------------------
// 1. MENU PAGE – loads from DB and caches for /summary
// ---------------------------------------------------------------------
let menuCache = { entrees: [], a_la_carte: [], sides: [], appetizers: [] };

app.get('/', async (req, res) => {
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

        menuCache = grouped;                 // cache for /summary
        res.render('menu', { menu: grouped });

    } catch (err) {
        console.error('Menu query error:', err);
        res.status(500).send('Unable to load menu');
    }
});

// ---------------------------------------------------------------------
// 2. ORDER PAGE – **PUT THIS EXACT BLOCK HERE**
// ---------------------------------------------------------------------
app.get('/order', async (req, res) => {
    let menu = { entrees: [], sides: [] };

    try {
        const result = await pool.query(`
            SELECT name, price, category_id
            FROM menu_item
            WHERE is_active = true
            ORDER BY name
        `);

        result.rows.forEach(row => {
            const price = parseFloat(row.price);
            if (row.category_id === 1) menu.entrees.push({ name: row.name, price });
            else if (row.category_id === 4) menu.sides.push({ name: row.name, price });
        });

    } catch (err) {
        console.error('DB error in /order:', err);
        return res.status(500).send('Database error');
    }

    // THIS LINE IS CRITICAL – pass the menu object
    res.render('order', { menu });
});

// ---------------------------------------------------------------------
// 3. SUMMARY PAGE – uses the cached menu
// ---------------------------------------------------------------------
app.get('/summary', (req, res) => {
    const { entree, side } = req.query;

    const find = (arr, name) => arr.find(i => i.name === name) || null;
    const selEntree = entree ? find(menuCache.entrees, entree) : null;
    const selSide   = side   ? find(menuCache.sides,   side)   : null;

    const items = [];
    let total = 0;

    if (selEntree) { items.push(selEntree); total += selEntree.price; }
    if (selSide)   { items.push(selSide);   total += selSide.price;   }

    const order = { items, total: total.toFixed(2) };
    res.render('summary', { order });
});

// ---------------------------------------------------------------------
// 4. TEST DB CONNECTION
// ---------------------------------------------------------------------
app.get('/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0].now });
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ success: false, error: 'Database connection failed' });
    }
});

// ---------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log('Env vars:', {
        user: process.env.PSQL_USER,
        host: process.env.PSQL_HOST,
        database: process.env.PSQL_DATABASE,
        port: process.env.PSQL_PORT
    });
});