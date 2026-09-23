const express = require('express');
const router = express.Router();
const { getToday, checkIn, checkOut, mark, list, summary, roster, update } = require('../controllers/attendanceController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('attendance'));

router.get('/today', getToday);
router.get('/summary', summary);
router.get('/roster', roster);
router.get('/', list);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.post('/mark', mark);
router.put('/:id', update);

module.exports = router;
