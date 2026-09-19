const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  list, exportCsv, markReceived, removeReceipt,
  parseStatement, matchStatement, importStatement, listStatements,
} = require('../controllers/commissionReconciliationController');
const { requireAuth, requirePage } = require('../middleware/authMiddleware');

// Memory storage — the file is only ever parsed in-process, never written
// to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function handleStatementUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'That file is too large (max 10MB).' });
      }
      return res.status(400).json({ error: 'Could not read the uploaded file.' });
    }
    if (err) return next(err);
    next();
  });
}

router.use(requireAuth);
router.use(requirePage('commission_reconciliation'));

router.get('/', list);
router.get('/export.csv', exportCsv);
router.get('/statements', listStatements);
router.post('/statements/parse', handleStatementUpload, parseStatement);
router.post('/statements/match', matchStatement);
router.post('/statements/import', importStatement);
router.post('/:policyId/receipt', markReceived);
router.delete('/:policyId/receipt', removeReceipt);

module.exports = router;
