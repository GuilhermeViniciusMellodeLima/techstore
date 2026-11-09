
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');

const usuarioRoutes = require('./routes/usuarioRoutes');
const authRoutes = require('./routes/authRoutes');
const produtoRoutes = require('./routes/produtoRoutes');
const enderecoRoutes = require('./routes/enderecoRoutes');
const pedidoRoutes = require('./routes/pedidoRoutes');
const entregaRoutes = require('./routes/entregaRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();

// Proteções HTTP
app.use(helmet());

// Leitura de requisições
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Limite de tentativas de login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.'
    }
});

// Limite de cadastros
const cadastroLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        erro: 'Muitas tentativas de cadastro. Tente novamente em 15 minutos.'
    }
});

// Sessões
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 30
    }
}));

// Arquivos do frontend
app.use(express.static(path.join(__dirname, '../public')));

// Rota inicial da API
app.get('/api', (req, res) => {
    res.json({
        mensagem: 'Bem-vindo à API da TechStore!',
        status: 'online'
    });
});

// Aplicação dos limites antes das rotas
app.use('/api/auth/login', loginLimiter);
app.use('/api/usuarios/cadastro', cadastroLimiter);

// Rotas da aplicação
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/enderecos', enderecoRoutes);
app.use('/api/pedidos', pedidoRoutes);
app.use('/api/entregas', entregaRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
