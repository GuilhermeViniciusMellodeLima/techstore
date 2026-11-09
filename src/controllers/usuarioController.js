const pool = require('../config/database');
const bcrypt = require('bcrypt');

async function cadastrarUsuario(req, res) {
    try {
        const { nome, cpf, email, telefone, senha } = req.body;

        // Verificar campos obrigatórios
        if (!nome || !cpf || !email || !telefone || !senha) {
            return res.status(400).json({
                erro: 'Todos os campos são obrigatórios.'
            });
        }

        // Validar CPF
        const cpfLimpo = cpf.replace(/\D/g, '');

        if (cpfLimpo.length !== 11) {
            return res.status(400).json({
                erro: 'CPF inválido.'
            });
        }

        // Validar e-mail
        const emailNormalizado = email.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
            return res.status(400).json({
                erro: 'E-mail inválido.'
            });
        }

        // Validar senha
        if (senha.length < 8) {
            return res.status(400).json({
                erro: 'A senha deve ter pelo menos 8 caracteres.'
            });
        }

        // Gerar hash da senha
        const senhaHash = await bcrypt.hash(senha, 12);

        // Salvar usuário no banco
        await pool.query(
            `INSERT INTO usuarios
            (nome, cpf, email, telefone, senha_hash)
            VALUES (?, ?, ?, ?, ?)`,
            [
                nome.trim(),
                cpfLimpo,
                emailNormalizado,
                telefone.trim(),
                senhaHash
            ]
        );

        return res.status(201).json({
            mensagem: 'Usuário cadastrado com sucesso!'
        });

    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                erro: 'CPF ou e-mail já cadastrado.'
            });
        }

        console.error('Erro no cadastro:', erro.message);

        return res.status(500).json({
            erro: 'Erro interno ao cadastrar usuário.'
        });
    }
}

module.exports = { cadastrarUsuario };
