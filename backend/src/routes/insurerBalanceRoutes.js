const express = require('express');
const router = express.Router();
const { list, getByInsurer } = require('../controllers/insurerBalanceController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('insurer_balances'));
router.get('/', list);
router.get('/:insurerId', getByInsurer);

module.exports = router;
