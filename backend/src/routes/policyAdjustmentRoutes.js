const express = require('express');
const router = express.Router();
const { list, getById, create, update, decide, remove } = require('../controllers/policyAdjustmentController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.get('/', list);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.patch('/:id/decision', requireRole('admin', 'manager'), decide);
router.delete('/:id', remove);

module.exports = router;
