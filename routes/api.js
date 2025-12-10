const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const insightController = require('../controllers/insightController');
const targetController = require('../controllers/targetController'); 
const authMiddleware = require('../middleware/authMiddleware');
const emailController = require('../controllers/emailController');

// === 1. PUBLIC ROUTES (Tanpa Login) ===
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/forgot-password', authController.forgotPassword);

// === 2. PROTECTED ROUTES (Butuh Token) ===
// Route Update Password (HARUS DIPISAH DI SINI)
router.post('/update-password', authMiddleware, authController.updatePassword); 

// Route Dashboard
router.get('/dashboard', authMiddleware, dashboardController.getDashboardData);

// Route AI & Target
router.post('/predict', authMiddleware, insightController.generatePrediction);
router.post('/target', authMiddleware, targetController.setTarget);

// === 3. SYSTEM ROUTES (Cron Job / Trigger Manual) ===
router.post('/trigger-email', (req, res, next) => {
    // Middleware Pengaman Sederhana
    if (req.query.secret !== 'hadsj334j4jh4hg343g88') { 
        return res.status(401).json({ error: 'Unauthorized Access' });
    }
    next();
}, emailController.sendWeeklyMotivation);

module.exports = router;