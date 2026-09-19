// Catches errors passed via next(err) from any route and returns a
// consistent JSON shape instead of leaking stack traces to the client.
function errorHandler(err, req, res, next) {
  console.error(err);

  const status = err.status || 500;
  const message = status === 500 ? 'Something went wrong on our end.' : err.message;

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
