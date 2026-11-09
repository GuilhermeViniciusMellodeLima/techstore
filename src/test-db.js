const pool = require('./config/database');

async function testarConexao() {
    let conexao;

    try {
        conexao = await pool.getConnection();

        const resultado = await conexao.query(
            'SELECT DATABASE() AS banco'
        );

        console.log('Conexão realizada com sucesso!');
        console.log('Banco conectado:', resultado[0].banco);

    } catch (erro) {
        console.error('Erro ao conectar ao banco:', erro.message);

    } finally {
        if (conexao) conexao.release();
        await pool.end();
    }
}

testarConexao();

