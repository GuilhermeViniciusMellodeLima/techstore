'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (window.Auth && typeof window.Auth.initLoginPage === 'function') {
    window.Auth.initLoginPage();
  } else {
    console.error('TechStore: módulo de autenticação não foi carregado.');
  }
});
