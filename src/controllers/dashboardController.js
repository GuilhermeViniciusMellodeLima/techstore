const pool = require('../config/database');

async function consultarDashboard(req, res) {
    try {
        const [vendas] = await pool.query(`
            SELECT
                COALESCE(SUM(valor_total), 0) AS total_vendas
            FROM pedidos
            WHERE status IN ('pago', 'enviado', 'entregue')
        `);

        const [pedidos] = await pool.query(`
            SELECT
                COUNT(*) AS total_pedidos,
                SUM(status = 'pendente') AS pendentes,
                SUM(status = 'enviado') AS enviados,
                SUM(status = 'entregue') AS entregues
            FROM pedidos
        `);

        const [usuarios] = await pool.query(`
            SELECT COUNT(*) AS total_clientes
            FROM usuarios
            WHERE perfil = 'cliente'
        `);

        const [produtos] = await pool.query(`
            SELECT COUNT(*) AS total_produtos
            FROM produtos
            WHERE ativo = 1
        `);

        const [entregas] = await pool.query(`
            SELECT COUNT(*) AS entregas_pendentes
            FROM entregas
            WHERE status IN ('aguardando', 'preparando')
        `);

        const pedidosRecentes = await pool.query(`
            SELECT
                p.id,
                u.nome AS cliente,
                p.valor_total,
                p.status,
                p.criado_em
            FROM pedidos p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.criado_em DESC
            LIMIT 5
        `);

        return res.json({
            vendas: Number(vendas.total_vendas),
            pedidos: {
                total_pedidos: Number(pedidos.total_pedidos),
                pendentes: Number(pedidos.pendentes || 0),
                enviados: Number(pedidos.enviados || 0),
                entregues: Number(pedidos.entregues || 0)
            },
            clientes: Number(usuarios.total_clientes),
            produtos: Number(produtos.total_produtos),
            entregas_pendentes: Number(entregas.entregas_pendentes),
            pedidos_recentes: pedidosRecentes.map(pedido => ({
                ...pedido,
                id: Number(pedido.id),
                valor_total: Number(pedido.valor_total)
            }))
        });

    } catch (erro) {
        console.error('Erro ao consultar dashboard:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível carregar os dados do dashboard.'
        });
    }
}

module.exports = {
    consultarDashboard
};
