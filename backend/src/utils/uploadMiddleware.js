const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Shared by documentRoutes and chatRoutes — both accept the same file
// types into the same uploads directory, just attached to different
// things (a customer/policy/employee/task vs a chat message).
function buildUploadMiddleware(uploadDir) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

  const multerUpload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return cb(new Error('UNSUPPORTED_TYPE'));
      }
      cb(null, true);
    },
  });

  return function handleUpload(req, res, next) {
    multerUpload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'That file is too large (max 15MB).' });
        }
        return res.status(400).json({ error: 'Could not read the uploaded file.' });
      }
      if (err && err.message === 'UNSUPPORTED_TYPE') {
        return res.status(400).json({ error: 'Only PDF, JPEG, PNG, or Word documents are supported.' });
      }
      if (err) return next(err);
      next();
    });
  };
}

module.exports = { buildUploadMiddleware };
