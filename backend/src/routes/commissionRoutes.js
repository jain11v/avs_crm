const express = require('express');
const router = express.Router();
const { getByPolicy, decide } = require('../controllers/commissionController');
const { requireAuth, requireElevated } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/', getByPolicy);
router.patch('/:policyId/decision', requireElevated, decide);

module.exports = router;
