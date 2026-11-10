'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const email = document.getElementById('cad-email');
  const nome = document.getElementById('cad-nome');

  // Padroniza o e-mail em letras minúsculas e sem espaços.
  if (email) {
    email.addEventListener('input', () => {
      email.value = email.value.replace(/\s/g, '').toLowerCase();
    });
  }

  // Remove espaços duplicados do nome ao sair do campo.
  if (nome) {
    nome.addEventListener('blur', () => {
      nome.value = nome.value.trim().replace(/\s+/g, ' ');
    });
  }

  // Inicializa as validações, máscaras e envio do formulário.
  if (window.Auth) {
    Auth.initCadastroPage();
  } else {
    console.error('TechStore: módulo de autenticação não foi carregado.');
  }
});
