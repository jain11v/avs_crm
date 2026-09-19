const express = require('express');
const router = express.Router();
const { list, getById, create, update, remove, getFinance, getRenewalsDue } = require('../controllers/policyController');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/', list);
router.get('/renewals-due', getRenewalsDue);
router.get('/:id/finance', getFinance);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

module.exports = router;
