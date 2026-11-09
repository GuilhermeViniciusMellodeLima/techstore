
const pool = require('../config/database');

// Listar produtos ativos
async function listarProdutos(req, res) {
    try {
        const produtos = await pool.query(
            'SELECT * FROM produtos WHERE ativo = 1 ORDER BY id DESC'
        );

        return res.json(produtos);

    } catch (erro) {
        console.error('Erro ao listar produtos:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível listar os produtos.'
        });
    }
}

// Consultar um produto pelo ID
async function buscarProduto(req, res) {
    try {
        const { id } = req.params;

        const produtos = await pool.query(
            'SELECT * FROM produtos WHERE id = ? AND ativo = 1',
            [id]
        );

        if (produtos.length === 0) {
            return res.status(404).json({
                erro: 'Produto não encontrado.'
            });
        }

        return res.json(produtos[0]);

    } catch (erro) {
        console.error('Erro ao buscar produto:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível consultar o produto.'
        });
    }
}

// Cadastrar produto
async function cadastrarProduto(req, res) {
    try {
        const { nome, descricao, preco, estoque } = req.body;

        const valor = Number(preco);
        const quantidade = Number(estoque);

        if (
            typeof nome !== 'string' ||
            !nome.trim() ||
            !Number.isFinite(valor) ||
            valor <= 0 ||
            !Number.isInteger(quantidade) ||
            quantidade < 0
        ) {
            return res.status(400).json({
                erro: 'Informe nome, preço válido e estoque inteiro não negativo.'
            });
        }

        const resultado = await pool.query(
            `INSERT INTO produtos
            (nome, descricao, preco, estoque, ativo)
            VALUES (?, ?, ?, ?, 1)`,
            [
                nome.trim(),
                descricao || '',
                valor,
                quantidade
            ]
        );

        return res.status(201).json({
            mensagem: 'Produto cadastrado com sucesso!',
            id: Number(resultado.insertId)
        });

    } catch (erro) {
        console.error('Erro ao cadastrar produto:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível cadastrar o produto.'
        });
    }
}

// Atualizar produto
async function atualizarProduto(req, res) {
    try {
        const { id } = req.params;
        const { nome, descricao, preco, estoque } = req.body;

        const valor = Number(preco);
        const quantidade = Number(estoque);

        if (
            typeof nome !== 'string' ||
            !nome.trim() ||
            !Number.isFinite(valor) ||
            valor <= 0 ||
            !Number.isInteger(quantidade) ||
            quantidade < 0
        ) {
            return res.status(400).json({
                erro: 'Informe nome, preço válido e estoque inteiro não negativo.'
            });
        }

        const resultado = await pool.query(
            `UPDATE produtos
            SET nome = ?, descricao = ?, preco = ?, estoque = ?
            WHERE id = ? AND ativo = 1`,
            [
                nome.trim(),
                descricao || '',
                valor,
                quantidade,
                id
            ]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                erro: 'Produto não encontrado.'
            });
        }

        return res.json({
            mensagem: 'Produto atualizado com sucesso!'
        });

    } catch (erro) {
        console.error('Erro ao atualizar produto:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível atualizar o produto.'
        });
    }
}

// Desativar produto sem apagar seu histórico
async function desativarProduto(req, res) {
    try {
        const { id } = req.params;

        const resultado = await pool.query(
            'UPDATE produtos SET ativo = 0 WHERE id = ? AND ativo = 1',
            [id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                erro: 'Produto não encontrado.'
            });
        }

        return res.json({
            mensagem: 'Produto desativado com sucesso!'
        });

    } catch (erro) {
        console.error('Erro ao desativar produto:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível desativar o produto.'
        });
    }
}

module.exports = {
    listarProdutos,
    buscarProduto,
    cadastrarProduto,
    atualizarProduto,
    desativarProduto
};
