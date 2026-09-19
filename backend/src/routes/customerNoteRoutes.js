const express = require('express');
const router = express.Router();
const { list, create, setFollowUpDone, remove } = require('../controllers/customerNoteController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('customers'));

router.get('/', list);
router.post('/', create);
router.patch('/:id/done', setFollowUpDone);
router.delete('/:id', remove);

module.exports = router;
