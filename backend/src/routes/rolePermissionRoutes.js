const express = require('express');
const router = express.Router();
const { getMatrix, updateMatrix } = require('../controllers/rolePermissionController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/', getMatrix);
router.put('/', updateMatrix);

module.exports = router;
