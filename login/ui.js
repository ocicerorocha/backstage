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
  if (_privado) return 'R$ ••••';
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

/* ── seletor com cadastro rápido ───────────────────── */

/**
 * Liga um <select> de fornecedores à criação na hora.
 * Escolher "+ cadastrar fornecedor" abre um campo embutido:
 * digita o nome, salva, e já fica selecionado.
 *
 * A lista é compartilhada por referência, então todas as telas
 * abertas enxergam o fornecedor novo sem recarregar nada.
 */
export function ligarCadastroRapido(seletor, lista, aoCriar) {
  const sel = typeof seletor === 'string' ? document.querySelector(seletor) : seletor;
  if (!sel) return;

  const caixa = document.createElement('div');
  caixa.hidden = true;
  caixa.style.cssText = 'display:flex;gap:8px;margin-top:8px';
  caixa.innerHTML = `
    <input class="controle" placeholder="Nome do fornecedor" style="height:36px;font-size:14px;flex:1">
    <button type="button" class="botao" style="height:36px;font-size:13px">Salvar</button>
    <button type="button" class="botao" style="height:36px;font-size:13px">Cancelar</button>`;
  sel.parentNode.insertBefore(caixa, sel.nextSibling);

  const [campo, salvar, cancelar] = [
    caixa.querySelector('input'), caixa.querySelectorAll('button')[0], caixa.querySelectorAll('button')[1]];
  let anterior = sel.value;

  const fechar = () => { caixa.hidden = true; campo.value = ''; sel.value = anterior; };

  sel.addEventListener('change', () => {
    if (sel.value === '__novo') { caixa.hidden = false; campo.focus(); }
    else { anterior = sel.value; caixa.hidden = true; }
  });

  cancelar.addEventListener('click', fechar);
  campo.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); salvar.click(); }
    if (e.key === 'Escape') { e.preventDefault(); fechar(); }
  });

  salvar.addEventListener('click', async () => {
    const nome = campo.value.trim();
    if (!nome) return aviso('Informe o nome do fornecedor.', 'aviso');
    salvar.disabled = true;
    try {
      const novo = await aoCriar(nome);
      lista.push(novo);
      const opt = document.createElement('option');
      opt.value = novo.id; opt.textContent = novo.nome;
      sel.insertBefore(opt, sel.querySelector('option[value="__novo"]'));
      sel.value = novo.id; anterior = novo.id;
      caixa.hidden = true; campo.value = '';
      aviso('Fornecedor cadastrado.');
    } catch (e) {
      aviso(e.message, 'erro');
    } finally { salvar.disabled = false; }
  });
}

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
/* ── olhinho: oculta valores em dinheiro ───────────── */
// Começa ligado a cada carregamento: todo login abre oculto.
let _privado = true;
export function privadoAtivo() { return _privado; }
export function alternarPrivado() { _privado = !_privado; repintarView(); return _privado; }

// Registro da tela atual, para o olhinho repintar sem trocar de tela.
let _viewAtual = null;
export function registrarView(fn) { _viewAtual = fn; }
export function repintarView() { if (_viewAtual) _viewAtual(); }

/* ── máscara de moeda (formata enquanto digita) ────── */
// Aplique data-moeda no input (type text). Ex.: <input class="controle" data-moeda>
// Depois de montar o modal/tela, chame aplicarMascaraMoeda(container).
// Para ler o número, use lerMoeda(input).
export function aplicarMascaraMoeda(root) {
  const alvo = root || document;
  alvo.querySelectorAll('input[data-moeda]').forEach((inp) => {
    if (inp._moedaOn) return;
    inp._moedaOn = true;
    inp.setAttribute('type', 'text');
    inp.setAttribute('inputmode', 'numeric');
    const fmt = (cent) => (cent / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // valor inicial (número comum, ex. "1500.50") → centavos formatados
    const bruto = String(inp.value || '').trim().replace(',', '.');
    const iniC = bruto !== '' && !isNaN(Number(bruto)) ? Math.round(Number(bruto) * 100) : 0;
    inp.value = iniC > 0 ? fmt(iniC) : '';
    inp.addEventListener('input', () => {
      const d = inp.value.replace(/\D/g, '');
      const c = d ? parseInt(d, 10) : 0;
      inp.value = c > 0 ? fmt(c) : '';
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (_) {}
    });
  });
}

export function lerMoeda(input) {
  const d = String(input?.value || '').replace(/\D/g, '');
  return d ? parseInt(d, 10) / 100 : 0;
}
