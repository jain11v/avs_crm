const express = require('express');
const router = express.Router();
const { list, upload, download, remove, loadPermissions, UPLOAD_DIR } = require('../controllers/documentController');
const { requireAuth } = require('../middleware/authMiddleware');
const { buildUploadMiddleware } = require('../utils/uploadMiddleware');

const handleUpload = buildUploadMiddleware(UPLOAD_DIR);

router.use(requireAuth);
router.use(loadPermissions);

router.get('/', list);
router.post('/', handleUpload, upload);
router.get('/:id/download', download);
router.delete('/:id', remove);

module.exports = router;
