const express = require('express');
const router = express.Router();
const { list, getById, create, update, setStatus, remove, setCredentials } = require('../controllers/employeeController');
const { requireAuth, requireRole, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('employees'));

router.get('/', list);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.patch('/:id/status', setStatus);
// Admin-only regardless of page permission — this is what turns an
// employee record into a login ("create user") or changes their role.
router.patch('/:id/credentials', requireRole('admin'), setCredentials);
router.delete('/:id', remove);

module.exports = router;
