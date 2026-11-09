const express = require('express');
const router = express.Router();

const {
    consultarDashboard
} = require('../controllers/dashboardController');

const {
    verificarAdmin
} = require('../middlewares/authMiddleware');

// Dashboard exclusivo para administradores
router.get('/', verificarAdmin, consultarDashboard);

module.exports = router;
