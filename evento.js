// ═══════════════════════════════════════════════════════
// Dentro de um evento — cabeçalho, abas e painel
// ═══════════════════════════════════════════════════════

import { buscarEvento, listarItens, minhaPermissao } from './nucleo.js';
import { esc, aviso, moeda, numero, periodo, iniciais, SITUACAO_EVENTO } from './ui.js';
import { abaProducao } from './producao.js';

export const contexto = { evento: null, permissao: null, itens: [], aba: 'painel' };

const ABAS = [
  { id: 'painel',      rotulo: 'Painel' },
  { id: 'producao',    rotulo: 'Produção' },
  { id: 'solicitacoes',rotulo: 'Solicitações', embreve: true },
  { id: 'receitas',    rotulo: 'Receitas',     embreve: true },
  { id: 'bilheteria',  rotulo: 'Bilheteria',   embreve: true },
];

export async function telaEvento(eventoId, aba = 'painel') {
  const alvo = document.querySelector('#conteudo');
  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Abrindo evento...</div>`;

  try {
    const [ev, perm] = await Promise.all([buscarEvento(eventoId), minhaPermissao(eventoId)]);
    contexto.evento = ev;
    contexto.permissao = perm;
    contexto.itens = await listarItens(eventoId);
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui abrir</h3><p>${esc(e.message)}</p></div>`;
    return;
  }

  contexto.aba = aba;
  desenhar();
}

export function recarregarAba() { desenhar(); }

export async function recarregarItens() {
  contexto.itens = await listarItens(contexto.evento.id);
  desenhar();
}

function desenhar() {
  const ev = contexto.evento;
  const sit = SITUACAO_EVENTO[ev.situacao] || SITUACAO_EVENTO.planejamento;
  const alvo = document.querySelector('#conteudo');

  alvo.innerHTML = `
    <button class="botao voltar" id="voltar">← Eventos</button>

    <div class="evento-cabeca">
      ${ev.logo_url
        ? `<img class="ec-logo" src="${esc(ev.logo_url)}" alt="">`
        : `<div class="ec-logo ec-vazia">${esc(iniciais(ev.nome))}</div>`}
      <div style="min-width:0;flex:1">
        <h1>${esc(ev.nome)}</h1>
        <div class="ec-meta">
          ${esc(periodo(ev.data_inicio, ev.data_fim))}
          ${ev.cidade ? ' · ' + esc(ev.cidade) : ''}
          ${ev.publico_estimado ? ' · ' + numero(ev.publico_estimado) + ' pessoas' : ''}
        </div>
      </div>
      <span class="etiqueta ${sit.classe}">${sit.rotulo}</span>
    </div>

    <nav class="abas">
      ${ABAS.map(a => `
        <button class="aba ${a.id === contexto.aba ? 'ativa' : ''} ${a.embreve ? 'embreve' : ''}"
                data-aba="${a.id}" ${a.embreve ? 'disabled' : ''}>
          ${esc(a.rotulo)}${a.embreve ? '<span class="tag-breve">em breve</span>' : ''}
        </button>`).join('')}
    </nav>

    <div id="aba-conteudo"></div>
  `;

  alvo.querySelector('#voltar').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('voltar-eventos'));
  });
  alvo.querySelectorAll('[data-aba]').forEach(b => {
    b.addEventListener('click', () => { contexto.aba = b.dataset.aba; desenhar(); });
  });

  const corpo = alvo.querySelector('#aba-conteudo');
  if (contexto.aba === 'producao') abaProducao(corpo);
  else abaPainel(corpo);
}

/* ── painel do evento ──────────────────────────────── */

function abaPainel(alvo) {
  const itens = contexto.itens.filter(i => i.situacao !== 'cancelado');
  const orcado = itens.reduce((a, i) => a + Number(i.valor_orcado || 0), 0);
  const referencia = itens.reduce((a, i) => a + Number(i.custo_referencia || 0), 0);
  const diferenca = orcado - referencia;
  const verbas = itens.filter(i => i.eh_verba);
  const faltaPrestar = verbas.reduce((a, i) => a + Number(i.falta_prestar || 0), 0);

  const porCategoria = {};
  itens.forEach(i => {
    const k = i.categoria_nome || 'Sem categoria';
    porCategoria[k] = (porCategoria[k] || 0) + Number(i.valor_orcado || 0);
  });
  const cats = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const maior = cats[0]?.[1] || 1;

  alvo.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:22px">
      <div class="metrica">
        <div class="rotulo">Orçado</div>
        <div class="valor">${moeda(orcado)}</div>
        <div class="rotulo" style="margin-top:2px">${numero(itens.length)} ${itens.length === 1 ? 'item' : 'itens'}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Evento anterior</div>
        <div class="valor" style="color:var(--texto-2)">${moeda(referencia)}</div>
        <div class="rotulo" style="margin-top:2px">referência de custo</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Diferença</div>
        <div class="valor" style="color:${diferenca > 0 ? 'var(--vermelho)' : 'var(--verde)'}">
          ${diferenca > 0 ? '+' : ''}${moeda(diferenca)}
        </div>
        <div class="rotulo" style="margin-top:2px">${referencia ? (diferenca >= 0 ? 'acima' : 'abaixo') + ' do ano anterior' : 'sem referência'}</div>
      </div>
      ${verbas.length ? `
        <div class="metrica">
          <div class="rotulo">Falta prestar contas</div>
          <div class="valor" style="color:${faltaPrestar > 0 ? 'var(--ambar)' : 'var(--verde)'}">${moeda(faltaPrestar)}</div>
          <div class="rotulo" style="margin-top:2px">${numero(verbas.length)} ${verbas.length === 1 ? 'verba' : 'verbas'}</div>
        </div>` : ''}
    </div>

    ${cats.length ? `
      <h2 style="font-size:15px;margin-bottom:12px">Orçado por categoria</h2>
      <div class="cartao">
        ${cats.map(([nome, valor]) => `
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;margin-bottom:4px">
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nome)}</span>
              <span class="num" style="font-weight:500">${moeda(valor)}</span>
            </div>
            <div style="height:6px;background:var(--superficie-2);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${Math.round(valor / maior * 100)}%;background:var(--acento);border-radius:3px"></div>
            </div>
          </div>`).join('')}
      </div>` : `
      <div class="vazio">
        <h3>Orçamento vazio</h3>
        <p>Comece cadastrando os itens na aba Produção, ou importe a planilha do evento anterior.</p>
        <button class="botao botao-primario" id="ir-producao">Ir para Produção</button>
      </div>`}
  `;

  alvo.querySelector('#ir-producao')?.addEventListener('click', () => {
    contexto.aba = 'producao'; desenhar();
  });
}
