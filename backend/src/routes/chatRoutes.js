const express = require('express');
const router = express.Router();
const { list, send, download } = require('../controllers/chatController');
const { requireAuth } = require('../middleware/authMiddleware');
const { buildUploadMiddleware } = require('../utils/uploadMiddleware');
const { UPLOAD_DIR } = require('../controllers/documentController');

const handleUpload = buildUploadMiddleware(UPLOAD_DIR);

// No requirePage gate — this is a company-wide chat everyone should be
// able to use regardless of their role's page access, same reasoning as
// tasks.
router.use(requireAuth);

router.get('/messages', list);
router.post('/messages', handleUpload, send);
router.get('/messages/:id/download', download);

module.exports = router;
