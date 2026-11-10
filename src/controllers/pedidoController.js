
const pool = require('../config/database');
const crypto = require('crypto');

const UFS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
    'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

function validarEndereco(endereco) {
    if (!endereco || typeof endereco !== 'object') {
        return null;
    }

    const cep = String(endereco.cep || '').replace(/\D/g, '');
    const estado = String(endereco.estado || '').trim().toUpperCase();
    const cidade = String(endereco.cidade || '').trim();
    const rua = String(endereco.rua || '').trim();
    const numero = String(endereco.numero || '').trim();
    const complemento = String(endereco.complemento || '').trim();

    if (cep.length !== 8) return null;
    if (!UFS.includes(estado)) return null;
    if (!cidade || cidade.length > 100) return null;
    if (!rua || rua.length > 150) return null;
    if (!numero || numero.length > 20) return null;
    if (complemento.length > 100) return null;

    return {
        cep,
        estado,
        cidade,
        rua,
        numero,
        complemento: complemento || null
    };
}

async function criarPedido(req, res) {
    let conexao;

    try {
        const {
            endereco_id,
            endereco,
            itens,
            metodo,
            cartao_final
        } = req.body;

        let enderecoPedido;
        let enderecoId = null;

        // ID vazio significa que o endereço é temporário.
        const possuiEnderecoId =
            endereco_id !== undefined &&
            endereco_id !== null &&
            String(endereco_id).trim() !== '';

        if (possuiEnderecoId) {
            enderecoId = Number(endereco_id);

            if (!Number.isInteger(enderecoId) || enderecoId <= 0) {
                return res.status(400).json({
                    erro: 'Informe um endereço válido.'
                });
            }
        } else {
            enderecoPedido = validarEndereco(endereco);

            if (!enderecoPedido) {
                return res.status(400).json({
                    erro: 'Informe um endereço de entrega completo e válido.'
                });
            }
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

        let cartaoFinal = null;

        if (metodo === 'cartao_credito' || metodo === 'cartao_debito') {
            cartaoFinal = String(cartao_final || '');

            if (!/^\d{4}$/.test(cartaoFinal)) {
                return res.status(400).json({
                    erro: 'Informe os quatro últimos dígitos do cartão de teste.'
                });
            }
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

        // Busca o endereço no banco somente quando existe um ID.
        if (enderecoId !== null) {
            const enderecos = await conexao.query(
                `SELECT id, cep, estado, cidade, rua, numero, complemento
                 FROM enderecos
                 WHERE id = ? AND usuario_id = ?`,
                [enderecoId, req.session.usuario.id]
            );

            if (enderecos.length === 0) {
                await conexao.rollback();

                return res.status(404).json({
                    erro: 'Endereço não encontrado para este usuário.'
                });
            }

            const salvo = enderecos[0];

            enderecoPedido = {
                cep: salvo.cep,
                estado: salvo.estado,
                cidade: salvo.cidade,
                rua: salvo.rua,
                numero: salvo.numero,
                complemento: salvo.complemento
            };
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

            const precoCentavos = Math.round(Number(produto.preco) * 100);

            totalCentavos += precoCentavos * item.quantidade;

            produtosPedido.push({
                id: produto.id,
                nome: produto.nome,
                preco: produto.preco,
                quantidade: item.quantidade
            });
        }

        const valorTotal = (totalCentavos / 100).toFixed(2);

        // Guarda uma cópia do endereço no pedido, mesmo que seja temporário.
        const resultadoPedido = await conexao.query(
            `INSERT INTO pedidos
             (
                usuario_id,
                endereco_id,
                endereco_cep,
                endereco_rua,
                endereco_numero,
                endereco_complemento,
                endereco_cidade,
                endereco_estado,
                valor_total,
                status
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pago')`,
            [
                req.session.usuario.id,
                enderecoId,
                enderecoPedido.cep,
                enderecoPedido.rua,
                enderecoPedido.numero,
                enderecoPedido.complemento,
                enderecoPedido.cidade,
                enderecoPedido.estado,
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
            'SIM-' + crypto.randomUUID().toUpperCase();

        await conexao.query(
            `INSERT INTO pagamentos
             (pedido_id, metodo, status, valor, cartao_final, codigo_transacao)
             VALUES (?, ?, 'aprovado', ?, ?, ?)`,
            [
                pedidoId,
                metodo,
                valorTotal,
                cartaoFinal,
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
                pagamento_simulado: true,
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

async function consultarPedidos(req, res) {
    try {
        const usuarioId = req.session.usuario.id;

        const pedidos = await pool.query(
            `SELECT
                p.id,
                p.valor_total,
                p.status,
                p.criado_em,
                p.endereco_cep AS cep,
                p.endereco_rua AS rua,
                p.endereco_numero AS numero,
                p.endereco_complemento AS complemento,
                p.endereco_cidade AS cidade,
                p.endereco_estado AS estado
             FROM pedidos p
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
                    cartao_final,
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
