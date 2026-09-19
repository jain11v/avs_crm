const express = require('express');
const router = express.Router();
const { list, getById, create, update, remove } = require('../controllers/branchController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('branches'));

router.get('/', list);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

module.exports = router;
