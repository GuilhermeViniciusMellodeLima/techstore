
const express = require('express');
const router = express.Router();

const {
    listarEntregas,
    atualizarEntrega
} = require('../controllers/entregaController');

const {
    verificarAdmin
} = require('../middlewares/authMiddleware');

// Consultar entregas: somente administradores
router.get('/', verificarAdmin, listarEntregas);

// Atualizar entrega: somente administradores
router.put('/:id', verificarAdmin, atualizarEntrega);

module.exports = router;
