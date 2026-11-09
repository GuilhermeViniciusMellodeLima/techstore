
const pool = require('../config/database');
const crypto = require('crypto');

// Criar pedido
async function criarPedido(req, res) {
    let conexao;

    try {
        const { endereco_id, itens, metodo } = req.body;

        if (!Number.isInteger(Number(endereco_id)) || Number(endereco_id) <= 0) {
            return res.status(400).json({
                erro: 'Informe um endereço válido.'
            });
        }

        if (!Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({
                erro: 'Adicione pelo menos um produto ao pedido.'
            });
        }

        if (itens.length > 20) {
            return res.status(400).json({
                erro: 'O pedido pode conter no máximo 20 produtos diferentes.'
            });
        }

        const metodosPermitidos = [
            'pix',
            'cartao_credito',
            'cartao_debito'
        ];

        if (!metodosPermitidos.includes(metodo)) {
            return res.status(400).json({
                erro: 'Método de pagamento inválido.'
            });
        }

        const produtosIds = new Set();

        for (const item of itens) {
            if (
                !Number.isInteger(item.produto_id) ||
                item.produto_id <= 0 ||
                !Number.isInteger(item.quantidade) ||
                item.quantidade <= 0
            ) {
                return res.status(400).json({
                    erro: 'Produto ou quantidade inválida.'
                });
            }

            if (produtosIds.has(item.produto_id)) {
                return res.status(400).json({
                    erro: 'Não repita o mesmo produto no pedido.'
                });
            }

            produtosIds.add(item.produto_id);
        }

        conexao = await pool.getConnection();

        await conexao.beginTransaction();

        const enderecos = await conexao.query(
            `SELECT id FROM enderecos
             WHERE id = ? AND usuario_id = ?`,
            [Number(endereco_id), req.session.usuario.id]
        );

        if (enderecos.length === 0) {
            await conexao.rollback();

            return res.status(404).json({
                erro: 'Endereço não encontrado para este usuário.'
            });
        }

        let totalCentavos = 0;
        const produtosPedido = [];

        for (const item of itens) {
            const produtos = await conexao.query(
                `SELECT id, nome, preco, estoque, ativo
                 FROM produtos
                 WHERE id = ?
                 FOR UPDATE`,
                [item.produto_id]
            );

            if (
                produtos.length === 0 ||
                Number(produtos[0].ativo) !== 1
            ) {
                await conexao.rollback();

                return res.status(404).json({
                    erro: `Produto ${item.produto_id} não encontrado ou indisponível.`
                });
            }

            const produto = produtos[0];

            if (Number(produto.estoque) < item.quantidade) {
                await conexao.rollback();

                return res.status(400).json({
                    erro: `Estoque insuficiente para o produto ${produto.nome}.`
                });
            }

            const precoCentavos = Math.round(
                Number(produto.preco) * 100
            );

            totalCentavos += precoCentavos * item.quantidade;

            produtosPedido.push({
                id: produto.id,
                nome: produto.nome,
                preco: produto.preco,
                quantidade: item.quantidade
            });
        }

        const valorTotal = (totalCentavos / 100).toFixed(2);

        const resultadoPedido = await conexao.query(
            `INSERT INTO pedidos
             (usuario_id, endereco_id, valor_total, status)
             VALUES (?, ?, ?, 'pago')`,
            [
                req.session.usuario.id,
                Number(endereco_id),
                valorTotal
            ]
        );

        const pedidoId = Number(resultadoPedido.insertId);

        for (const produto of produtosPedido) {
            await conexao.query(
                `INSERT INTO itens_pedido
                 (pedido_id, produto_id, quantidade, preco_unitario)
                 VALUES (?, ?, ?, ?)`,
                [
                    pedidoId,
                    produto.id,
                    produto.quantidade,
                    produto.preco
                ]
            );

            const atualizacao = await conexao.query(
                `UPDATE produtos
                 SET estoque = estoque - ?
                 WHERE id = ? AND estoque >= ? AND ativo = 1`,
                [
                    produto.quantidade,
                    produto.id,
                    produto.quantidade
                ]
            );

            if (atualizacao.affectedRows === 0) {
                throw new Error('Não foi possível atualizar o estoque.');
            }
        }

        const codigoTransacao =
            'TXN-' + crypto.randomUUID().toUpperCase();

        await conexao.query(
            `INSERT INTO pagamentos
             (pedido_id, metodo, status, valor, codigo_transacao)
             VALUES (?, ?, 'aprovado', ?, ?)`,
            [
                pedidoId,
                metodo,
                valorTotal,
                codigoTransacao
            ]
        );

        await conexao.query(
            `INSERT INTO entregas
             (pedido_id, status)
             VALUES (?, 'aguardando')`,
            [pedidoId]
        );

        await conexao.commit();

        return res.status(201).json({
            mensagem: 'Pedido realizado com sucesso!',
            pedido: {
                id: pedidoId,
                valor_total: valorTotal,
                status: 'pago',
                metodo_pagamento: metodo,
                codigo_transacao: codigoTransacao,
                produtos: produtosPedido
            }
        });

    } catch (erro) {
        if (conexao) {
            await conexao.rollback();
        }

        console.error('Erro ao criar pedido:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível realizar o pedido.'
        });

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
}

// Consultar histórico de pedidos do usuário
async function consultarPedidos(req, res) {
    try {
        const usuarioId = req.session.usuario.id;

        const pedidos = await pool.query(
            `SELECT
                p.id,
                p.valor_total,
                p.status,
                p.criado_em,
                e.cep,
                e.rua,
                e.numero,
                e.cidade,
                e.estado
             FROM pedidos p
             INNER JOIN enderecos e ON p.endereco_id = e.id
             WHERE p.usuario_id = ?
             ORDER BY p.criado_em DESC`,
            [usuarioId]
        );

        for (const pedido of pedidos) {
            pedido.itens = await pool.query(
                `SELECT
                    ip.produto_id,
                    pr.nome AS produto,
                    ip.quantidade,
                    ip.preco_unitario
                 FROM itens_pedido ip
                 INNER JOIN produtos pr ON ip.produto_id = pr.id
                 WHERE ip.pedido_id = ?`,
                [pedido.id]
            );

            const pagamentos = await pool.query(
                `SELECT
                    metodo,
                    status,
                    valor,
                    codigo_transacao,
                    criado_em
                 FROM pagamentos
                 WHERE pedido_id = ?`,
                [pedido.id]
            );

            pedido.pagamento = pagamentos[0] || null;

            const entregas = await pool.query(
                `SELECT
                    transportadora,
                    codigo_rastreio,
                    status,
                    data_envio,
                    data_entrega
                 FROM entregas
                 WHERE pedido_id = ?`,
                [pedido.id]
            );

            pedido.entrega = entregas[0] || null;
        }

        return res.json({
            total_pedidos: pedidos.length,
            pedidos
        });

    } catch (erro) {
        console.error('Erro ao consultar pedidos:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível consultar o histórico de pedidos.'
        });
    }
}

module.exports = {
    criarPedido,
    consultarPedidos
};
