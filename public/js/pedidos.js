/**
 * TechStore — Meus Pedidos
 * Consulta e exibição do histórico de compras do usuário.
 */

'use strict';

const API_PEDIDOS = '/api/pedidos';

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

function getStatusBadge(status) {
  const map = {
    pago:      { label: 'Pago', cls: 'status-badge--pago' },
    enviado:   { label: 'Enviado', cls: 'status-badge--enviado' },
    entregue:  { label: 'Entregue', cls: 'status-badge--entregue' },
    pendente:  { label: 'Pendente', cls: 'status-badge--pendente' },
    cancelado: { label: 'Cancelado', cls: 'status-badge--cancelado' }
  };
  const s = map[status] || { label: status, cls: 'status-badge--pendente' };
  return `<span class="status-badge ${s.cls}">${s.label}</span>`;
}

function getEntregaStatusLabel(status) {
  const map = {
    aguardando:  'Aguardando separação',
    preparando:  'Em preparação',
    em_transito: 'Em trânsito / A caminho',
    entregue:    'Entregue ao destinatário'
  };
  return map[status] || status || 'Aguardando';
}

function formatPaymentMethod(metodo) {
  const map = {
    pix:            'Pix',
    cartao_credito: 'Cartão de Crédito',
    cartao_debito:  'Cartão de Débito'
  };
  return map[metodo] || metodo || '-';
}

async function carregarPedidos() {
  const loadingEl = $('orders-loading');
  const emptyEl   = $('orders-empty');
  const listEl    = $('orders-list');

  try {
    const res = await fetch(API_PEDIDOS, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (!res.ok) {
      throw new Error(`Falha ao carregar pedidos (${res.status})`);
    }

    const data = await res.json();
    const pedidos = data.pedidos || [];

    loadingEl.style.display = 'none';

    if (pedidos.length === 0) {
      emptyEl.style.display = 'flex';
      listEl.style.display  = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.style.display  = 'block';

    listEl.innerHTML = pedidos.map(pedido => {
      const itensHtml = (pedido.itens || []).map(item => `
        <tr>
          <td>${escapeHtml(item.produto)}</td>
          <td style="text-align: center;">${item.quantidade}</td>
          <td style="text-align: right;">${formatCurrency(item.preco_unitario)}</td>
          <td style="text-align: right; font-weight: 600; color: var(--clr-white);">
            ${formatCurrency(Number(item.preco_unitario) * Number(item.quantidade))}
          </td>
        </tr>
      `).join('');

      return `
        <article class="order-card" role="article" aria-label="Pedido #${pedido.id}">
          <header class="order-card__header">
            <div>
              <span class="order-card__id">Pedido #${String(pedido.id).padStart(4, '0')}</span>
              <span class="order-card__date">· Realizado em ${formatDate(pedido.criado_em)}</span>
            </div>
            <div>
              ${getStatusBadge(pedido.status)}
            </div>
          </header>

          <table class="order-items-table" aria-label="Itens do pedido">
            <thead>
              <tr>
                <th>Produto</th>
                <th style="text-align: center;">Qtd</th>
                <th style="text-align: right;">Preço Unit.</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itensHtml}
            </tbody>
          </table>

          <div class="order-card__meta">
            <div class="order-meta-item">
              <span>Entrega</span>
              <strong>${escapeHtml(pedido.rua)}, ${escapeHtml(pedido.numero)}</strong>
              <span>${escapeHtml(pedido.cidade)} - ${escapeHtml(pedido.estado)}</span>
              <span style="display: block; margin-top: 4px; color: var(--clr-accent);">
                Status: ${getEntregaStatusLabel(pedido.entrega?.status)}
              </span>
              ${pedido.entrega?.codigo_rastreio ? `<span style="display: block;">Rastreio: <code>${escapeHtml(pedido.entrega.codigo_rastreio)}</code></span>` : ''}
              ${pedido.entrega?.transportadora ? `<span>Transportadora: ${escapeHtml(pedido.entrega.transportadora)}</span>` : ''}
            </div>

            <div class="order-meta-item">
              <span>Pagamento</span>
              <strong>${formatPaymentMethod(pedido.pagamento?.metodo)}</strong>
              <span>Status: ${pedido.pagamento?.status === 'aprovado' ? 'Aprovado' : (pedido.pagamento?.status || 'Pendente')}</span>
              ${pedido.pagamento?.codigo_transacao ? `<span style="display: block; font-family: monospace; font-size: 11px;">Transação: ${escapeHtml(pedido.pagamento.codigo_transacao)}</span>` : ''}
            </div>

            <div class="order-meta-item" style="text-align: right;">
              <span>Total Pago</span>
              <strong style="font-size: var(--text-xl); color: var(--clr-accent-h);">
                ${formatCurrency(pedido.valor_total)}
              </strong>
            </div>
          </div>
        </article>
      `;
    }).join('');

  } catch (err) {
    loadingEl.style.display = 'none';
    emptyEl.style.display   = 'flex';
    emptyEl.innerHTML = `
      <h2 class="empty-state__title">Não foi possível carregar os pedidos</h2>
      <p class="empty-state__desc">${escapeHtml(err.message)}</p>
      <button class="btn btn--primary" onclick="window.location.reload()">Tentar novamente</button>
    `;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const usuario = await Auth.getSession();
  if (!usuario) {
    window.location.replace('/login.html?redirect=/pedidos.html');
    return;
  }
  Auth.updateHeaderAuth(usuario);

  await carregarPedidos();
});
