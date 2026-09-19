const express = require('express');
const router = express.Router();
const { list } = require('../controllers/auditLogController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('audit_log'));

router.get('/', list);

module.exports = router;
