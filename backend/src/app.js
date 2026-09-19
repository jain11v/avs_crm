const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
require('dotenv').config();

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true, // required so the browser sends/receives the httpOnly cookie
  })
);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', routes);

// 404 for anything unmatched under /api
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use(errorHandler);

module.exports = app;
