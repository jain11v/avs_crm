const express = require('express');
const router = express.Router();
const { list, getById } = require('../controllers/transactionController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

// Read-only: transactions are only ever created by expenseController.decide
// when a senior approves an expense — there is no manual entry endpoint.
router.use(requireAuth);
router.use(requirePage('transactions'));

router.get('/', list);
router.get('/:id', getById);

module.exports = router;
