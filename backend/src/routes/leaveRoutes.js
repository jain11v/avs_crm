const express = require('express');
const router = express.Router();
const { create, list, decide, remove, getBalance } = require('../controllers/leaveController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('leave'));

router.get('/balance', getBalance);
router.get('/', list);
router.post('/', create);
router.patch('/:id/decision', decide);
router.delete('/:id', remove);

module.exports = router;
