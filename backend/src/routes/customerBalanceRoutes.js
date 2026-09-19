const express = require('express');
const router = express.Router();
const { list, getByCustomer, exportCsv } = require('../controllers/customerBalanceController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('customer_balances'));
router.get('/', list);
router.get('/export.csv', exportCsv);
router.get('/:customerId', getByCustomer);

module.exports = router;
