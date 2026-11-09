
const pool = require('../config/database');

// Listar todas as entregas
async function listarEntregas(req, res) {
    try {
        const entregas = await pool.query(
            `SELECT
                e.id,
                e.pedido_id,
                e.transportadora,
                e.codigo_rastreio,
                e.status,
                e.data_envio,
                e.data_entrega,
                p.usuario_id,
                p.valor_total,
                p.status AS status_pedido
             FROM entregas e
             INNER JOIN pedidos p ON e.pedido_id = p.id
             ORDER BY e.id DESC`
        );

        return res.json({
            total: entregas.length,
            entregas
        });

    } catch (erro) {
        console.error('Erro ao listar entregas:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível listar as entregas.'
        });
    }
}

// Atualizar uma entrega
async function atualizarEntrega(req, res) {
    let conexao;

    try {
        const { id } = req.params;

        const {
            transportadora,
            codigo_rastreio,
            status
        } = req.body;

        const statusPermitidos = [
            'aguardando',
            'preparando',
            'em_transito',
            'entregue'
        ];

        if (!statusPermitidos.includes(status)) {
            return res.status(400).json({
                erro: 'Status de entrega inválido.'
            });
        }

        if (
            transportadora !== undefined &&
            (typeof transportadora !== 'string' || transportadora.length > 100)
        ) {
            return res.status(400).json({
                erro: 'Nome da transportadora inválido.'
            });
        }

        if (
            codigo_rastreio !== undefined &&
            (typeof codigo_rastreio !== 'string' || codigo_rastreio.length > 100)
        ) {
            return res.status(400).json({
                erro: 'Código de rastreamento inválido.'
            });
        }

        conexao = await pool.getConnection();

        await conexao.beginTransaction();

        const entregas = await conexao.query(
            'SELECT id, pedido_id FROM entregas WHERE id = ? FOR UPDATE',
            [id]
        );

        if (entregas.length === 0) {
            await conexao.rollback();

            return res.status(404).json({
                erro: 'Entrega não encontrada.'
            });
        }

        const entrega = entregas[0];

        await conexao.query(
            `UPDATE entregas
             SET transportadora = ?,
                 codigo_rastreio = ?,
                 status = ?,
                 data_envio = CASE
                    WHEN ? IN ('em_transito', 'entregue')
                    THEN COALESCE(data_envio, NOW())
                    ELSE data_envio
                 END,
                 data_entrega = CASE
                    WHEN ? = 'entregue'
                    THEN COALESCE(data_entrega, NOW())
                    ELSE data_entrega
                 END
             WHERE id = ?`,
            [
                transportadora || null,
                codigo_rastreio || null,
                status,
                status,
                status,
                id
            ]
        );

        let statusPedido = 'pago';

        if (status === 'em_transito') {
            statusPedido = 'enviado';
        }

        if (status === 'entregue') {
            statusPedido = 'entregue';
        }

        await conexao.query(
            'UPDATE pedidos SET status = ? WHERE id = ?',
            [statusPedido, entrega.pedido_id]
        );

        await conexao.commit();

        return res.json({
            mensagem: 'Entrega atualizada com sucesso!',
            entrega: {
                id: Number(id),
                pedido_id: entrega.pedido_id,
                status,
                status_pedido: statusPedido
            }
        });

    } catch (erro) {
        if (conexao) {
            await conexao.rollback();
        }

        console.error('Erro ao atualizar entrega:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível atualizar a entrega.'
        });

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
}

module.exports = {
    listarEntregas,
    atualizarEntrega
};
