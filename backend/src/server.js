const app = require('./app');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`API server running on http://${HOST}:${PORT} (reachable at http://localhost:${PORT} and any LAN address)`);
});
