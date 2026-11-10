
/**
 * TechStore — Checkout Application
 * Fluxo completo de endereço, pagamento simulado e criação de pedidos.
 */

'use strict';

const API_PEDIDOS = '/api/pedidos';
const API_ENDERECOS = '/api/enderecos';
const CART_KEY = 'techstore_cart';

const PIX_DEMO_KEY = 'demo@techstore.invalid';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF',
  'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS',
  'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const state = {
  usuario: null,
  cart: [],
  selectedEnderecoId: null,
  temporaryAddress: null,
  selectedMetodo: 'pix',
  savedAddresses: [],
  showingNewAddressForm: false,
  submitting: false
};

const $ = (id) => document.getElementById(id);

/* ============================================================
   UTILITÁRIOS
   ============================================================ */

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(val));
}

function showToast(msg, type = 'success') {
  const toast = $('toast');

  if (!toast) return;

  toast.textContent = msg;
  toast.className = `toast toast--${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function showAlert(msg, type = 'error') {
  const el = $('checkout-alert');

  if (!el) return;

  el.textContent = msg;
  el.className = `auth-alert auth-alert--${type}`;

  el.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });
}

function hideAlert() {
  const el = $('checkout-alert');

  if (el) {
    el.className = 'auth-alert auth-alert--hidden';
  }
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

/* ============================================================
   CARRINHO
   ============================================================ */

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    state.cart = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.cart = [];
  }
}

function getCartTotal() {
  return state.cart.reduce((acc, item) => {
    return acc + Number(item.preco) * Number(item.qty);
  }, 0);
}

function renderSummary() {
  const listEl = $('summary-items-list');
  const subEl = $('summary-subtotal');
  const totalEl = $('summary-total');

  if (!listEl) return;

  const total = getCartTotal();

  listEl.innerHTML = state.cart.map(item => `
    <div class="summary-item" role="listitem">
      <span class="summary-item__name">
        ${escapeHtml(item.nome)}
        <span class="summary-item__qty">×${Number(item.qty)}</span>
      </span>

      <span class="summary-item__price">
        ${formatCurrency(Number(item.preco) * Number(item.qty))}
      </span>
    </div>
  `).join('');

  if (subEl) {
    subEl.textContent = formatCurrency(total);
  }

  if (totalEl) {
    totalEl.textContent = formatCurrency(total);
  }
}

/* ============================================================
   ENDEREÇOS
   ============================================================ */

function getStorageAddressKey() {
  return `techstore_addresses_${state.usuario ? state.usuario.id : 'anon'}`;
}

function loadSavedAddresses() {
  try {
    const raw = localStorage.getItem(getStorageAddressKey());
    const parsed = raw ? JSON.parse(raw) : [];

    state.savedAddresses = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.savedAddresses = [];
  }
}

function saveAddressLocally(addr) {
  const existing = state.savedAddresses.filter(a => {
    return Number(a.id) !== Number(addr.id);
  });

  existing.unshift(addr);
  state.savedAddresses = existing;

  try {
    localStorage.setItem(
      getStorageAddressKey(),
      JSON.stringify(existing)
    );
  } catch (err) {
    console.warn('Não foi possível salvar o endereço localmente:', err);
  }
}

function clearAddressErrors() {
  [
    'cep',
    'estado',
    'cidade',
    'rua',
    'numero'
  ].forEach(field => {
    const error = $(`err-${field}`);

    if (error) {
      error.textContent = '';
    }
  });
}

function getAddressFromForm() {
  clearAddressErrors();

  const cepEl = $('end-cep');
  const estadoEl = $('end-estado');
  const cidadeEl = $('end-cidade');
  const ruaEl = $('end-rua');
  const numeroEl = $('end-numero');
  const complementoEl = $('end-complemento');

  const endereco = {
    cep: (cepEl?.value || '').replace(/\D/g, ''),
    estado: (estadoEl?.value || '').trim().toUpperCase(),
    cidade: (cidadeEl?.value || '').trim(),
    rua: (ruaEl?.value || '').trim(),
    numero: (numeroEl?.value || '').trim(),
    complemento: (complementoEl?.value || '').trim()
  };

  if (endereco.cep.length !== 8) {
    $('err-cep').textContent = 'Informe um CEP válido com 8 dígitos.';
    cepEl?.focus();
    return null;
  }

  if (!UFS.includes(endereco.estado)) {
    $('err-estado').textContent = 'Selecione um estado válido.';
    estadoEl?.focus();
    return null;
  }

  if (!endereco.cidade || endereco.cidade.length > 100) {
    $('err-cidade').textContent = 'Informe uma cidade válida.';
    cidadeEl?.focus();
    return null;
  }

  if (!endereco.rua || endereco.rua.length > 150) {
    $('err-rua').textContent = 'Informe uma rua válida.';
    ruaEl?.focus();
    return null;
  }

  if (!endereco.numero || endereco.numero.length > 20) {
    $('err-numero').textContent = 'Informe um número válido.';
    numeroEl?.focus();
    return null;
  }

  if (endereco.complemento.length > 100) {
    showAlert('O complemento deve ter no máximo 100 caracteres.');
    complementoEl?.focus();
    return null;
  }

  endereco.complemento = endereco.complemento || null;

  return endereco;
}

function showAddressStatus(message) {
  const status = $('address-selection-status');

  if (status) {
    status.textContent = message;
  }
}

function renderSavedAddresses() {
  const container = $('saved-addresses-container');
  const listEl = $('saved-addresses-list');
  const formEl = $('form-endereco');

  if (!container || !listEl || !formEl) return;

  if (state.savedAddresses.length === 0) {
    container.style.display = 'none';
    formEl.style.display = 'block';
    return;
  }

  container.style.display = 'block';

  formEl.style.display = state.showingNewAddressForm
    ? 'block'
    : 'none';

  if (
    !state.selectedEnderecoId &&
    !state.temporaryAddress &&
    state.savedAddresses.length > 0
  ) {
    state.selectedEnderecoId = Number(state.savedAddresses[0].id);
  }

  listEl.innerHTML = state.savedAddresses.map(addr => {
    const selected =
      Number(state.selectedEnderecoId) === Number(addr.id);

    return `
      <label
        class="address-option ${selected ? 'selected' : ''}"
        data-id="${Number(addr.id)}">

        <input
          type="radio"
          name="endereco_selecionado"
          value="${Number(addr.id)}"
          ${selected ? 'checked' : ''} />

        <div class="address-option__info">
          <strong>
            ${escapeHtml(addr.rua)}, ${escapeHtml(addr.numero)}
            ${addr.complemento
              ? ' - ' + escapeHtml(addr.complemento)
              : ''}
          </strong>

          <span>
            ${escapeHtml(addr.cidade)} - ${escapeHtml(addr.estado)}
            | CEP ${escapeHtml(addr.cep)}
          </span>
        </div>
      </label>
    `;
  }).join('');

  listEl.querySelectorAll('.address-option').forEach(el => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.id);

      state.selectedEnderecoId = id;
      state.temporaryAddress = null;
      state.showingNewAddressForm = false;

      showAddressStatus('Endereço cadastrado selecionado para esta compra.');

      renderSavedAddresses();
    });
  });
}

/* ============================================================
   USAR ENDEREÇO SEM CADASTRAR
   ============================================================ */

function handleUsarEnderecoTemporario() {
  hideAlert();

  const endereco = getAddressFromForm();

  if (!endereco) return;

  state.temporaryAddress = endereco;
  state.selectedEnderecoId = null;
  state.showingNewAddressForm = false;

  if (state.savedAddresses.length > 0) {
    $('form-endereco').style.display = 'none';
  }

  showAddressStatus(
    `Endereço desta compra: ${endereco.rua}, ${endereco.numero} - ${endereco.cidade}/${endereco.estado}. Não será salvo na sua conta.`
  );

  renderSavedAddresses();

  showToast('Endereço temporário selecionado!', 'success');
}

/* ============================================================
   SALVAR ENDEREÇO NA CONTA
   ============================================================ */

async function handleSalvarEndereco() {
  if (state.submitting) return;

  hideAlert();

  const btnSalvar = $('btn-salvar-endereco');
  const endereco = getAddressFromForm();

  if (!endereco) return;

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
      body: JSON.stringify(endereco)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.erro || 'Não foi possível cadastrar o endereço.'
      );
    }

    if (!data.id) {
      throw new Error('A API não retornou o identificador do endereço.');
    }

    const novoEndereco = {
      ...endereco,
      id: Number(data.id)
    };

    saveAddressLocally(novoEndereco);

    state.selectedEnderecoId = novoEndereco.id;
    state.temporaryAddress = null;
    state.showingNewAddressForm = false;

    showAddressStatus('Endereço salvo na sua conta e selecionado para esta compra.');

    renderSavedAddresses();

    showToast('Endereço cadastrado com sucesso!', 'success');

  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar e usar este endereço';
    }
  }
}

/* ============================================================
   PAGAMENTO PIX SIMULADO
   ============================================================ */

function renderPixPayment() {
  const exp = $('payment-explanation');

  if (!exp) return;

  exp.innerHTML = `
    <div class="payment-form">
      <strong>Pagamento via Pix — demonstração</strong>

      <p>
        Esta é uma simulação acadêmica.
        Nenhuma transferência será realizada.
      </p>

      <div class="demo-warning">
        Não envie dinheiro para esta chave.
        Ela é fictícia e serve apenas para demonstrar o checkout.
      </div>

      <div class="demo-pix-key">
        <span>Chave Pix</span>
        <strong id="pix-key">${PIX_DEMO_KEY}</strong>
      </div>

      <button
        type="button"
        class="btn btn--outline btn--sm"
        id="btn-copiar-pix">
        Copiar chave
      </button>
    </div>
  `;

  $('btn-copiar-pix')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(PIX_DEMO_KEY);
      showToast('Chave fictícia copiada!', 'success');
    } catch {
      const temporaryInput = document.createElement('textarea');

      temporaryInput.value = PIX_DEMO_KEY;
      temporaryInput.style.position = 'fixed';
      temporaryInput.style.opacity = '0';

      document.body.appendChild(temporaryInput);
      temporaryInput.select();

      const copied = document.execCommand('copy');

      temporaryInput.remove();

      if (copied) {
        showToast('Chave fictícia copiada!', 'success');
      } else {
        showAlert('Não foi possível copiar a chave. Copie manualmente.');
      }
    }
  });
}

/* ============================================================
   FORMULÁRIO DE CARTÃO — SIMULAÇÃO
   ============================================================ */

function renderCardPayment() {
  const exp = $('payment-explanation');

  if (!exp) return;

  exp.innerHTML = `
    <div class="payment-form">

      <strong>Dados do cartão — ambiente de demonstração</strong>

      <div class="demo-warning">
        Pagamento simulado para fins acadêmicos.
        Nenhuma cobrança será realizada.
        Utilize dados fictícios para os testes.
      </div>

      <div class="form-group">
        <label class="form-label" for="card-holder">
          Nome do titular
        </label>

        <input
          type="text"
          id="card-holder"
          class="form-input"
          placeholder="NOME DO TITULAR"
          maxlength="80"
          autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="card-number">
          Número do cartão
        </label>

        <input
          type="text"
          id="card-number"
          class="form-input"
          placeholder="0000 0000 0000 0000"
          maxlength="19"
          inputmode="numeric"
          autocomplete="off" />
      </div>

      <div class="form-grid-2">

        <div class="form-group">
          <label class="form-label" for="card-expiry">
            Validade
          </label>

          <input
            type="text"
            id="card-expiry"
            class="form-input"
            placeholder="MM/AA"
            maxlength="5"
            inputmode="numeric"
            autocomplete="off" />
        </div>

        <div class="form-group">
          <label class="form-label" for="card-cvv">
            CVV
          </label>

          <input
            type="password"
            id="card-cvv"
            class="form-input"
            placeholder="123"
            maxlength="4"
            inputmode="numeric"
            autocomplete="off" />
        </div>

      </div>

      <p style="font-size: 12px; color: var(--clr-text-muted);">
        Os dados são utilizados somente para validar esta
        demonstração no navegador. O número completo,
        a validade e o CVV não serão enviados ao servidor.
      </p>

    </div>
  `;

  const numberInput = $('card-number');
  const expiryInput = $('card-expiry');
  const cvvInput = $('card-cvv');

  numberInput?.addEventListener('input', () => {
    let value = numberInput.value.replace(/\D/g, '').slice(0, 16);

    numberInput.value = value.replace(/(\d{4})(?=\d)/g, '$1 ');
  });

  expiryInput?.addEventListener('input', () => {
    let value = expiryInput.value.replace(/\D/g, '').slice(0, 4);

    if (value.length > 2) {
      value = `${value.slice(0, 2)}/${value.slice(2)}`;
    }

    expiryInput.value = value;
  });

  cvvInput?.addEventListener('input', () => {
    cvvInput.value = cvvInput.value.replace(/\D/g, '').slice(0, 4);
  });
}

function validateCardPayment() {
  const holder = ($('card-holder')?.value || '').trim();
  const number = ($('card-number')?.value || '').replace(/\D/g, '');
  const expiry = ($('card-expiry')?.value || '').trim();
  const cvv = ($('card-cvv')?.value || '').trim();

  if (!holder || holder.length > 80) {
    showAlert('Informe o nome do titular do cartão.');
    $('card-holder')?.focus();
    return null;
  }

  if (!/^\d{16}$/.test(number)) {
    showAlert('Informe um número de cartão com exatamente 16 dígitos.');
    $('card-number')?.focus();
    return null;
  }

  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
    showAlert('Informe uma validade no formato MM/AA.');
    $('card-expiry')?.focus();
    return null;
  }

  const [monthText, yearText] = expiry.split('/');

  const month = Number(monthText);
  const year = 2000 + Number(yearText);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (
    year < currentYear ||
    (year === currentYear && month < currentMonth)
  ) {
    showAlert('A validade do cartão precisa estar no futuro.');
    $('card-expiry')?.focus();
    return null;
  }

  if (!/^\d{3,4}$/.test(cvv)) {
    showAlert('Informe um CVV com 3 ou 4 dígitos.');
    $('card-cvv')?.focus();
    return null;
  }

  return {
    cartao_final: number.slice(-4)
  };
}

/* ============================================================
   SELEÇÃO DO MÉTODO DE PAGAMENTO
   ============================================================ */

function initPaymentMethods() {
  const methods = [
    {
      id: 'method-pix',
      value: 'pix'
    },
    {
      id: 'method-credito',
      value: 'cartao_credito'
    },
    {
      id: 'method-debito',
      value: 'cartao_debito'
    }
  ];

  methods.forEach(method => {
    const card = $(method.id);

    if (!card) return;

    card.addEventListener('click', () => {
      methods.forEach(other => {
        const otherCard = $(other.id);

        otherCard?.classList.remove('selected');

        const radio = otherCard?.querySelector('input[type="radio"]');

        if (radio) {
          radio.checked = false;
        }
      });

      card.classList.add('selected');

      const radio = card.querySelector('input[type="radio"]');

      if (radio) {
        radio.checked = true;
      }

      state.selectedMetodo = method.value;

      if (method.value === 'pix') {
        renderPixPayment();
      } else {
        renderCardPayment();
      }

      hideAlert();
    });
  });

  renderPixPayment();
}

/* ============================================================
   FINALIZAR PEDIDO
   ============================================================ */

async function handleFinalizarPedido() {
  if (state.submitting) return;

  hideAlert();

  /* 1. Verifica endereço */

  if (!state.selectedEnderecoId && !state.temporaryAddress) {
    showAlert(
      'Selecione um endereço cadastrado ou informe um endereço para esta compra.',
      'error'
    );

    $('heading-endereco')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });

    return;
  }

  /* 2. Verifica carrinho */

  if (!Array.isArray(state.cart) || state.cart.length === 0) {
    showAlert('Adicione produtos ao seu carrinho antes de finalizar.');
    return;
  }

  const itens = state.cart.map(item => ({
    produto_id: Number(item.id),
    quantidade: Number(item.qty)
  }));

  if (itens.some(item => {
    return (
      !Number.isInteger(item.produto_id) ||
      item.produto_id <= 0 ||
      !Number.isInteger(item.quantidade) ||
      item.quantidade <= 0
    );
  })) {
    showAlert('O carrinho contém um produto ou quantidade inválida.');
    return;
  }

  /* 3. Monta endereço */

  const payload = {
    itens,
    metodo: state.selectedMetodo
  };

  if (state.selectedEnderecoId) {
    payload.endereco_id = Number(state.selectedEnderecoId);
  } else {
    payload.endereco = state.temporaryAddress;
  }

  /* 4. Valida cartão, se necessário */

  if (
    state.selectedMetodo === 'cartao_credito' ||
    state.selectedMetodo === 'cartao_debito'
  ) {
    const cardData = validateCardPayment();

    if (!cardData) return;

    payload.cartao_final = cardData.cartao_final;
  }

  /* 5. Envia pedido */

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
      throw new Error(
        data.erro || `Erro ao processar pedido (${res.status}).`
      );
    }

    if (!data.pedido || !data.pedido.id) {
      throw new Error('A API não retornou os dados do pedido.');
    }

    const pedido = data.pedido;

    /* 6. Limpa carrinho */

    localStorage.removeItem(CART_KEY);

    state.cart = [];

    /* 7. Preenche modal */

    $('modal-order-id').textContent =
      `#${String(pedido.id).padStart(4, '0')}`;

    $('modal-order-total').textContent =
      formatCurrency(pedido.valor_total);

    $('modal-order-metodo').textContent =
      pedido.metodo_pagamento === 'pix'
        ? 'Pix'
        : pedido.metodo_pagamento === 'cartao_credito'
          ? 'Cartão de Crédito'
          : 'Cartão de Débito';

    $('modal-order-txn').textContent =
      pedido.codigo_transacao || 'SIM-...';

    /* 8. Mostra confirmação */

    const modal = $('modal-confirmacao');

    if (modal) {
      modal.classList.add('open');
    }

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

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    /* 1. Autenticação */

    const usuario = await Auth.getSession();

    if (!usuario) {
      window.location.replace('/login.html?redirect=/checkout.html');
      return;
    }

    state.usuario = usuario;

    Auth.updateHeaderAuth(usuario);

    /* 2. Carrinho */

    loadCart();

    if (state.cart.length === 0) {
      $('checkout-empty').style.display = 'flex';
      $('checkout-content').style.display = 'none';
      return;
    }

    $('checkout-empty').style.display = 'none';
    $('checkout-content').style.display = 'grid';

    renderSummary();

    /* 3. Endereços */

    loadSavedAddresses();

    renderSavedAddresses();

    /* 4. Máscara CEP */

    const cepInput = $('end-cep');

    if (cepInput) {
      cepInput.addEventListener('input', () => {
        let value = cepInput.value.replace(/\D/g, '').slice(0, 8);

        if (value.length > 5) {
          value = `${value.slice(0, 5)}-${value.slice(5)}`;
        }

        cepInput.value = value;
      });
    }

    /* 5. Botão usar endereço temporário */

    $('btn-usar-endereco')?.addEventListener(
      'click',
      handleUsarEnderecoTemporario
    );

    /* 6. Botão salvar endereço */

    $('btn-salvar-endereco')?.addEventListener(
      'click',
      handleSalvarEndereco
    );

    /* 7. Mostrar formulário de novo endereço */

    $('btn-show-new-address')?.addEventListener('click', () => {
      state.showingNewAddressForm = true;

      state.selectedEnderecoId = null;
      state.temporaryAddress = null;

      showAddressStatus('Informe um endereço para esta compra.');

      $('form-endereco').style.display = 'block';

      renderSavedAddresses();

      $('form-endereco').scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    });

    /* 8. Pagamento */

    initPaymentMethods();

    /* 9. Finalizar pedido */

    $('btn-finalizar-pedido')?.addEventListener(
      'click',
      handleFinalizarPedido
    );

  } catch (err) {
    console.error('Erro ao inicializar checkout:', err);

    showAlert(
      'Não foi possível carregar o checkout. Atualize a página e tente novamente.'
    );
  }
});
