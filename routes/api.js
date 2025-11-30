const express = require('express');
const router = express.Router();

// Import Controller & Middleware
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/authMiddleware');

// ==============================
// 1. PUBLIC ROUTES (Tanpa Login)
// ==============================
router.post('/login', authController.login);

// ==============================
// 2. PROTECTED ROUTES (Butuh Login)
// ==============================
// Semua route di bawah ini akan dicek dulu oleh authMiddleware

router.get('/dashboard', authMiddleware, dashboardController.getDashboardData);

// Contoh kalau nanti ada route lain:
// router.post('/target', authMiddleware, targetController.setTarget);

module.exports = router;