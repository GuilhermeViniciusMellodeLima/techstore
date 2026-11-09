function verificarAutenticacao(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({
            erro: 'Você precisa estar autenticado.'
        });
    }

    next();
}

function verificarAdmin(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({
            erro: 'Você precisa estar autenticado.'
        });
    }

    if (req.session.usuario.perfil !== 'admin') {
        return res.status(403).json({
            erro: 'Acesso permitido somente para administradores.'
        });
    }

    next();
}

module.exports = {
    verificarAutenticacao,
    verificarAdmin
};
