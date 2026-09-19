const express = require('express');
const router = express.Router();
const { list, getById, create, update, decide, remove } = require('../controllers/expenseController');
const { requireAuth, requireRole, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('expenses'));

router.get('/', list);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
// Only a manager or admin can approve/reject — that's the whole point of
// routing an expense through a senior for sign-off.
router.patch('/:id/decision', requireRole('admin', 'manager'), decide);
router.delete('/:id', remove);

module.exports = router;
