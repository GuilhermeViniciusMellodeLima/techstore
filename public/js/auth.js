/**
 * TechStore — Auth Module
 * Autenticação, sessão e gerenciamento de conta do cliente.
 *
 * API integrada:
 *   POST GET /api/auth/login
 *   GET       /api/auth/me
 *   POST      /api/auth/logout
 *   POST      /api/usuarios/cadastro
 *
 * Segurança:
 *   - credentials: 'include' em todas as chamadas autenticadas
 *   - Sem armazenamento de senhas ou tokens no localStorage
 *   - Sanitização/escape de saída para prevenir XSS
 *   - Validações no cliente são conveniência — o backend é a fonte de verdade
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTES
   ═══════════════════════════════════════════════════════════════════ */

const AUTH_API = '/api/auth';
const USER_API = '/api/usuarios';

/* ═══════════════════════════════════════════════════════════════════
   HELPERS INTERNOS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Escapa HTML para prevenir XSS antes de inserir em innerHTML.
 * @param {any} str
 * @returns {string}
 */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Referência a elemento por id.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
const byId = (id) => document.getElementById(id);

/**
 * Faz requisição JSON com credentials: 'include' (sessão por cookie).
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
async function apiFetch(url, options = {}) {
  const defaults = {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    credentials: 'include',
  };

  const res = await fetch(url, { ...defaults, ...options,
    headers: { ...defaults.headers, ...(options.headers || {}) }
  });

  let data = {};
  try { data = await res.json(); } catch { /* corpo vazio */ }

  return { ok: res.ok, status: res.status, data };
}

/* ═══════════════════════════════════════════════════════════════════
   VALIDAÇÕES NO CLIENTE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Limpa somente dígitos de uma string.
 * @param {string} val
 * @returns {string}
 */
const onlyDigits = (val) => String(val).replace(/\D/g, '');

/**
 * Valida CPF (algoritmo oficial).
 * @param {string} cpf string com apenas dígitos
 * @returns {boolean}
 */
function validarCPF(cpf) {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;

  const calc = (len) =>
    d.slice(0, len).split('').reduce((acc, n, i) => acc + Number(n) * (len + 1 - i), 0);

  const r1 = (calc(9) * 10) % 11;
  const d1 = r1 >= 10 ? 0 : r1;
  if (d1 !== Number(d[9])) return false;

  const r2 = (calc(10) * 10) % 11;
  const d2 = r2 >= 10 ? 0 : r2;
  return d2 === Number(d[10]);
}

/**
 * Calcula a "força" de uma senha: 0–4.
 * @param {string} pwd
 * @returns {number}
 */
function pwdStrength(pwd) {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return Math.min(score, 4);
}

/* ═══════════════════════════════════════════════════════════════════
   FORMATAÇÃO DE CAMPOS (máscaras simples)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Formata CPF: 000.000.000-00
 * @param {string} val
 * @returns {string}
 */
function maskCPF(val) {
  const d = onlyDigits(val).slice(0, 11);
  if (d.length <= 3)  return d;
  if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

/**
 * Formata telefone: (00) 00000-0000 ou (00) 0000-0000
 * @param {string} val
 * @returns {string}
 */
function maskPhone(val) {
  const d = onlyDigits(val).slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : '';
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

/* ═══════════════════════════════════════════════════════════════════
   ALERTAS E ERROS DE FORMULÁRIO
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Exibe o alerta principal do card de auth.
 * @param {string} msg
 * @param {'error'|'success'} type
 */
function showAlert(msg, type = 'error') {
  const el = byId('auth-alert');
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-alert auth-alert--${type}`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Esconde o alerta principal. */
function hideAlert() {
  const el = byId('auth-alert');
  if (el) el.className = 'auth-alert auth-alert--hidden';
}

/**
 * Marca um campo como inválido com mensagem de erro.
 * @param {string} fieldId id do grupo (group-xxx)
 * @param {string} errorId id do span de erro
 * @param {string} msg
 */
function setFieldError(fieldId, errorId, msg) {
  const group = byId(fieldId);
  const errorEl = byId(errorId);
  if (group)   group.classList.add('form-group--error');
  if (errorEl) errorEl.textContent = msg;
}

/**
 * Remove erro de um campo.
 * @param {string} fieldId
 * @param {string} errorId
 */
function clearFieldError(fieldId, errorId) {
  const group = byId(fieldId);
  const errorEl = byId(errorId);
  if (group)   group.classList.remove('form-group--error');
  if (errorEl) errorEl.textContent = '';
}

/** Remove todos os erros de todos os campos do formulário. */
function clearAllErrors() {
  document.querySelectorAll('.form-group--error').forEach((g) => g.classList.remove('form-group--error'));
  document.querySelectorAll('.form-error').forEach((e) => { e.textContent = ''; });
  hideAlert();
}

/* ═══════════════════════════════════════════════════════════════════
   ESTADO DO BOTÃO DE SUBMIT
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Habilita/desabilita o botão de submit e controla o spinner.
 * @param {string} btnId
 * @param {boolean} loading
 */
function setSubmitLoading(btnId, loading) {
  const btn = byId(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('btn--loading', loading);
  const label = btn.querySelector('.btn-label');
  if (label) label.style.opacity = loading ? '0' : '1';
}

/* ═══════════════════════════════════════════════════════════════════
   TOGGLE VISIBILIDADE DA SENHA
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Liga o botão de toggle de visibilidade de senha.
 * @param {string} toggleId id do botão
 * @param {string} inputId  id do campo
 */
function initPasswordToggle(toggleId, inputId) {
  const toggle = byId(toggleId);
  const input  = byId(inputId);
  if (!toggle || !input) return;

  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');

    const eyeOpen   = toggle.querySelector('.eye-open');
    const eyeClosed = toggle.querySelector('.eye-closed');
    if (eyeOpen)   eyeOpen.style.display   = show ? 'none'  : '';
    if (eyeClosed) eyeClosed.style.display = show ? ''      : 'none';
  });
}

/* ═══════════════════════════════════════════════════════════════════
   MEDIDOR DE FORÇA DA SENHA
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Atualiza o medidor visual de força da senha.
 * @param {string} inputId
 */
function initStrengthMeter(inputId) {
  const input  = byId(inputId);
  const fill   = byId('pwd-strength-fill');
  const label  = byId('pwd-strength-label');
  const wrap   = byId('pwd-strength');

  if (!input || !fill || !label || !wrap) return;

  const labels  = ['', 'Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte'];
  const classes = ['', 'strength--1', 'strength--2', 'strength--3', 'strength--4', 'strength--4'];

  input.addEventListener('input', () => {
    const score = pwdStrength(input.value);
    wrap.style.display = input.value.length > 0 ? 'flex' : 'none';

    fill.style.width = `${score * 25}%`;
    fill.className = `pwd-strength__fill ${classes[score]}`;
    label.textContent = labels[score];
  });
}

/* ═══════════════════════════════════════════════════════════════════
   SESSÃO — Verificar usuário autenticado
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Consulta GET /api/auth/me e retorna os dados do usuário ou null.
 * Usa credentials: 'include' para enviar o cookie de sessão.
 * @returns {Promise<{id:number, nome:string, perfil:string}|null>}
 */
async function getSession() {
  try {
    const { ok, data } = await apiFetch(`${AUTH_API}/me`);
    if (ok && data.usuario) return data.usuario;
    return null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ATUALIZAÇÃO DO HEADER (usado em index.html)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Atualiza os controles de autenticação no cabeçalho da loja.
 * @param {{id:number, nome:string, perfil:string}|null} usuario
 */
function updateHeaderAuth(usuario) {
  const actionsEl = byId('header-auth-actions');
  if (!actionsEl) return;

  if (usuario) {
    // Usuário autenticado: mostra nome + botão sair
    const firstName = esc(usuario.nome.split(' ')[0]);
    actionsEl.innerHTML = /* html */`
      <div class="user-menu" id="user-menu">
        <button class="btn btn--ghost btn--sm user-menu__trigger" id="user-menu-trigger"
                aria-haspopup="true" aria-expanded="false" aria-controls="user-dropdown">
          <span class="user-avatar" aria-hidden="true">${esc(usuario.nome.charAt(0).toUpperCase())}</span>
          <span class="user-menu__name">${firstName}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="user-dropdown" id="user-dropdown" role="menu" aria-hidden="true">
          <div class="user-dropdown__info">
            <span class="user-dropdown__name">${esc(usuario.nome)}</span>
            <span class="user-dropdown__badge ${usuario.perfil === 'admin' ? 'badge--admin' : 'badge--cliente'}">
              ${usuario.perfil === 'admin' ? 'Administrador' : 'Cliente'}
            </span>
          </div>
          <hr class="user-dropdown__divider" aria-hidden="true"/>
          <a href="/pedidos.html" class="user-dropdown__item" role="menuitem">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Meus Pedidos
          </a>
          ${usuario.perfil === 'admin' ? /* html */`
            <a href="/admin.html" class="user-dropdown__item" role="menuitem" style="color: var(--clr-accent-h);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              Painel Admin
            </a>
          ` : ''}
          <hr class="user-dropdown__divider" aria-hidden="true"/>
          <button class="user-dropdown__item user-dropdown__item--danger" id="btn-logout" role="menuitem">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sair da conta
          </button>
        </div>
      </div>
    `;

    // Dropdown toggle
    const trigger  = byId('user-menu-trigger');
    const dropdown = byId('user-dropdown');
    if (trigger && dropdown) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('open');
        trigger.setAttribute('aria-expanded', String(isOpen));
        dropdown.setAttribute('aria-hidden', String(!isOpen));
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        dropdown.setAttribute('aria-hidden', 'true');
      });

      dropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    // Logout
    const logoutBtn = byId('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => handleLogout());
    }

  } else {
    // Visitante: botão entrar
    actionsEl.innerHTML = /* html */`
      <a href="/login.html" class="btn btn--ghost btn--sm" id="btn-login">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Entrar</span>
      </a>
    `;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   LOGOUT
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Realiza logout via POST /api/auth/logout e atualiza a UI.
 */
async function handleLogout() {
  try {
    await apiFetch(`${AUTH_API}/logout`, { method: 'POST' });
  } catch { /* silencia erros de rede — sessão pode já ter expirado */ }

  // Atualiza header para visitante
  updateHeaderAuth(null);
  window.dispatchEvent(new CustomEvent('auth:change', { detail: { usuario: null } }));

  // Toast (disponível na index.html via app.js)
  if (typeof showToast === 'function') {
    showToast('Você saiu da sua conta.', 'success');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

function initLoginPage() {
  const form    = byId('login-form');
  const emailEl = byId('login-email');
  const senhaEl = byId('login-senha');

  if (!form) return;

  // Toggle visibilidade da senha
  initPasswordToggle('toggle-senha', 'login-senha');

  // Verificar se já está autenticado → redirecionar
  getSession().then((usuario) => {
    if (usuario) {
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirect') || '/';
      window.location.replace(redirectUrl);
    }
  });

  // Limpar erros ao digitar
  emailEl?.addEventListener('input', () => clearFieldError('group-email', 'email-error'));
  senhaEl?.addEventListener('input', () => clearFieldError('group-senha', 'senha-error'));

  // Envio do formulário
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const email = emailEl?.value.trim() || '';
    const senha = senhaEl?.value        || '';

    // Validação local
    let valid = true;

    if (!email) {
      setFieldError('group-email', 'email-error', 'Informe seu e-mail.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('group-email', 'email-error', 'E-mail inválido.');
      valid = false;
    }

    if (!senha) {
      setFieldError('group-senha', 'senha-error', 'Informe sua senha.');
      valid = false;
    }

    if (!valid) return;

    setSubmitLoading('btn-login-submit', true);

    try {
      const { ok, status, data } = await apiFetch(`${AUTH_API}/login`, {
        method: 'POST',
        body: JSON.stringify({ email, senha }),
      });

      if (ok) {
        // Login bem-sucedido — redireciona para a página de retorno ou loja
        const urlParams = new URLSearchParams(window.location.search);
        const redirectUrl = urlParams.get('redirect') || '/';
        showAlert('Login realizado! Redirecionando…', 'success');
        setTimeout(() => {
          window.location.replace(redirectUrl);
        }, 900);
      } else {
        // Erro da API (401, 400, 500…)
        const msg = data.erro || 'Não foi possível realizar o login.';

        if (status === 401 || status === 400) {
          // Credenciais incorretas
          setFieldError('group-email', 'email-error', ' '); // marca visualmente
          setFieldError('group-senha', 'senha-error', ' ');
          showAlert(msg, 'error');
        } else {
          showAlert(msg, 'error');
        }
        setSubmitLoading('btn-login-submit', false);
      }

    } catch (err) {
      showAlert('Erro de conexão. Verifique sua internet e tente novamente.', 'error');
      setSubmitLoading('btn-login-submit', false);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   CADASTRO PAGE
   ═══════════════════════════════════════════════════════════════════ */

function initCadastroPage() {
  const form       = byId('cadastro-form');
  const nomeEl     = byId('cad-nome');
  const cpfEl      = byId('cad-cpf');
  const emailEl    = byId('cad-email');
  const telefoneEl = byId('cad-telefone');
  const senhaEl    = byId('cad-senha');
  const confirmarEl = byId('cad-confirmar');
  const termosEl   = byId('cad-termos');

  if (!form) return;

  // Toggle visibilidade de senhas
  initPasswordToggle('toggle-senha',    'cad-senha');
  initPasswordToggle('toggle-confirmar','cad-confirmar');

  // Medidor de força da senha
  initStrengthMeter('cad-senha');

  // Verificar se já autenticado
  getSession().then((usuario) => {
    if (usuario) window.location.replace('/');
  });

  // Máscaras dinâmicas
  cpfEl?.addEventListener('input', (e) => {
    const input = e.target;
    const posicao = input.selectionStart ?? input.value.length;

    // Conta quantos números existem antes do cursor
    const digitosAntes = onlyDigits(input.value.slice(0, posicao)).length;

    // Aplica a máscara
    input.value = maskCPF(input.value);

    // Reposiciona o cursor considerando os caracteres inseridos
    let novaPosicao = 0;
    let digitosContados = 0;

    while (novaPosicao < input.value.length && digitosContados < digitosAntes) {
      if (/\d/.test(input.value[novaPosicao])) {
        digitosContados++;
      }
      novaPosicao++;
    }

    try {
      input.setSelectionRange(novaPosicao, novaPosicao);
    } catch {}
  });

  telefoneEl?.addEventListener('input', (e) => {
    e.target.value = maskPhone(e.target.value);
  });

  // Limpar erros ao digitar
  const fields = [
    ['cad-nome',     'group-nome',     'nome-error'],
    ['cad-cpf',      'group-cpf',      'cpf-error'],
    ['cad-email',    'group-email',    'email-error'],
    ['cad-telefone', 'group-telefone', 'telefone-error'],
    ['cad-senha',    'group-senha',    'senha-error'],
    ['cad-confirmar','group-confirmar','confirmar-error'],
  ];

  fields.forEach(([inputId, groupId, errorId]) => {
    byId(inputId)?.addEventListener('input', () => {
      clearFieldError(groupId, errorId);
      hideAlert();
    });
  });

  // Envio do formulário
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const nome     = nomeEl?.value.trim()     || '';
    const cpfRaw   = cpfEl?.value             || '';
    const email    = emailEl?.value.trim()    || '';
    const telefone = telefoneEl?.value.trim() || '';
    const senha    = senhaEl?.value           || '';
    const confirmar = confirmarEl?.value      || '';
    const termos   = termosEl?.checked        || false;

    const cpfDigitos = onlyDigits(cpfRaw);

    let valid = true;

    // Validações
    if (nome.length < 3) {
      setFieldError('group-nome', 'nome-error', 'Informe seu nome completo (mínimo 3 caracteres).');
      valid = false;
    }

    if (!validarCPF(cpfDigitos)) {
      setFieldError('group-cpf', 'cpf-error', 'CPF inválido. Verifique e tente novamente.');
      valid = false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('group-email', 'email-error', 'E-mail inválido.');
      valid = false;
    }

    const telDigitos = onlyDigits(telefone);
    if (telDigitos.length < 10 || telDigitos.length > 11) {
      setFieldError('group-telefone', 'telefone-error', 'Informe um telefone válido com DDD.');
      valid = false;
    }

    if (senha.length < 8) {
      setFieldError('group-senha', 'senha-error', 'A senha deve ter pelo menos 8 caracteres.');
      valid = false;
    }

    if (senha !== confirmar) {
      setFieldError('group-confirmar', 'confirmar-error', 'As senhas não coincidem.');
      valid = false;
    }

    if (!termos) {
      setFieldError('group-termos', 'termos-error', 'Você precisa aceitar os termos para continuar.');
      valid = false;
    }

    if (!valid) return;

    setSubmitLoading('btn-cadastro-submit', true);

    try {
      const { ok, status, data } = await apiFetch(`${USER_API}/cadastro`, {
        method: 'POST',
        body: JSON.stringify({
          nome,
          cpf:      cpfDigitos,   // envia somente dígitos
          email,
          telefone,
          senha,
          // Nunca envia campo 'perfil' — o backend define 'cliente' por padrão
        }),
      });

      if (ok) {
        // Conta criada com sucesso
        showAlert('Conta criada com sucesso! Redirecionando para o login…', 'success');
        form.reset();
        setTimeout(() => {
          window.location.replace('/login.html');
        }, 1800);

      } else {
        const msg = data.erro || 'Não foi possível criar a conta.';

        if (status === 409) {
          // CPF ou e-mail duplicado
          showAlert(msg, 'error');
          // Tenta marcar o campo específico
          if (msg.toLowerCase().includes('e-mail')) {
            setFieldError('group-email', 'email-error', 'E-mail já cadastrado.');
          }
          if (msg.toLowerCase().includes('cpf')) {
            setFieldError('group-cpf', 'cpf-error', 'CPF já cadastrado.');
          }
        } else if (status === 400) {
          showAlert(msg, 'error');
        } else {
          showAlert('Erro interno. Tente novamente em instantes.', 'error');
        }

        setSubmitLoading('btn-cadastro-submit', false);
      }

    } catch (err) {
      showAlert('Erro de conexão. Verifique sua internet e tente novamente.', 'error');
      setSubmitLoading('btn-cadastro-submit', false);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   INICIALIZAÇÃO DA SESSÃO NA INDEX (chamado pelo app.js)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Consulta a sessão e atualiza o header da loja.
 * @returns {Promise<{id:number, nome:string, perfil:string}|null>}
 */
async function initSession() {
  const usuario = await getSession();
  updateHeaderAuth(usuario);
  window.dispatchEvent(new CustomEvent('auth:change', { detail: { usuario } }));
  return usuario;
}

/* ═══════════════════════════════════════════════════════════════════
   EXPORT PÚBLICO
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Namespace global Auth — acessível pelas páginas.
 */
window.Auth = {
  initLoginPage,
  initCadastroPage,
  initSession,
  getSession,
  updateHeaderAuth,
  handleLogout,
};
