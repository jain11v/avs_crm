const express = require('express');
const router = express.Router();
const { generate, list, update, pay, remove } = require('../controllers/payrollController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('payroll'));

router.get('/', list);
router.post('/generate', generate);
router.put('/:id', update);
router.patch('/:id/pay', pay);
router.delete('/:id', remove);

module.exports = router;
