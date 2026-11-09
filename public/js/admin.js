/**
 * TechStore — Admin Dashboard Application
 * Módulos: Dashboard KPIs, Gestão de Catálogo de Produtos e Logística/Entregas.
 */

'use strict';

const API_ADMIN_DASHBOARD = '/api/admin/dashboard';
const API_PRODUTOS        = '/api/produtos';
const API_ENTREGAS        = '/api/entregas';
const API_AUTH_ME         = '/api/auth/me';
const API_AUTH_LOGOUT     = '/api/auth/logout';

const state = {
  usuario: null,
  currentTab: 'dashboard',
  produtos: [],
  entregas: []
};

const $ = (id) => document.getElementById(id);

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(val));
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'success') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast toast--${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function getStatusBadge(status) {
  const map = {
    pago:      { label: 'Pago', cls: 'status-badge--pago' },
    enviado:   { label: 'Enviado', cls: 'status-badge--enviado' },
    entregue:  { label: 'Entregue', cls: 'status-badge--entregue' },
    pendente:  { label: 'Pendente', cls: 'status-badge--pendente' },
    cancelado: { label: 'Cancelado', cls: 'status-badge--cancelado' },
    aguardando:{ label: 'Aguardando', cls: 'status-badge--pendente' },
    preparando:{ label: 'Preparando', cls: 'status-badge--pendente' },
    em_transito:{ label: 'Em trânsito', cls: 'status-badge--enviado' }
  };
  const s = map[status] || { label: status, cls: 'status-badge--pendente' };
  return `<span class="status-badge ${s.cls}">${s.label}</span>`;
}

/* ═══════════════════════════════════════════════════════════════════
   GUARDA DE ROTA / SESSÃO DO ADMINISTRADOR
   ═══════════════════════════════════════════════════════════════════ */

async function verificarAdminSessao() {
  let usuario = null;

  // 1. Tenta usar Auth.getSession() se existir
  if (window.Auth && typeof window.Auth.getSession === 'function') {
    usuario = await window.Auth.getSession();
  } else {
    // Fallback direto via GET /api/auth/me com credentials: 'include'
    try {
      const res = await fetch(API_AUTH_ME, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        usuario = data.usuario;
      }
    } catch {}
  }

  // Se não autenticado -> redireciona para login
  if (!usuario) {
    window.location.replace('/login.html?redirect=/admin.html');
    return null;
  }

  // Se não for perfil 'admin' -> bloqueia e volta para a loja
  if (usuario.perfil !== 'admin') {
    alert('Acesso negado: Somente administradores têm permissão para acessar este painel.');
    window.location.replace('/');
    return null;
  }

  state.usuario = usuario;

  // Atualiza identificação no topo
  $('admin-user-name').textContent = usuario.nome;
  $('admin-user-avatar').textContent = usuario.nome.charAt(0).toUpperCase();

  return usuario;
}

/* ═══════════════════════════════════════════════════════════════════
   NAVEGAÇÃO POR ABAS
   ═══════════════════════════════════════════════════════════════════ */

function switchTab(tabId) {
  state.currentTab = tabId;

  document.querySelectorAll('.admin-nav__link[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.id === `tab-${tabId}`);
  });

  const titles = {
    dashboard: 'Visão Geral / Dashboard',
    produtos:  'Gerenciamento de Produtos',
    entregas:  'Gestão de Pedidos & Logística'
  };

  $('page-title').textContent = titles[tabId] || 'Painel Administrativo';

  // Carrega dados da aba
  if (tabId === 'dashboard') carregarDashboard();
  if (tabId === 'produtos')  carregarProdutos();
  if (tabId === 'entregas')  carregarEntregas();

  // Fecha sidebar no mobile
  $('admin-sidebar')?.classList.remove('open');
}

/* ═══════════════════════════════════════════════════════════════════
   ABA 1: DASHBOARD (GET /api/admin/dashboard)
   ═══════════════════════════════════════════════════════════════════ */

async function carregarDashboard() {
  try {
    const res = await fetch(API_ADMIN_DASHBOARD, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (!res.ok) throw new Error(`Erro ${res.status} ao carregar dashboard`);

    const data = await res.json();

    $('kpi-vendas').textContent             = formatCurrency(data.vendas || 0);
    $('kpi-pedidos').textContent            = data.pedidos?.total_pedidos || 0;
    $('kpi-pedidos-detalhe').textContent    = `${data.pedidos?.pendentes || 0} pendentes · ${data.pedidos?.enviados || 0} enviados · ${data.pedidos?.entregues || 0} entregues`;
    $('kpi-clientes').textContent           = data.clientes || 0;
    $('kpi-produtos').textContent           = data.produtos || 0;
    $('kpi-entregas-pendentes').textContent = data.entregas_pendentes || 0;

    const tbody = $('dashboard-recentes-tbody');
    const recentes = data.pedidos_recentes || [];

    if (recentes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--clr-text-muted);">Nenhum pedido recente registrado.</td></tr>';
      return;
    }

    tbody.innerHTML = recentes.map(p => `
      <tr>
        <td><strong>#${String(p.id).padStart(4, '0')}</strong></td>
        <td>${escapeHtml(p.cliente)}</td>
        <td style="font-weight: 600; color: var(--clr-white);">${formatCurrency(p.valor_total)}</td>
        <td>${getStatusBadge(p.status)}</td>
        <td style="color: var(--clr-text-muted); font-size: var(--text-xs);">${formatDate(p.criado_em)}</td>
      </tr>
    `).join('');

  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ABA 2: PRODUTOS (GET, POST, PUT, DELETE /api/produtos)
   ═══════════════════════════════════════════════════════════════════ */

async function carregarProdutos() {
  const tbody = $('produtos-admin-tbody');
  try {
    const res = await fetch(API_PRODUTOS, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Falha ao listar produtos');

    state.produtos = await res.json();
    renderTabelaProdutos();

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--clr-error);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTabelaProdutos() {
  const tbody = $('produtos-admin-tbody');
  const filtro = ($('busca-produtos-admin')?.value || '').toLowerCase().trim();

  const filtrados = state.produtos.filter(p =>
    (p.nome || '').toLowerCase().includes(filtro) ||
    (p.descricao || '').toLowerCase().includes(filtro)
  );

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--clr-text-muted);">Nenhum produto encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(p => `
    <tr data-id="${p.id}">
      <td>#${p.id}</td>
      <td style="font-weight: 600; color: var(--clr-white);">${escapeHtml(p.nome)}</td>
      <td style="color: var(--clr-text-muted); max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${escapeHtml(p.descricao || '-')}
      </td>
      <td style="font-weight: 600; color: var(--clr-accent-h);">${formatCurrency(p.preco)}</td>
      <td>
        <span class="product-card__stock ${p.estoque > 5 ? 'product-card__stock--ok' : p.estoque > 0 ? 'product-card__stock--low' : 'product-card__stock--out'}" style="position: static;">
          ${p.estoque} un.
        </span>
      </td>
      <td>
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: ${p.ativo ? 'var(--clr-success)' : 'var(--clr-error)'};">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
          ${p.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td style="text-align: right;">
        <div class="table-actions" style="justify-content: flex-end;">
          <button class="btn btn--ghost btn--sm btn-editar-prod" data-id="${p.id}">Editar</button>
          <button class="btn btn--danger btn--sm btn-desativar-prod" data-id="${p.id}" data-nome="${escapeHtml(p.nome)}">Desativar</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Eventos de Ação
  tbody.querySelectorAll('.btn-editar-prod').forEach(btn => {
    btn.addEventListener('click', () => abrirModalProduto(Number(btn.dataset.id)));
  });

  tbody.querySelectorAll('.btn-desativar-prod').forEach(btn => {
    btn.addEventListener('click', () => handleDesativarProduto(Number(btn.dataset.id), btn.dataset.nome));
  });
}

function abrirModalProduto(produtoId = null) {
  const modal = $('modal-produto');
  const title = $('modal-produto-title');
  const form  = $('form-produto');

  form.reset();
  $('prod-id').value = '';
  $('err-prod-nome').textContent = '';
  $('err-prod-preco').textContent = '';
  $('err-prod-estoque').textContent = '';

  if (produtoId) {
    const prod = state.produtos.find(p => p.id === produtoId);
    if (!prod) return;

    title.textContent          = 'Editar Produto';
    $('prod-id').value         = prod.id;
    $('prod-nome').value       = prod.nome;
    $('prod-descricao').value  = prod.descricao || '';
    $('prod-preco').value      = prod.preco;
    $('prod-estoque').value    = prod.estoque;
  } else {
    title.textContent = 'Cadastrar Novo Produto';
  }

  modal.classList.add('open');
}

function fecharModalProduto() {
  $('modal-produto')?.classList.remove('open');
}

async function handleSalvarProduto(e) {
  e.preventDefault();

  const id        = $('prod-id').value;
  const nome      = $('prod-nome').value.trim();
  const descricao = $('prod-descricao').value.trim();
  const preco     = Number($('prod-preco').value);
  const estoque   = Number($('prod-estoque').value);

  let valid = true;

  if (!nome) {
    $('err-prod-nome').textContent = 'Informe o nome do produto.';
    valid = false;
  } else {
    $('err-prod-nome').textContent = '';
  }

  if (isNaN(preco) || preco <= 0) {
    $('err-prod-preco').textContent = 'Informe um preço maior que zero.';
    valid = false;
  } else {
    $('err-prod-preco').textContent = '';
  }

  if (isNaN(estoque) || !Number.isInteger(estoque) || estoque < 0) {
    $('err-prod-estoque').textContent = 'Informe um estoque inteiro positivo ou zero.';
    valid = false;
  } else {
    $('err-prod-estoque').textContent = '';
  }

  if (!valid) return;

  const btnSalvar = $('btn-salvar-produto');
  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  try {
    const isEdit = Boolean(id);
    const url    = isEdit ? `${API_PRODUTOS}/${id}` : API_PRODUTOS;
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ nome, descricao, preco, estoque })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.erro || 'Falha ao salvar produto.');
    }

    showToast(data.mensagem || 'Operação realizada com sucesso!', 'success');
    fecharModalProduto();
    await carregarProdutos();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar Produto';
  }
}

async function handleDesativarProduto(id, nome) {
  const confirmacao = confirm(`Deseja realmente desativar o produto "${nome}"? Ele não aparecerá mais no catálogo para os clientes.`);
  if (!confirmacao) return;

  try {
    const res = await fetch(`${API_PRODUTOS}/${id}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.erro || 'Falha ao desativar produto.');

    showToast(data.mensagem || 'Produto desativado com sucesso!', 'success');
    await carregarProdutos();

  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ABA 3: ENTREGAS & LOGÍSTICA (GET, PUT /api/entregas)
   ═══════════════════════════════════════════════════════════════════ */

async function carregarEntregas() {
  const tbody = $('entregas-admin-tbody');
  try {
    const res = await fetch(API_ENTREGAS, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Falha ao listar entregas');

    const data = await res.json();
    state.entregas = data.entregas || [];

    if (state.entregas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--clr-text-muted);">Nenhuma entrega registrada no momento.</td></tr>';
      return;
    }

    tbody.innerHTML = state.entregas.map(e => `
      <tr data-id="${e.id}">
        <td><strong>#ENT-${e.id}</strong></td>
        <td><strong>#${String(e.pedido_id).padStart(4, '0')}</strong></td>
        <td>Cliente #${e.usuario_id}</td>
        <td style="font-weight: 600; color: var(--clr-white);">${formatCurrency(e.valor_total)}</td>
        <td>${getStatusBadge(e.status_pedido)}</td>
        <td>${getStatusBadge(e.status)}</td>
        <td>${escapeHtml(e.transportadora || 'Não atribuída')}</td>
        <td><code>${escapeHtml(e.codigo_rastreio || 'Pendente')}</code></td>
        <td style="font-size: 11px; color: var(--clr-text-muted);">
          Envio: ${formatDate(e.data_envio)}<br/>
          Entrega: ${formatDate(e.data_entrega)}
        </td>
        <td style="text-align: right;">
          <button class="btn btn--ghost btn--sm btn-editar-entrega" data-id="${e.id}">
            Atualizar
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-editar-entrega').forEach(btn => {
      btn.addEventListener('click', () => abrirModalEntrega(Number(btn.dataset.id)));
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--clr-error);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function abrirModalEntrega(entregaId) {
  const entrega = state.entregas.find(e => e.id === entregaId);
  if (!entrega) return;

  $('entrega-id').value             = entrega.id;
  $('entrega-status').value         = entrega.status;
  $('entrega-transportadora').value = entrega.transportadora || '';
  $('entrega-rastreio').value      = entrega.codigo_rastreio || '';

  $('modal-entrega-title').textContent = `Atualizar Entrega #ENT-${entrega.id} (Pedido #${entrega.pedido_id})`;
  $('modal-entrega').classList.add('open');
}

function fecharModalEntrega() {
  $('modal-entrega')?.classList.remove('open');
}

async function handleSalvarEntrega(e) {
  e.preventDefault();

  const id             = $('entrega-id').value;
  const status         = $('entrega-status').value;
  const transportadora = $('entrega-transportadora').value.trim() || undefined;
  const codigo_rastreio= $('entrega-rastreio').value.trim() || undefined;

  const btnSalvar = $('btn-salvar-entrega');
  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  try {
    const res = await fetch(`${API_ENTREGAS}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        status,
        transportadora: transportadora || null,
        codigo_rastreio: codigo_rastreio || null
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.erro || 'Falha ao atualizar entrega.');

    showToast(data.mensagem || 'Entrega atualizada com sucesso!', 'success');
    fecharModalEntrega();
    await carregarEntregas();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar Alterações';
  }
}

/* ═══════════════════════════════════════════════════════════════════
   LOGOUT DO ADMINISTRADOR
   ═══════════════════════════════════════════════════════════════════ */

async function handleAdminLogout() {
  try {
    await fetch(API_AUTH_LOGOUT, {
      method: 'POST',
      credentials: 'include'
    });
  } catch {}
  window.location.replace('/login.html');
}

/* ═══════════════════════════════════════════════════════════════════
   INICIALIZAÇÃO & EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Valida autenticação de administrador
  const usuario = await verificarAdminSessao();
  if (!usuario) return;

  // 2. Carrega Dashboard inicial
  await carregarDashboard();

  // 3. Navegação por abas
  document.querySelectorAll('.admin-nav__link[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Atalho do dashboard para a aba de entregas
  $('btn-ver-todas-entregas')?.addEventListener('click', () => switchTab('entregas'));

  // Toggle do menu lateral no mobile
  $('btn-sidebar-toggle')?.addEventListener('click', () => {
    $('admin-sidebar')?.classList.toggle('open');
  });

  // Logout
  $('btn-admin-logout')?.addEventListener('click', handleAdminLogout);

  // Busca de produtos
  $('busca-produtos-admin')?.addEventListener('input', renderTabelaProdutos);

  // Modal de Produtos
  $('btn-novo-produto')?.addEventListener('click', () => abrirModalProduto());
  $('btn-fechar-modal-produto')?.addEventListener('click', fecharModalProduto);
  $('btn-cancelar-modal-produto')?.addEventListener('click', fecharModalProduto);
  $('form-produto')?.addEventListener('submit', handleSalvarProduto);

  // Modal de Entregas
  $('btn-recarregar-entregas')?.addEventListener('click', carregarEntregas);
  $('btn-fechar-modal-entrega')?.addEventListener('click', fecharModalEntrega);
  $('btn-cancelar-modal-entrega')?.addEventListener('click', fecharModalEntrega);
  $('form-entrega')?.addEventListener('submit', handleSalvarEntrega);
});
