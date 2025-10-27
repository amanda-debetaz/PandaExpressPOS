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

// Add process hook to shutdown pool
process.on('SIGINT', function() {
    pool.end();
    console.log('Application successfully shutdown');
    process.exit(0);
});

// Set EJS as view engine
app.set('view engine', 'ejs');

// Route to render index.ejs
app.get('/', (req, res) => {
    const data = { name: 'Mario' };
    res.render('index', data);
});

// Test database connection route
app.get('/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0].now });
    } catch (err) {
        console.error('Database error:', err.message);
        res.status(500).json({ success: false, error: 'Database connection failed' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log('Environment variables:', {
        user: process.env.PSQL_USER,
        host: process.env.PSQL_HOST,
        database: process.env.PSQL_DATABASE,
        port: process.env.PSQL_PORT
    });
});