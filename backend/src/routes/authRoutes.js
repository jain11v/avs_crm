const express = require('express');
const router = express.Router();
const { login, logout, me, getProfile, updateProfile, changePassword } = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.get('/profile', requireAuth, getProfile);
router.put('/profile', requireAuth, updateProfile);
router.patch('/password', requireAuth, changePassword);

module.exports = router;
