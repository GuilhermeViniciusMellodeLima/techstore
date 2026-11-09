const express = require('express');
const router = express.Router();

const { login, logout } = require('../controllers/authController');

const {
    verificarAutenticacao
} = require('../middlewares/authMiddleware');

router.post('/login', login);

router.get('/me', verificarAutenticacao, (req, res) => {
    res.json({
        usuario: req.session.usuario
    });
});

router.post('/logout', logout);

module.exports = router;
