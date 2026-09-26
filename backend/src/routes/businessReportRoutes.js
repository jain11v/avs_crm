const express = require('express');
const router = express.Router();
const { list, download } = require('../controllers/businessReportsController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requirePage('reports'));
router.get('/', list);
router.get('/:key/download', download);

module.exports = router;
