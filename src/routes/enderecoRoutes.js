
const express = require('express');
const router = express.Router();

const {
    cadastrarEndereco
} = require('../controllers/enderecoController');

const {
    verificarAutenticacao
} = require('../middlewares/authMiddleware');

router.post('/', verificarAutenticacao, cadastrarEndereco);

module.exports = router;
