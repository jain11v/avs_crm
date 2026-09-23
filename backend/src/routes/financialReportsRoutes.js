const express = require('express');
const router = express.Router();
const { getSummary } = require('../controllers/financialReportsController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('financial_reports'));

router.get('/summary', getSummary);

module.exports = router;
