const express = require('express');
const router = express.Router();
const { list, getById, create } = require('../controllers/insurerPaymentController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.get('/', list);
router.get('/:id', getById);
router.post('/', create);

module.exports = router;
