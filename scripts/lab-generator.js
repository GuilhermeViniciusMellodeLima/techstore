
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomInt, randomUUID } = require('crypto');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const PID_FILE = path.join(ROOT, '.lab-generator.pid');
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'lab-generator.log');
const INTERVAL_MS = 5 * 60 * 1000;

const API_URL = (process.env.LAB_API_URL || 'http://127.0.0.1:3000')
    .replace(/\/+$/, '');

let adminCookie = null;
let timer = null;
let stopping = false;

function log(message) {
    const line = `[${new Date().toLocaleString('pt-BR')}] ${message}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function getCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) return cookies[0].split(';')[0];
    }

    const cookie = response.headers.get('set-cookie');
    return cookie ? cookie.split(';')[0] : null;
}

async function request(method, endpoint, body = null, cookie = null) {
    const headers = { Accept: 'application/json' };

    if (body !== null) {
        headers['Content-Type'] = 'application/json';
    }

    if (cookie) {
        headers.Cookie = cookie;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: body === null ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000)
    });

    const text = await response.text();
    let data = {};

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { resposta: text };
    }

    return {
        status: response.status,
        data,
        cookie: getCookie(response)
    };
}

function ensureSuccess(result, operation) {
    if (result.status < 200 || result.status >= 300) {
        const detail = result.data.erro ||
            result.data.mensagem ||
            result.data.resposta ||
            JSON.stringify(result.data);

        throw new Error(`${operation}: HTTP ${result.status} - ${detail}`);
    }

    return result.data;
}

async function loginAdmin() {
    const email = process.env.LAB_ADMIN_EMAIL;
    const senha = process.env.LAB_ADMIN_PASSWORD;

    if (!email || !senha) {
        throw new Error(
            'Configure LAB_ADMIN_EMAIL e LAB_ADMIN_PASSWORD no arquivo .env.'
        );
    }

    const result = await request('POST', '/api/auth/login', {
        email,
        senha
    });

    ensureSuccess(result, 'Login administrativo');

    if (!result.cookie) {
        throw new Error(
            'O servidor não retornou o cookie da sessão administrativa.'
        );
    }

    adminCookie = result.cookie;
    log('Sessão administrativa autenticada.');
}

async function createProduct() {
    const suffix = randomUUID().slice(0, 8);

    const product = {
        nome: `Produto de Laboratório ${suffix}`,
        descricao: 'Produto fictício para demonstração acadêmica de tráfego HTTP.',
        preco: 49.90,
        estoque: 10
    };

    let result = await request(
        'POST',
        '/api/produtos',
        product,
        adminCookie
    );

    if (result.status === 401) {
        log('Sessão administrativa expirada. Renovando...');
        await loginAdmin();

        result = await request(
            'POST',
            '/api/produtos',
            product,
            adminCookie
        );
    }

    const data = ensureSuccess(result, 'Criação do produto');

    if (!data.id) {
        throw new Error('A API não retornou o ID do produto criado.');
    }

    return data.id;
}

async function createCustomer() {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const password = `Lab@${randomUUID().slice(0, 12)}`;

    const customer = {
        nome: `Cliente de Laboratório ${suffix.slice(0, 6)}`,
        cpf: String(randomInt(0, 100000000000)).padStart(11, '0'),
        email: `lab.${suffix}@example.test`,
        telefone: `129${String(randomInt(0, 10000000)).padStart(7, '0')}`,
        senha: password
    };

    const registration = await request(
        'POST',
        '/api/usuarios/cadastro',
        customer
    );

    ensureSuccess(registration, 'Cadastro do cliente');

    const login = await request('POST', '/api/auth/login', {
        email: customer.email,
        senha: password
    });

    ensureSuccess(login, 'Login do cliente');

    if (!login.cookie) {
        throw new Error(
            'O servidor não retornou o cookie da sessão do cliente.'
        );
    }

    return {
        cookie: login.cookie,
        name: customer.nome
    };
}

async function createOrder(customer, productId) {
    const order = {
        endereco: {
            cep: '00000000',
            estado: 'SP',
            cidade: 'Cidade de Teste',
            rua: 'Rua Fictícia do Laboratório',
            numero: '100',
            complemento: 'Endereço fictício'
        },
        itens: [
            {
                produto_id: productId,
                quantidade: 1
            }
        ],
        metodo: 'pix'
    };

    const result = await request(
        'POST',
        '/api/pedidos',
        order,
        customer.cookie
    );

    return ensureSuccess(result, 'Finalização do pedido');
}

async function runCycle() {
    const cycleId = new Date().toLocaleTimeString('pt-BR');

    log(`Iniciando ciclo ${cycleId}.`);

    try {
        const productId = await createProduct();
        const customer = await createCustomer();
        const order = await createOrder(customer, productId);

        const total = Number(order.valor_total);

        log(
            `Ciclo concluído: cliente "${customer.name}", ` +
            `produto ${productId}, pedido ${order.id || 'criado'}, ` +
            `total R$ ${Number.isFinite(total) ? total.toFixed(2) : 'indisponível'}, ` +
            'pagamento simulado.'
        );
    } catch (error) {
        log(`ERRO no ciclo: ${error.message}`);
    }

    if (!stopping) {
        log('Próximo ciclo programado para daqui a 5 minutos.');
        timer = setTimeout(runCycle, INTERVAL_MS);
    }
}

function removePidFile() {
    try {
        const storedPid = Number(
            fs.readFileSync(PID_FILE, 'utf8').trim()
        );

        if (storedPid === process.pid) {
            fs.unlinkSync(PID_FILE);
        }
    } catch {
        // O arquivo pode já ter sido removido.
    }
}

async function run() {
    fs.mkdirSync(LOG_DIR, { recursive: true });

    process.on('SIGTERM', () => {
        stopping = true;
        if (timer) clearTimeout(timer);
        log('Gerador interrompido.');
        removePidFile();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        stopping = true;
        if (timer) clearTimeout(timer);
        log('Gerador interrompido.');
        removePidFile();
        process.exit(0);
    });

    process.on('exit', removePidFile);

    try {
        log('Gerador iniciado.');
        log(`API utilizada: ${API_URL}`);

        await loginAdmin();
        await runCycle();
    } catch (error) {
        log(`Falha na inicialização: ${error.message}`);
        removePidFile();
        process.exit(1);
    }
}

function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function start() {
    if (fs.existsSync(PID_FILE)) {
        const oldPid = Number(
            fs.readFileSync(PID_FILE, 'utf8').trim()
        );

        if (oldPid && isProcessRunning(oldPid)) {
            console.log(`O gerador já está em execução. PID: ${oldPid}`);
            return;
        }

        fs.unlinkSync(PID_FILE);
    }

    const child = spawn(
        process.execPath,
        [__filename, 'run'],
        {
            cwd: ROOT,
            detached: true,
            stdio: 'ignore',
            env: process.env
        }
    );

    child.unref();
    fs.writeFileSync(PID_FILE, String(child.pid));

    console.log(`Gerador iniciado em segundo plano. PID: ${child.pid}`);
    console.log(`Log: ${LOG_FILE}`);
}

function stop() {
    if (!fs.existsSync(PID_FILE)) {
        console.log('O gerador não está em execução.');
        return;
    }

    const pid = Number(
        fs.readFileSync(PID_FILE, 'utf8').trim()
    );

    if (!pid || !isProcessRunning(pid)) {
        fs.unlinkSync(PID_FILE);
        console.log('O gerador já estava parado.');
        return;
    }

    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);

    console.log('Solicitação de parada enviada.');
}

function status() {
    if (!fs.existsSync(PID_FILE)) {
        console.log('Gerador parado.');
        return;
    }

    const pid = Number(
        fs.readFileSync(PID_FILE, 'utf8').trim()
    );

    if (pid && isProcessRunning(pid)) {
        console.log(`Gerador em execução. PID: ${pid}`);
        console.log(`Log: ${LOG_FILE}`);
    } else {
        fs.unlinkSync(PID_FILE);
        console.log('Gerador parado (PID antigo removido).');
    }
}

const command = process.argv[2];

switch (command) {
    case 'start':
        start();
        break;
    case 'stop':
        stop();
        break;
    case 'status':
        status();
        break;
    case 'run':
        run();
        break;
    default:
        console.log('Uso: node scripts/lab-generator.js start|stop|status');
        process.exitCode = 1;
}
