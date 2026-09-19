const express = require('express');
const router = express.Router();
const { getAlerts } = require('../controllers/alertsController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.get('/', getAlerts);

module.exports = router;
