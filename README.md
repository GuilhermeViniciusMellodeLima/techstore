
# TechStore

Sistema de comércio eletrônico desenvolvido como projeto acadêmico no curso de Análise e Desenvolvimento de Sistemas do IFSP.

## Tecnologias

- Node.js
- Express
- MariaDB
- HTML5
- CSS3
- JavaScript
- bcrypt
- Helmet
- Express Session
- Express Rate Limit

## Funcionalidades

### Loja
- Catálogo de produtos.
- Busca e ordenação.
- Carrinho de compras.
- Cadastro e autenticação de clientes.
- Checkout e histórico de pedidos.

### Administração
- Dashboard com indicadores.
- Cadastro, edição e desativação de produtos.
- Gerenciamento de entregas.
- Atualização de status e rastreamento.

### Segurança
- Senhas protegidas com bcrypt.
- Consultas parametrizadas.
- Controle de acesso por perfil.
- Proteção de sessão.
- Limitação de tentativas de login e cadastro.
- Helmet e proteção de credenciais por variáveis de ambiente.

## Requisitos

- Node.js
- npm
- MariaDB

## Instalação

1. Clone o repositório.
2. Instale as dependências:

   npm install

3. Crie o banco de dados utilizando o script disponível na pasta database.
4. Copie `.env.example` para `.env`.
5. Configure as variáveis de ambiente.
6. Inicie a aplicação:

   npm start

7. Acesse:

   http://localhost:3000

## Observações

O projeto foi desenvolvido para fins acadêmicos. O processamento de pagamentos é demonstrativo, sem cobrança financeira real.
