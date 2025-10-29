const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load environment variables from postgres.env
dotenv.config({ path: './postgres.env' });

// Create express app
const app = express();
const port = 3000;

// Create PostgreSQL pool
const pool = new Pool({
    user: process.env.PSQL_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DATABASE,
    password: process.env.PSQL_PASSWORD,
    port: process.env.PSQL_PORT,
    ssl: { rejectUnauthorized: false }
});

// Graceful shutdown
process.on('SIGINT', function () {
    pool.end();
    console.log('Application successfully shutdown');
    process.exit(0);
});

// Set EJS as view engine
app.set('view engine', 'ejs');

// Serve static files (CSS, images, etc.)
app.use(express.static('public'));

// ---------------------------------------------------------------------
// 1. MENU FROM DATABASE
// ---------------------------------------------------------------------
app.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT menu_item_id, name, price, category_id
            FROM menu_item
            WHERE is_active = true
            ORDER BY name
        `);

        // Group items by the 4 UI categories
        const grouped = {
            entrees:    [], // category_id = 1  (Bowl, Plate, Bigger Plate)
            a_la_carte: [], // category_id = 3  (premium entrees)
            sides:      [], // category_id = 4  (rice, chow mein, super greens)
            appetizers: []  // category_id = 2  (egg rolls, rangoons)
        };

        result.rows.forEach(row => {
            const { name, price, category_id } = row;

            // Convert price from string → number
            const priceNum = parseFloat(price);

            if (category_id === 1) grouped.entrees.push({ name, price: priceNum });
            else if (category_id === 3) grouped.a_la_carte.push({ name, price: priceNum });
            else if (category_id === 4) grouped.sides.push({ name, price: priceNum });
            else if (category_id === 2) grouped.appetizers.push({ name, price: priceNum });
        });

        res.render('menu', { menu: grouped });

    } catch (err) {
        console.error('Menu query error:', err);
        res.status(500).send('Unable to load menu');
    }
});

// ---------------------------------------------------------------------
// 2. ORDER PAGE (unchanged – you can keep your own logic)
// ---------------------------------------------------------------------
app.get('/order', (req, res) => {
    const order = { items: [], total: 0 };
    // Pass the same grouped menu so the order page can use it if needed
    res.render('order', { order, menu: {} });
});

// ---------------------------------------------------------------------
// 3. SUMMARY PAGE (example – unchanged)
// ---------------------------------------------------------------------
app.get('/summary', (req, res) => {
    const order = {
        items: [{ name: 'Chicken (Premium)', price: 8 }, { name: 'Fries', price: 3 }],
        total: 11
    };
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
    console.log('Environment variables:', {
        user: process.env.PSQL_USER,
        host: process.env.PSQL_HOST,
        database: process.env.PSQL_DATABASE,
        port: process.env.PSQL_PORT
    });
});