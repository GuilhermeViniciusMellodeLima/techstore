/**
 * TechStore — Checkout Application
 * Fluxo completo de endereço, seleção de pagamento e criação de pedidos.
 */

'use strict';

const API_PEDIDOS   = '/api/pedidos';
const API_ENDERECOS = '/api/enderecos';
const CART_KEY      = 'techstore_cart';

const state = {
  usuario: null,
  cart: [],
  selectedEnderecoId: null,
  selectedMetodo: 'pix',
  savedAddresses: [],
  submitting: false
};

const $ = (id) => document.getElementById(id);

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(val));
}

function showToast(msg, type = 'success') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast toast--${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function showAlert(msg, type = 'error') {
  const el = $('checkout-alert');
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-alert auth-alert--${type}`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAlert() {
  const el = $('checkout-alert');
  if (el) el.className = 'auth-alert auth-alert--hidden';
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    state.cart = raw ? JSON.parse(raw) : [];
  } catch {
    state.cart = [];
  }
}

function getCartTotal() {
  return state.cart.reduce((acc, item) => acc + Number(item.preco) * item.qty, 0);
}

function renderSummary() {
  const listEl  = $('summary-items-list');
  const subEl   = $('summary-subtotal');
  const totalEl = $('summary-total');

  if (!listEl) return;

  const total = getCartTotal();

  listEl.innerHTML = state.cart.map(item => `
    <div class="summary-item" role="listitem">
      <span class="summary-item__name">
        ${escapeHtml(item.nome)}
        <span class="summary-item__qty">×${item.qty}</span>
      </span>
      <span class="summary-item__price">${formatCurrency(Number(item.preco) * item.qty)}</span>
    </div>
  `).join('');

  if (subEl)   subEl.textContent   = formatCurrency(total);
  if (totalEl) totalEl.textContent = formatCurrency(total);
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

/* ═══════════════════════════════════════════════════════════════════
   ENDEREÇOS
   ═══════════════════════════════════════════════════════════════════ */

function getStorageAddressKey() {
  return `techstore_addresses_${state.usuario ? state.usuario.id : 'anon'}`;
}

function loadSavedAddresses() {
  try {
    const raw = localStorage.getItem(getStorageAddressKey());
    state.savedAddresses = raw ? JSON.parse(raw) : [];
  } catch {
    state.savedAddresses = [];
  }
}

function saveAddressLocally(addr) {
  const existing = state.savedAddresses.filter(a => a.id !== addr.id);
  existing.unshift(addr);
  state.savedAddresses = existing;
  try {
    localStorage.setItem(getStorageAddressKey(), JSON.stringify(existing));
  } catch {}
}

function renderSavedAddresses() {
  const container = $('saved-addresses-container');
  const listEl    = $('saved-addresses-list');
  const formEl    = $('form-endereco');

  if (!container || !listEl) return;

  if (state.savedAddresses.length === 0) {
    container.style.display = 'none';
    formEl.style.display    = 'block';
    return;
  }

  container.style.display = 'block';

  // Se o formulário não estiver sendo editado propositalmente, podemos mantê-lo recolhido
  if (!state.showingNewAddressForm) {
    formEl.style.display = 'none';
  } else {
    formEl.style.display = 'block';
  }

  if (!state.selectedEnderecoId && state.savedAddresses.length > 0) {
    state.selectedEnderecoId = state.savedAddresses[0].id;
  }

  listEl.innerHTML = state.savedAddresses.map(addr => `
    <label class="address-option ${state.selectedEnderecoId === addr.id ? 'selected' : ''}" data-id="${addr.id}">
      <input type="radio" name="endereco_selecionado" value="${addr.id}" ${state.selectedEnderecoId === addr.id ? 'checked' : ''} />
      <div class="address-option__info">
        <strong>${escapeHtml(addr.rua)}, ${escapeHtml(addr.numero)}${addr.complemento ? ' - ' + escapeHtml(addr.complemento) : ''}</strong>
        <span>${escapeHtml(addr.cidade)} - ${escapeHtml(addr.estado)} | CEP ${escapeHtml(addr.cep)}</span>
      </div>
    </label>
  `).join('');

  listEl.querySelectorAll('.address-option').forEach(el => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.id);
      state.selectedEnderecoId = id;
      renderSavedAddresses();
    });
  });
}

async function handleSalvarEndereco() {
  hideAlert();
  const cepEl    = $('end-cep');
  const estEl    = $('end-estado');
  const cidEl    = $('end-cidade');
  const ruaEl    = $('end-rua');
  const numEl    = $('end-numero');
  const compEl   = $('end-complemento');
  const btnSalvar = $('btn-salvar-endereco');

  const cepLimpo = (cepEl?.value || '').replace(/\D/g, '');
  const estado   = (estEl?.value || '').trim().toUpperCase();
  const cidade   = (cidEl?.value || '').trim();
  const rua      = (ruaEl?.value || '').trim();
  const numero   = (numEl?.value || '').trim();
  const complemento = (compEl?.value || '').trim();

  // Validação
  if (cepLimpo.length !== 8) {
    $('err-cep').textContent = 'Informe um CEP válido com 8 dígitos.';
    cepEl?.focus();
    return;
  } else {
    $('err-cep').textContent = '';
  }

  if (!/^[A-Za-z]{2}$/.test(estado)) {
    $('err-estado').textContent = 'Informe uma sigla de UF válida (ex: SP).';
    estEl?.focus();
    return;
  } else {
    $('err-estado').textContent = '';
  }

  if (!cidade) {
    $('err-cidade').textContent = 'Informe a cidade.';
    cidEl?.focus();
    return;
  } else {
    $('err-cidade').textContent = '';
  }

  if (!rua) {
    $('err-rua').textContent = 'Informe a rua / logradouro.';
    ruaEl?.focus();
    return;
  } else {
    $('err-rua').textContent = '';
  }

  if (!numero) {
    $('err-numero').textContent = 'Informe o número.';
    numEl?.focus();
    return;
  } else {
    $('err-numero').textContent = '';
  }

  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando endereço...';
  }

  try {
    const res = await fetch(API_ENDERECOS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        cep: cepLimpo,
        estado,
        cidade,
        rua,
        numero,
        complemento: complemento || null
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.erro || 'Não foi possível cadastrar o endereço.');
    }

    const novoEndereco = {
      id: Number(data.id),
      cep: cepLimpo,
      estado,
      cidade,
      rua,
      numero,
      complemento
    };

    saveAddressLocally(novoEndereco);
    state.selectedEnderecoId = novoEndereco.id;
    state.showingNewAddressForm = false;

    showToast('Endereço cadastrado com sucesso!', 'success');
    renderSavedAddresses();

  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar e Usar este Endereço';
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MÉTODOS DE PAGAMENTO
   ═══════════════════════════════════════════════════════════════════ */

function initPaymentMethods() {
  const methods = [
    { id: 'method-pix', value: 'pix', desc: '<strong>Pagamento via Pix:</strong> O pedido será aprovado e reservado imediatamente no sistema.' },
    { id: 'method-credito', value: 'cartao_credito', desc: '<strong>Cartão de Crédito:</strong> Pagamento simulado com aprovação imediata em ambiente de homologação.' },
    { id: 'method-debito', value: 'cartao_debito', desc: '<strong>Cartão de Débito:</strong> Pagamento simulado à vista com aprovação imediata.' }
  ];

  methods.forEach(m => {
    const card = $(m.id);
    if (!card) return;
    card.addEventListener('click', () => {
      methods.forEach(other => {
        $(other.id)?.classList.remove('selected');
        const r = $(other.id)?.querySelector('input[type="radio"]');
        if (r) r.checked = false;
      });
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      state.selectedMetodo = m.value;
      const exp = $('payment-explanation');
      if (exp) exp.innerHTML = m.desc;
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   FINALIZAR PEDIDO (POST /api/pedidos)
   ═══════════════════════════════════════════════════════════════════ */

async function handleFinalizarPedido() {
  if (state.submitting) return;
  hideAlert();

  // 1. Validação de Endereço
  if (!state.selectedEnderecoId) {
    showAlert('Selecione ou cadastre um endereço de entrega para prosseguir.', 'error');
    $('heading-endereco')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  // 2. Validação do Carrinho
  if (!state.cart || state.cart.length === 0) {
    showAlert('Adicione produtos ao seu carrinho antes de finalizar.', 'error');
    return;
  }

  // Prepara itens no formato exato da API: [{ produto_id: INT, quantidade: INT }]
  const itens = state.cart.map(item => ({
    produto_id: Number(item.id),
    quantidade: Number(item.qty)
  }));

  const payload = {
    endereco_id: Number(state.selectedEnderecoId),
    itens,
    metodo: state.selectedMetodo
  };

  const btnFinalizar = $('btn-finalizar-pedido');
  state.submitting = true;
  if (btnFinalizar) {
    btnFinalizar.classList.add('btn--loading');
    btnFinalizar.disabled = true;
  }

  try {
    const res = await fetch(API_PEDIDOS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.erro || `Erro ao processar pedido (${res.status})`);
    }

    const { pedido } = data;

    // Limpa o carrinho
    localStorage.removeItem(CART_KEY);
    state.cart = [];

    // Preenche o Modal de Confirmação
    $('modal-order-id').textContent    = `#${String(pedido.id).padStart(4, '0')}`;
    $('modal-order-total').textContent = formatCurrency(pedido.valor_total);
    $('modal-order-metodo').textContent = pedido.metodo_pagamento === 'pix' ? 'Pix' :
      pedido.metodo_pagamento === 'cartao_credito' ? 'Cartão de Crédito' : 'Cartão de Débito';
    $('modal-order-txn').textContent   = pedido.codigo_transacao || '-';

    // Exibe o modal
    const modal = $('modal-confirmacao');
    if (modal) modal.classList.add('open');

  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    state.submitting = false;
    if (btnFinalizar) {
      btnFinalizar.classList.remove('btn--loading');
      btnFinalizar.disabled = false;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   INICIALIZAÇÃO
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Checa autenticação
  const usuario = await Auth.getSession();
  if (!usuario) {
    // Redireciona para o login informando a URL de retorno
    window.location.replace('/login.html?redirect=/checkout.html');
    return;
  }
  state.usuario = usuario;
  Auth.updateHeaderAuth(usuario);

  // 2. Carrega carrinho
  loadCart();
  if (state.cart.length === 0) {
    $('checkout-empty').style.display   = 'flex';
    $('checkout-content').style.display = 'none';
    return;
  }

  $('checkout-empty').style.display   = 'none';
  $('checkout-content').style.display = 'grid';
  renderSummary();

  // 3. Carrega endereços
  loadSavedAddresses();
  renderSavedAddresses();

  // Máscara de CEP
  const cepInput = $('end-cep');
  if (cepInput) {
    cepInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 8);
      if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5)}`;
      e.target.value = v;
    });
  }

  // Botões de endereço
  $('btn-salvar-endereco')?.addEventListener('click', handleSalvarEndereco);
  $('btn-show-new-address')?.addEventListener('click', () => {
    state.showingNewAddressForm = true;
    $('form-endereco').style.display = 'block';
    $('form-endereco').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Métodos de pagamento
  initPaymentMethods();

  // Botão de finalizar pedido
  $('btn-finalizar-pedido')?.addEventListener('click', handleFinalizarPedido);
});
