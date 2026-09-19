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
// Bound to 0.0.0.0 (see server.js), so this is reached from localhost,
// 127.0.0.1, and whatever LAN IP other devices use — the browser's Origin
// header carries that actual host, not "localhost", so a single fixed
// origin can't cover it. FRONTEND_URL (if set) is always allowed; beyond
// that, any origin on the Vite dev port is allowed, which covers every
// address this same frontend could be served from without opening CORS
// up to unrelated sites.
const explicitOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // non-browser clients (curl, health checks)
      if (explicitOrigins.includes(origin)) return callback(null, true);
      try {
        if (new URL(origin).port === '5173') return callback(null, true);
      } catch {
        // fall through to rejection below
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // required so the browser sends/receives the httpOnly cookie
  })
);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', routes);

// 404 for anything unmatched under /api
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use(errorHandler);

module.exports = app;
