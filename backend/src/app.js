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
// that, any origin on the Vite dev port IS ALSO REQUIRED to be a
// localhost/private-LAN hostname — checking the port alone would let any
// public site on port 5173 pass, and combined with credentials:true below
// (cookie-based auth) that's a CSRF hole, not just a convenience gap.
const explicitOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

function isPrivateHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // non-browser clients (curl, health checks)
      if (explicitOrigins.includes(origin)) return callback(null, true);
      try {
        const url = new URL(origin);
        if (url.port === '5173' && isPrivateHost(url.hostname)) return callback(null, true);
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
