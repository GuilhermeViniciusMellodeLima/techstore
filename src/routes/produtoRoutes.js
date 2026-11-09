
const express = require('express');
const router = express.Router();

const {
    listarProdutos,
    buscarProduto,
    cadastrarProduto,
    atualizarProduto,
    desativarProduto
} = require('../controllers/produtoController');

const { verificarAdmin } = require('../middlewares/authMiddleware');

// Consultas públicas
router.get('/', listarProdutos);
router.get('/:id', buscarProduto);

// Operações exclusivas para administradores
router.post('/', verificarAdmin, cadastrarProduto);
router.put('/:id', verificarAdmin, atualizarProduto);
router.delete('/:id', verificarAdmin, desativarProduto);

module.exports = router;

