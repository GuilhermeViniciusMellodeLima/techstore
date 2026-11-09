
const pool = require('../config/database');

async function cadastrarEndereco(req, res) {
    try {
        const {
            cep,
            rua,
            numero,
            complemento,
            cidade,
            estado
        } = req.body;

        if (!cep || !rua || !numero || !cidade || !estado) {
            return res.status(400).json({
                erro: 'Preencha todos os campos obrigatórios.'
            });
        }

        const cepLimpo = String(cep).replace(/\D/g, '');

        if (cepLimpo.length !== 8) {
            return res.status(400).json({
                erro: 'Informe um CEP válido.'
            });
        }

        if (
            typeof estado !== 'string' ||
            !/^[A-Za-z]{2}$/.test(estado)
        ) {
            return res.status(400).json({
                erro: 'Informe uma sigla de estado válida.'
            });
        }

        const resultado = await pool.query(
            `INSERT INTO enderecos
            (usuario_id, cep, rua, numero, complemento, cidade, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                req.session.usuario.id,
                cepLimpo,
                rua.trim(),
                String(numero).trim(),
                complemento || null,
                cidade.trim(),
                estado.toUpperCase()
            ]
        );

        return res.status(201).json({
            mensagem: 'Endereço cadastrado com sucesso!',
            id: Number(resultado.insertId)
        });

    } catch (erro) {
        console.error('Erro ao cadastrar endereço:', erro.message);

        return res.status(500).json({
            erro: 'Não foi possível cadastrar o endereço.'
        });
    }
}

module.exports = {
    cadastrarEndereco
};
