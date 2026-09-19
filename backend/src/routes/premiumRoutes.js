const express = require('express');
const router = express.Router();
const { listByPolicy } = require('../controllers/premiumController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/', listByPolicy);

module.exports = router;
