const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const insightController = require('../controllers/insightController');
const targetController = require('../controllers/targetController'); 
const authMiddleware = require('../middleware/authMiddleware');

// Route Login
router.post('/login', authController.login);
router.post('/register', authController.register);

// Route Dashboard (Ambil Data)
router.get('/dashboard', authMiddleware, dashboardController.getDashboardData);

// Route AI (Backend yang mikir/predict)
// Frontend cukup panggil POST ini, tidak perlu kirim data apa-apa selain Token.
router.post('/predict', authMiddleware, insightController.generatePrediction);
router.post('/target', authMiddleware, targetController.setTarget); 

module.exports = router;