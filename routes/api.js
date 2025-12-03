const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const insightController = require('../controllers/insightController'); 
const authMiddleware = require('../middleware/authMiddleware');

router.post('/login', authController.login);
router.get('/dashboard', authMiddleware, dashboardController.getDashboardData);

// GANTI ROUTE INI:
// Dari 'saveInsight' (Frontend setor data) -> Menjadi 'generatePrediction' (Backend mikir)
router.post('/predict', authMiddleware, insightController.generatePrediction); 

module.exports = router;