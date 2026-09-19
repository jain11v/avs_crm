const express = require('express');
const router = express.Router();
const { list, getById, create, update, setStatus, remove } = require('../controllers/departmentController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('departments'));

router.get('/', list);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.patch('/:id/status', setStatus);
router.delete('/:id', remove);

module.exports = router;
