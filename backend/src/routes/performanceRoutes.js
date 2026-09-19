const express = require('express');
const router = express.Router();
const { list } = require('../controllers/performanceController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('performance'));

router.get('/', list);

module.exports = router;
