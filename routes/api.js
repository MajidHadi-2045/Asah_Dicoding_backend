const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const insightController = require('../controllers/insightController'); 
const authMiddleware = require('../middleware/authMiddleware');

router.post('/login', authController.login);
router.get('/dashboard', authMiddleware, dashboardController.getDashboardData);
router.post('/insight', authMiddleware, insightController.saveInsight); 

module.exports = router;
