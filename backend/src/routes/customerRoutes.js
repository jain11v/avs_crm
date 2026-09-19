const express = require('express');
const router = express.Router();
const { list, getById, create, update, setStatus, remove, checkDuplicate } = require('../controllers/customerController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/', list);
router.get('/check-duplicate', checkDuplicate);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.patch('/:id/status', setStatus);
router.delete('/:id', remove);

module.exports = router;
