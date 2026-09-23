const express = require('express');
const router = express.Router();
const { list, getByEmployee } = require('../controllers/employeeBalanceController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('employee_balances'));
router.get('/', list);
router.get('/:employeeId', getByEmployee);

module.exports = router;
