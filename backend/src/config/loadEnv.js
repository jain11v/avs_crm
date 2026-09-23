const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Single source of truth for which .env file this process loads, based on
// APP_ENV (development/test/production). Deliberately a separate variable
// from NODE_ENV — NODE_ENV already has an existing, narrower job
// (authController.js sets the auth cookie's `secure` flag from it, for
// real HTTPS deployments) that shouldn't change just because a script is
// pointed at the "production" *database*, which for now is still reached
// over plain http://localhost like the other two. Falls back to plain
// .env if the environment-specific file doesn't exist, so this is backward
// compatible with the single-.env setup this app used before dev/test/prod
// databases existed. Side-effecting on require, same as a bare
// `require('dotenv').config()` — safe to require from multiple entry
// points (app.js, db.js, server.js, one-off scripts) since dotenv never
// overrides an already-set process.env value.
const ROOT = path.resolve(__dirname, '..', '..');
const env = process.env.APP_ENV || 'development';
const envFile = path.join(ROOT, `.env.${env}`);
const target = fs.existsSync(envFile) ? envFile : path.join(ROOT, '.env');

dotenv.config({ path: target });
