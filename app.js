// ═══════════════════════════════════════════════════════
// Interface — avisos, modal, formatação
// ═══════════════════════════════════════════════════════

/* ── escape de texto ───────────────────────────────── */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ── avisos ────────────────────────────────────────── */
export function aviso(texto, tipo = 'sucesso', ms = 3400) {
  const caixa = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.textContent = texto;
  el.style.pointerEvents = 'auto';
  caixa.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ── modal ─────────────────────────────────────────── */
let aoFechar = null;

export function abrirModal(titulo, html, callbackFechar) {
  document.getElementById('modal-titulo').textContent = titulo;
  document.getElementById('modal-corpo').innerHTML = html;
  document.getElementById('modal').hidden = false;
  aoFechar = callbackFechar || null;
  document.body.style.overflow = 'hidden';
}

export function fecharModal() {
  document.getElementById('modal').hidden = true;
  document.getElementById('modal-corpo').innerHTML = '';
  document.body.style.overflow = '';
  if (aoFechar) { const f = aoFechar; aoFechar = null; f(); }
}

export function iniciarModal() {
  document.getElementById('modal-fechar').addEventListener('click', fecharModal);
  document.getElementById('modal').addEventListener('mousedown', e => {
    if (e.target.id === 'modal') fecharModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('modal').hidden) fecharModal();
  });
}

/* ── botão com estado de carregando ────────────────── */
export async function comBotao(botao, tarefa) {
  if (!botao) return tarefa();
  const original = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Aguarde...';
  try {
    return await tarefa();
  } finally {
    botao.disabled = false;
    botao.textContent = original;
  }
}

/* ── formatação ────────────────────────────────────── */
export function moeda(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function numero(v) {
  return (Number(v) || 0).toLocaleString('pt-BR');
}

/** '2026-06-19' → '19/06/2026' (sem passar por Date, para não escorregar de fuso) */
export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return (a && m && d) ? `${d}/${m}/${a}` : '';
}

/** Período legível: '19 a 24 jun 2026' */
export function periodo(inicio, fim) {
  if (!inicio && !fim) return 'Sem data definida';
  const mes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const partes = iso => {
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return { a, m: mes[Number(m) - 1], d: String(Number(d)) };
  };
  if (inicio && !fim) return `a partir de ${partes(inicio).d} ${partes(inicio).m} ${partes(inicio).a}`;
  if (!inicio && fim) return `até ${partes(fim).d} ${partes(fim).m} ${partes(fim).a}`;
  const i = partes(inicio), f = partes(fim);
  if (i.a === f.a && i.m === f.m) return `${i.d} a ${f.d} ${i.m} ${i.a}`;
  if (i.a === f.a) return `${i.d} ${i.m} a ${f.d} ${f.m} ${i.a}`;
  return `${i.d} ${i.m} ${i.a} a ${f.d} ${f.m} ${f.a}`;
}

export function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/);
  if (!p[0]) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export const SITUACAO_EVENTO = {
  planejamento: { rotulo: 'Planejamento', classe: 'etiqueta-neutra' },
  em_execucao:  { rotulo: 'Em execução',  classe: 'etiqueta-acento' },
  encerrado:    { rotulo: 'Encerrado',    classe: 'etiqueta-verde' },
};

/* ── tema ──────────────────────────────────────────── */
const CHAVE_TEMA = 'backstage:tema';

export function aplicarTema(tema) {
  if (tema === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro');
  else document.documentElement.removeAttribute('data-tema');
  try { localStorage.setItem(CHAVE_TEMA, tema); } catch (e) {}
}

export function temaAtual() {
  try { return localStorage.getItem(CHAVE_TEMA) || 'claro'; } catch (e) { return 'claro'; }
}

export function alternarTema() {
  const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  aplicarTema(novo);
  return novo;
}
