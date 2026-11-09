
const pool = require('../config/database');
const bcrypt = require('bcrypt');

async function login(req, res) {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({
                erro: 'Informe o e-mail e a senha.'
            });
        }

        // Procurar usuário pelo e-mail
        const usuarios = await pool.query(
            'SELECT * FROM usuarios WHERE email = ?',
            [email.trim().toLowerCase()]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({
                erro: 'E-mail ou senha incorretos.'
            });
        }

        const usuario = usuarios[0];

        // Comparar senha com o hash armazenado
        const senhaCorreta = await bcrypt.compare(
            senha,
            usuario.senha_hash
        );

        if (!senhaCorreta) {
            return res.status(401).json({
                erro: 'E-mail ou senha incorretos.'
            });
        }

        // Renovar a sessão para evitar fixação de sessão
        req.session.regenerate((erro) => {
            if (erro) {
                return res.status(500).json({
                    erro: 'Não foi possível iniciar a sessão.'
                });
            }

            req.session.usuario = {
                id: usuario.id,
                nome: usuario.nome,
                perfil: usuario.perfil
            };

            return res.status(200).json({
                mensagem: 'Login realizado com sucesso!',
                usuario: req.session.usuario
            });
        });

    } catch (erro) {
        console.error('Erro no login:', erro.message);

        return res.status(500).json({
            erro: 'Erro interno ao realizar login.'
        });
    }
}

// Encerrar sessão do usuário
async function logout(req, res) {
    req.session.destroy((erro) => {
        if (erro) {
            return res.status(500).json({
                erro: 'Não foi possível encerrar a sessão.'
            });
        }

        res.clearCookie('connect.sid', {
            httpOnly: true,
            sameSite: 'lax',
            secure: false
        });

        return res.json({
            mensagem: 'Logout realizado com sucesso!'
        });
    });
}

module.exports = {
    login,
    logout
};
