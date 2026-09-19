const express = require('express');
const router = express.Router();
const { getByPolicy, decide } = require('../controllers/commissionController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/', getByPolicy);
router.patch('/:policyId/decision', requireRole('admin', 'manager'), decide);

module.exports = router;
