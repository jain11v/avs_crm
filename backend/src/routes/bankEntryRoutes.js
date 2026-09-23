const express = require('express');
const router = express.Router();
const { list, getById, create } = require('../controllers/bankEntryController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('bank_entries'));

router.get('/', list);
router.get('/:id', getById);
router.post('/', create);

module.exports = router;
