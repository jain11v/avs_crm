import axios from 'axios';

// Built from whatever host the page was actually loaded from (localhost,
// a LAN IP, ngrok, ...) rather than a fixed "localhost" — a hardcoded
// value would have every device that isn't the server itself trying to
// reach its own localhost:5000 instead of the real backend.
const api = axios.create({
  baseURL: `http://${window.location.hostname}:5000/api`,
  withCredentials: true, // sends and receives the httpOnly auth cookie
});

export default api;
