const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const insightController = require('../controllers/insightController');
const targetController = require('../controllers/targetController'); 
const authMiddleware = require('../middleware/authMiddleware');
const emailController = require('../controllers/emailController');

// Route Login
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/forgot-password', authController.forgotPassword);

// Route Dashboard (Ambil Data)
router.get('/dashboard', authMiddleware, dashboardController.getDashboardData);

// Route AI (Backend yang mikir/predict)
// Frontend cukup panggil POST ini, tidak perlu kirim data apa-apa selain Token.
router.post('/predict', authMiddleware, insightController.generatePrediction);
router.post('/target', authMiddleware, targetController.setTarget);
router.post('/trigger-email', (req, res, next) => {
    if (req.query.secret !== 'hadsj334j4jh4hg343g88') { //password 
        return res.status(401).json({ error: 'Unauthorized Access' });
    }
    next();
router.post('/update-password', authMiddleware, authController.updatePassword);
}, emailController.sendWeeklyMotivation);

module.exports = router;