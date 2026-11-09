/**
 * TechStore — Frontend Application
 * Integração com API: GET /api/produtos
 * Funcionalidades: catálogo, busca, ordenação, carrinho, toast, animações, sessão
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTES & CONFIGURAÇÃO
   ═══════════════════════════════════════════════════════════════════ */

const API_BASE = '/api';
const CART_KEY = 'techstore_cart';

/* Ícone SVG padrão para produtos sem imagem */
const PRODUCT_ICON_SVG = /* html */`
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="1.2"
       stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>`;

/* Mapeamento de ícones por categoria/nome de produto */
const PRODUCT_ICONS = {
  mouse:    `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" y1="3" x2="12" y2="9"/></svg>`,
  teclado:  `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>`,
  headset:  `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
  monitor:  `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  mousepad: `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="3"/><path d="M12 6v14M2 13h10"/></svg>`,
  default:  PRODUCT_ICON_SVG,
};

/* ═══════════════════════════════════════════════════════════════════
   ESTADO DA APLICAÇÃO
   ═══════════════════════════════════════════════════════════════════ */

const state = {
  products: [],       // Array completo da API
  filtered: [],       // Array após busca/ordenação
  cart: [],           // Itens no carrinho
  session: null,      // Usuário autenticado (ou null)
  loading: false,
  error: null,
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS DE DOM
   ═══════════════════════════════════════════════════════════════════ */

/** @param {string} id */
const $ = (id) => document.getElementById(id);

/** @param {string} sel @param {Element} [ctx] */
const $$ = (sel, ctx = document) => ctx.querySelector(sel);

/** Mostra um elemento removendo a classe 'hidden' */
function showEl(el) { el && el.classList.remove('catalog__state--hidden'); }

/** Esconde um elemento adicionando a classe 'hidden' */
function hideEl(el) { el && el.classList.add('catalog__state--hidden'); }

/* ═══════════════════════════════════════════════════════════════════
   FORMATADORES
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Formata valor decimal como moeda BRL.
 * @param {number|string} value
 * @returns {string}
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value));
}

/**
 * Calcula parcela em 12x.
 * @param {number|string} price
 * @returns {string}
 */
function formatInstallment(price) {
  const val = Number(price) / 12;
  return `12× de ${formatCurrency(val)}`;
}

/**
 * Retorna o ícone SVG mais adequado para o nome do produto.
 * @param {string} name
 * @returns {string} HTML string do SVG
 */
function getProductIcon(name) {
  const lower = name.toLowerCase();
  if (lower.includes('mousepad')) return PRODUCT_ICONS.mousepad;
  if (lower.includes('mouse'))    return PRODUCT_ICONS.mouse;
  if (lower.includes('teclado'))  return PRODUCT_ICONS.teclado;
  if (lower.includes('headset'))  return PRODUCT_ICONS.headset;
  if (lower.includes('monitor'))  return PRODUCT_ICONS.monitor;
  return PRODUCT_ICONS.default;
}

/**
 * Retorna texto e classe CSS do badge de estoque.
 * @param {number} estoque
 */
function getStockBadge(estoque) {
  const n = Number(estoque);
  if (n === 0) return { text: 'Esgotado',       cls: 'product-card__stock--out' };
  if (n <= 5)  return { text: `Últimas ${n} un.`, cls: 'product-card__stock--low' };
  return           { text: 'Em estoque',         cls: 'product-card__stock--ok'  };
}

/* ═══════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════════ */

let _toastTimer = null;

/**
 * Exibe uma notificação toast temporária.
 * @param {string} message
 * @param {'success'|'error'|''} [type='success']
 * @param {number} [duration=2800]
 */
function showToast(message, type = 'success', duration = 2800) {
  const toast = $('toast');
  if (!toast) return;

  clearTimeout(_toastTimer);

  toast.textContent = message;
  toast.className = `toast toast--${type} show`;

  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

/* ═══════════════════════════════════════════════════════════════════
   CARRINHO
   ═══════════════════════════════════════════════════════════════════ */

/** Carrega o carrinho do localStorage. */
function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    state.cart = raw ? JSON.parse(raw) : [];
  } catch {
    state.cart = [];
  }
}

/** Persiste o carrinho no localStorage. */
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

/** Calcula o total de itens no carrinho. */
function cartItemsCount() {
  return state.cart.reduce((acc, item) => acc + item.qty, 0);
}

/** Calcula o valor total do carrinho. */
function cartTotal() {
  return state.cart.reduce((acc, item) => acc + Number(item.preco) * item.qty, 0);
}

/**
 * Adiciona ou incrementa um produto no carrinho.
 * @param {object} product
 */
function addToCart(product) {
  const existing = state.cart.find((i) => i.id === product.id);
  const maxStock = Number(product.estoque);

  if (existing) {
    if (existing.qty >= maxStock) {
      showToast(`Estoque máximo atingido para "${product.nome}"`, 'error');
      return false;
    }
    existing.qty += 1;
  } else {
    state.cart.push({
      id:    product.id,
      nome:  product.nome,
      preco: product.preco,
      estoque: product.estoque,
      qty:   1,
    });
  }

  saveCart();
  renderCart();
  updateCartBadge();
  return true;
}

/**
 * Remove um item do carrinho.
 * @param {number} productId
 */
function removeFromCart(productId) {
  state.cart = state.cart.filter((i) => i.id !== productId);
  saveCart();
  renderCart();
  updateCartBadge();
}

/**
 * Altera a quantidade de um item.
 * @param {number} productId
 * @param {number} delta +1 ou -1
 */
function changeQty(productId, delta) {
  const item = state.cart.find((i) => i.id === productId);
  if (!item) return;

  const newQty = item.qty + delta;

  if (newQty < 1) {
    removeFromCart(productId);
    return;
  }

  if (newQty > Number(item.estoque)) {
    showToast('Quantidade máxima em estoque atingida.', 'error');
    return;
  }

  item.qty = newQty;
  saveCart();
  renderCart();
  updateCartBadge();
}

/** Atualiza o badge numérico do botão do carrinho no header. */
function updateCartBadge() {
  const badge = $('cart-count');
  if (!badge) return;

  const count = cartItemsCount();
  badge.textContent = count;

  badge.classList.remove('bump');
  void badge.offsetWidth; // force reflow
  badge.classList.add('bump');
}

/** Renderiza os itens do carrinho no drawer. */
function renderCart() {
  const cartEmpty   = $('cart-empty');
  const cartItemsEl = $('cart-items');
  const cartFooter  = $('cart-footer');
  const cartTotalEl = $('cart-total');

  if (!cartItemsEl) return;

  if (state.cart.length === 0) {
    cartEmpty.style.display = 'flex';
    cartItemsEl.style.display = 'none';
    cartFooter.setAttribute('aria-hidden', 'true');
    cartFooter.style.display = 'none';
    return;
  }

  cartEmpty.style.display = 'none';
  cartItemsEl.style.display = 'flex';
  cartFooter.removeAttribute('aria-hidden');
  cartFooter.style.display = 'flex';

  cartItemsEl.innerHTML = state.cart.map((item) => /* html */`
    <li class="cart-item" role="listitem" data-id="${item.id}">
      <div class="cart-item__img-wrap">
        <span class="cart-item__icon" aria-hidden="true">
          ${getProductIcon(item.nome)}
        </span>
      </div>
      <div class="cart-item__info">
        <span class="cart-item__name" title="${escapeHtml(item.nome)}">${escapeHtml(item.nome)}</span>
        <div class="cart-item__meta">
          <div class="cart-item__qty" role="group" aria-label="Quantidade de ${escapeHtml(item.nome)}">
            <button class="cart-item__qty-btn" data-action="dec" data-id="${item.id}"
                    aria-label="Diminuir quantidade">−</button>
            <span class="cart-item__qty-num" aria-live="polite">${item.qty}</span>
            <button class="cart-item__qty-btn" data-action="inc" data-id="${item.id}"
                    aria-label="Aumentar quantidade">+</button>
          </div>
          <span class="cart-item__price">${formatCurrency(Number(item.preco) * item.qty)}</span>
        </div>
      </div>
      <button class="cart-item__remove" data-id="${item.id}"
              aria-label="Remover ${escapeHtml(item.nome)} do carrinho">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </li>
  `).join('');

  if (cartTotalEl) {
    cartTotalEl.textContent = formatCurrency(cartTotal());
  }

  updateCartAuthFooter();
}

/**
 * Atualiza o rodapé do carrinho (botão de checkout e dica) com base na sessão.
 */
function updateCartAuthFooter() {
  const btnCheckout = $('btn-cart-checkout');
  const cartHint    = $('cart-hint');

  if (!btnCheckout || !cartHint) return;

  if (state.session) {
    const firstName = escapeHtml(state.session.nome.split(' ')[0]);
    btnCheckout.textContent = 'Finalizar compra';
    btnCheckout.href = '/checkout.html';
    btnCheckout.onclick = null;
    cartHint.textContent = `Logado como ${firstName} (${state.session.perfil === 'admin' ? 'Admin' : 'Cliente'})`;
  } else {
    btnCheckout.textContent = 'Finalizar compra';
    btnCheckout.href = '/login.html?redirect=/checkout.html';
    btnCheckout.onclick = null;
    cartHint.textContent = 'Faça login para concluir seu pedido';
  }
}

/** Abre o cart drawer. */
function openCart() {
  const drawer = $('cart-drawer');
  if (!drawer) return;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const closeBtn = $('btn-close-cart');
  if (closeBtn) closeBtn.focus();
}

/** Fecha o cart drawer. */
function closeCart() {
  const drawer = $('cart-drawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  $('btn-cart')?.focus();
}

/* ═══════════════════════════════════════════════════════════════════
   API — BUSCA DE PRODUTOS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Busca produtos na API e gerencia os estados de UI.
 */
async function fetchProducts() {
  if (state.loading) return;
  state.loading = true;
  state.error = null;

  showState('loading');

  try {
    const res = await fetch(`${API_BASE}/produtos`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',  // envia cookie de sessão
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.erro || `Erro ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    // A API retorna um array; garante tipagem correta
    if (!Array.isArray(data)) {
      throw new Error('Resposta inesperada da API.');
    }

    state.products = data;
    state.filtered = [...data];
    state.error = null;

    applyFilters(); // renderiza os cards

  } catch (err) {
    state.error = err.message;
    console.error('[TechStore] Erro ao buscar produtos:', err);

    const errorMessage = $('error-message');
    if (errorMessage) {
      errorMessage.textContent = err.message || 'Não foi possível carregar os produtos.';
    }

    showState('error');
  } finally {
    state.loading = false;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   FILTROS & ORDENAÇÃO
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Aplica busca e ordenação ao state.products e renderiza o grid.
 */
function applyFilters() {
  const query  = ($('search-input')?.value  || '').toLowerCase().trim();
  const sortBy = $('sort-select')?.value || 'default';

  // Filtra por texto
  let results = state.products.filter((p) => {
    const name = (p.nome       || '').toLowerCase();
    const desc = (p.descricao  || '').toLowerCase();
    return name.includes(query) || desc.includes(query);
  });

  // Ordena
  switch (sortBy) {
    case 'price-asc':
      results.sort((a, b) => Number(a.preco) - Number(b.preco));
      break;
    case 'price-desc':
      results.sort((a, b) => Number(b.preco) - Number(a.preco));
      break;
    case 'name-asc':
      results.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      break;
    case 'name-desc':
      results.sort((a, b) => b.nome.localeCompare(a.nome, 'pt-BR'));
      break;
    default:
      // Mantém ordem original da API
      break;
  }

  state.filtered = results;
  renderProducts();
}

/* ═══════════════════════════════════════════════════════════════════
   RENDERIZAÇÃO
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Controla qual estado de UI está visível no catálogo.
 * @param {'loading'|'error'|'empty'|'products'} which
 */
function showState(which) {
  ['loading', 'error', 'empty', 'products'].forEach((s) => {
    const el = $(`state-${s}`);
    if (el) {
      s === which ? showEl(el) : hideEl(el);
    }
  });
}

/**
 * Renderiza os cards de produto no grid.
 */
function renderProducts() {
  const grid = $('products-grid');
  const countEl = $('catalog-count');

  if (!grid) return;

  if (state.filtered.length === 0) {
    showState('empty');
    return;
  }

  showState('products');

  grid.innerHTML = state.filtered.map((product, idx) => buildProductCard(product, idx)).join('');

  if (countEl) {
    const total = state.products.length;
    const shown = state.filtered.length;
    countEl.textContent = shown === total
      ? `${total} produto${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`
      : `Exibindo ${shown} de ${total} produto${total !== 1 ? 's' : ''}`;
  }
}

/**
 * Constrói o HTML de um card de produto.
 * @param {object} product
 * @param {number} idx Índice para stagger de animação
 * @returns {string} HTML string
 */
function buildProductCard(product, idx) {
  const { nome, descricao, preco, estoque, id } = product;
  const stock   = getStockBadge(estoque);
  const isOut   = Number(estoque) === 0;
  const icon    = getProductIcon(nome);
  const price   = formatCurrency(preco);
  const install = formatInstallment(preco);

  return /* html */`
    <article class="product-card${isOut ? ' product-card--unavailable' : ''}"
             role="listitem"
             aria-label="${escapeHtml(nome)}"
             style="animation-delay:${Math.min(idx * 60, 480)}ms">

      <div class="product-card__img-wrap">
        <div class="product-card__icon-placeholder" aria-hidden="true">
          ${icon}
        </div>
        <span class="product-card__stock ${stock.cls}" aria-label="Disponibilidade: ${stock.text}">
          ${stock.text}
        </span>
      </div>

      <div class="product-card__body">
        <h3 class="product-card__name" title="${escapeHtml(nome)}">${escapeHtml(nome)}</h3>
        ${descricao ? `<p class="product-card__desc">${escapeHtml(descricao)}</p>` : ''}

        <div class="product-card__footer">
          <div class="product-card__price">
            <span class="product-card__price-value">${price}</span>
            <span class="product-card__installment">${install} sem juros</span>
          </div>
          <button
            class="product-card__add"
            data-id="${id}"
            data-name="${escapeHtml(nome)}"
            ${isOut ? 'disabled aria-disabled="true"' : ''}
            aria-label="${isOut ? `${escapeHtml(nome)} esgotado` : `Adicionar ${escapeHtml(nome)} ao carrinho`}"
            title="${isOut ? 'Produto esgotado' : 'Adicionar ao carrinho'}"
          >
            ${isOut
              ? /* html */`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
              : /* html */`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
            }
          </button>
        </div>
      </div>
    </article>
  `;
}

/* ═══════════════════════════════════════════════════════════════════
   SEGURANÇA — Escape HTML
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Escapa caracteres especiais para prevenir XSS.
 * @param {any} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/* ═══════════════════════════════════════════════════════════════════
   HEADER — Scroll & Nav Mobile
   ═══════════════════════════════════════════════════════════════════ */

function initHeader() {
  const header    = $('header');
  const navToggle = $('nav-toggle');
  const mainNav   = $('main-nav');

  // Scroll: adiciona classe .scrolled ao header
  const onScroll = () => {
    if (header) {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }

    // Destaca link ativo no nav
    highlightActiveNav();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile nav toggle
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Fecha ao clicar num link do nav
    mainNav.querySelectorAll('.nav__link').forEach((link) => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
      if (!header?.contains(e.target)) {
        mainNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

/** Destaca o link de nav correspondente à seção visível. */
function highlightActiveNav() {
  const sections = document.querySelectorAll('main [id]');
  const navLinks = document.querySelectorAll('.nav__link');
  const scrollY  = window.scrollY + 120;

  let current = '';
  sections.forEach((sec) => {
    if (sec.offsetTop <= scrollY) current = sec.id;
  });

  navLinks.forEach((link) => {
    link.classList.toggle(
      'active',
      link.getAttribute('href') === `#${current}`
    );
  });
}

/* ═══════════════════════════════════════════════════════════════════
   PARTICLES — Hero decoration
   ═══════════════════════════════════════════════════════════════════ */

function initParticles() {
  const container = $('hero-particles');
  if (!container) return;

  // Respeita preferência de movimento reduzido
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const COUNT = 18;

  for (let i = 0; i < COUNT; i++) {
    const p = document.createElement('span');
    p.className = 'hero__particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      bottom: ${Math.random() * 30}%;
      width: ${Math.random() * 3 + 2}px;
      height: ${Math.random() * 3 + 2}px;
      animation-duration: ${Math.random() * 8 + 6}s;
      animation-delay: ${Math.random() * 8}s;
    `;
    container.appendChild(p);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════════ */

function initEventListeners() {

  /* ── Busca ─────────────────────────────────────────────────────── */
  const searchInput = $('search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilters, 280);
    });
  }

  /* ── Ordenação ─────────────────────────────────────────────────── */
  const sortSelect = $('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', applyFilters);
  }

  /* ── Limpar busca ──────────────────────────────────────────────── */
  $('btn-clear-search')?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    if (sortSelect)  sortSelect.value  = 'default';
    applyFilters();
  });

  /* ── Tentar novamente ──────────────────────────────────────────── */
  $('btn-retry')?.addEventListener('click', fetchProducts);

  /* ── Adicionar ao carrinho (delegado no grid) ──────────────────── */
  $('products-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn || btn.disabled) return;

    const productId = Number(btn.dataset.id);
    const product   = state.products.find((p) => p.id === productId);
    if (!product) return;

    const added = addToCart(product);
    if (!added) return;

    // Feedback visual no botão
    btn.classList.add('added');
    setTimeout(() => btn.classList.remove('added'), 600);

    showToast(`"${product.nome}" adicionado ao carrinho!`, 'success');
    openCart();
  });

  /* ── Cart: abrir ───────────────────────────────────────────────── */
  $('btn-cart')?.addEventListener('click', openCart);

  /* ── Cart: fechar ──────────────────────────────────────────────── */
  $('btn-close-cart')?.addEventListener('click', closeCart);
  $('cart-backdrop')?.addEventListener('click', closeCart);
  $('btn-continue-shopping')?.addEventListener('click', () => {
    closeCart();
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
  });

  /* ── Cart: interações (delegado) ───────────────────────────────── */
  $('cart-items')?.addEventListener('click', (e) => {
    // Remover item
    const removeBtn = e.target.closest('.cart-item__remove');
    if (removeBtn) {
      const id = Number(removeBtn.dataset.id);
      const item = state.cart.find((i) => i.id === id);
      removeFromCart(id);
      if (item) showToast(`"${item.nome}" removido do carrinho.`);
      return;
    }

    // Alterar quantidade
    const qtyBtn = e.target.closest('.cart-item__qty-btn');
    if (qtyBtn) {
      const id    = Number(qtyBtn.dataset.id);
      const delta = qtyBtn.dataset.action === 'inc' ? 1 : -1;
      changeQty(id, delta);
    }
  });

  /* ── Fechar carrinho com Escape ────────────────────────────────── */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = $('cart-drawer');
      if (drawer?.classList.contains('open')) closeCart();
    }
  });

  /* ── Sincronização de autenticação ─────────────────────────────── */
  window.addEventListener('auth:change', (e) => {
    state.session = e.detail?.usuario || null;
    updateCartAuthFooter();
  });

  /* ── Footer: ano dinâmico ──────────────────────────────────────── */
  const yearEl = $('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* ═══════════════════════════════════════════════════════════════════
   INTERSECTION OBSERVER — Animações ao scroll
   ═══════════════════════════════════════════════════════════════════ */

function initScrollAnimations() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity  = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.feature-card, .stat__item').forEach((el) => {
    el.style.opacity  = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa componentes
  loadCart();
  updateCartBadge();
  renderCart();
  initHeader();
  initParticles();
  initEventListeners();
  initScrollAnimations();

  // Consulta sessão atual e atualiza a interface
  if (window.Auth && typeof window.Auth.initSession === 'function') {
    window.Auth.initSession().then((usuario) => {
      state.session = usuario;
      updateCartAuthFooter();
    });
  }

  // Busca produtos da API
  fetchProducts();
});
