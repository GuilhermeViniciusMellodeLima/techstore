
const express = require('express');
const router = express.Router();

const {
    criarPedido,
    consultarPedidos
} = require('../controllers/pedidoController');

const {
    verificarAutenticacao
} = require('../middlewares/authMiddleware');

// Consultar histórico de compras
router.get('/', verificarAutenticacao, consultarPedidos);

// Realizar pedido
router.post('/', verificarAutenticacao, criarPedido);

module.exports = router;
