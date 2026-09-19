const express = require('express');
const router = express.Router();
const { listMine, list, create, updateStatus, markLost, remove } = require('../controllers/taskController');
const { requireAuth } = require('../middleware/authMiddleware');

// No requirePage gate — every employee needs to see their own tasks on
// their dashboard regardless of which pages their role has, and each
// action is permission-checked in the controller against the reporting
// relationship instead.
router.use(requireAuth);

router.get('/mine', listMine);
router.get('/', list);
router.post('/', create);
router.patch('/:id/status', updateStatus);
router.patch('/:id/lost', markLost);
router.delete('/:id', remove);

module.exports = router;
