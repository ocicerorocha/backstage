// ═══════════════════════════════════════════════════════
// Dentro de um evento — cabeçalho, abas e painel
// ═══════════════════════════════════════════════════════

import { buscarEvento, listarItens, minhaPermissao, andamentoItens } from './nucleo.js';
import { esc, aviso, moeda, numero, periodo, dataBR, iniciais, SITUACAO_EVENTO } from './ui.js';
import { abaProducao } from './producao.js';
import { abaSolicitacoes, abaAprovacoes } from './solicitacoes.js';
import { abaReceitas } from './receitas.js';

export const contexto = { evento: null, permissao: null, itens: [], aba: 'painel' };

const ABAS = [
  { id: 'painel',       rotulo: 'Painel' },
  { id: 'producao',     rotulo: 'Produção' },
  { id: 'solicitacoes', rotulo: 'Solicitações' },
  { id: 'aprovacoes',   rotulo: 'Aprovações', perm: 'aprovar_pagamento' },
  { id: 'receitas',     rotulo: 'Receitas',   perm: 'ver_receitas' },
  { id: 'bilheteria',   rotulo: 'Bilheteria', embreve: true },
];

function abasVisiveis() {
  const p = contexto.permissao || {};
  return ABAS.filter(a => !a.perm || p.admin || p[a.perm]);
}

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
      ${abasVisiveis().map(a => `
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
  if (contexto.aba === 'producao')          abaProducao(corpo);
  else if (contexto.aba === 'solicitacoes') abaSolicitacoes(corpo);
  else if (contexto.aba === 'aprovacoes')   abaAprovacoes(corpo);
  else if (contexto.aba === 'receitas')     abaReceitas(corpo);
  else                                       abaPainel(corpo);
}

/* ── painel do evento ──────────────────────────────── */

// Selo pequeno de seção ainda por vir (depende de outra fase).
function selo(texto) {
  return `<span class="etiqueta etiqueta-neutra" style="font-size:11px;margin-left:6px">${texto}</span>`;
}
function pontinho(cor) {
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${cor};margin-right:5px;vertical-align:middle"></span>`;
}

async function abaPainel(alvo) {
  const ev = contexto.evento;
  const itens = contexto.itens.filter(i => i.situacao !== 'cancelado');

  // sem itens: convida a começar, sem painel
  if (!itens.length) {
    alvo.innerHTML = `
      <div class="vazio">
        <h3>Orçamento vazio</h3>
        <p>Comece cadastrando os itens na aba Produção, ou importe a planilha do evento anterior.</p>
        <button class="botao botao-primario" id="ir-producao">Ir para Produção</button>
      </div>`;
    alvo.querySelector('#ir-producao')?.addEventListener('click', () => {
      contexto.aba = 'producao'; desenhar();
    });
    return;
  }

  alvo.innerHTML = `<div style="padding:30px;text-align:center;color:var(--texto-2)">Carregando painel...</div>`;

  // andamento financeiro por item (solicitado, pago, em fluxo)
  const andamento = {};
  try {
    (await andamentoItens(ev.id)).forEach(a => { andamento[a.item_id] = a; });
  } catch (e) { /* segue sem o financeiro; o orçamento ainda aparece */ }

  // ── números ──
  const orcado = itens.reduce((a, i) => a + Number(i.valor_orcado || 0), 0);
  const referencia = itens.reduce((a, i) => a + Number(i.custo_referencia || 0), 0);
  const diferenca = orcado - referencia;

  let solicitado = 0, pago = 0;
  itens.forEach(i => {
    const a = andamento[i.id];
    solicitado += Number(a?.solicitado || 0);
    pago += Number(a?.pago || 0);
  });
  const emAberto = Math.max(solicitado - pago, 0);
  const aSolicitar = Math.max(orcado - solicitado, 0);
  const pct = v => orcado > 0 ? Math.max(0, Math.min(100, v / orcado * 100)) : 0;

  // por categoria: orçado (trilha) e pago (preenchimento)
  const porCategoria = {};
  itens.forEach(i => {
    const k = i.categoria_nome || 'Sem categoria';
    if (!porCategoria[k]) porCategoria[k] = { orcado: 0, pago: 0 };
    porCategoria[k].orcado += Number(i.valor_orcado || 0);
    porCategoria[k].pago += Number(andamento[i.id]?.pago || 0);
  });
  const cats = Object.entries(porCategoria).sort((a, b) => b[1].orcado - a[1].orcado);

  // contagem regressiva
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ini = ev.data_inicio ? new Date(ev.data_inicio + 'T00:00:00') : null;
  const dias = ini ? Math.round((ini - hoje) / 86400000) : null;

  alvo.innerHTML = `
    ${ini ? `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <div class="cartao" style="padding:10px 22px;text-align:center;min-width:118px">
          <div class="rotulo">${dias > 0 ? 'Faltam' : dias === 0 ? '' : 'Começou há'}</div>
          <div style="font-size:34px;font-weight:600;line-height:1.05">${dias === 0 ? 'Hoje' : numero(Math.abs(dias))}</div>
          <div class="rotulo">${dias === 0 ? dataBR(ev.data_inicio) : 'dias · ' + dataBR(ev.data_inicio)}</div>
        </div>
      </div>` : ''}

    <h2 style="font-size:15px;margin:6px 0 10px">Resultado ${selo('Fase 4')}</h2>
    <div class="cartao" style="color:var(--texto-2);font-size:14px">
      Disponível quando o módulo de Receitas entrar: <strong>previsto</strong> (receita − orçado) e <strong>real</strong> (recebido − pago).
    </div>

    <h2 style="font-size:15px;margin:24px 0 10px">Orçamento</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
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
    </div>

    <h2 style="font-size:15px;margin:24px 0 10px">Fluxo de pagamento</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
      <div class="metrica">
        <div class="rotulo">Solicitado</div>
        <div class="valor">${moeda(solicitado)}</div>
        <div class="rotulo" style="margin-top:2px">comprometido</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Pago</div>
        <div class="valor" style="color:var(--verde)">${moeda(pago)}</div>
        <div class="rotulo" style="margin-top:2px">já saiu do caixa</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Em aberto</div>
        <div class="valor" style="color:var(--ambar)">${moeda(emAberto)}</div>
        <div class="rotulo" style="margin-top:2px">solicitado e não pago</div>
      </div>
    </div>
    <div style="margin-top:12px">
      <div style="display:flex;height:16px;border-radius:5px;overflow:hidden;background:var(--superficie-2)">
        <div style="width:${pct(pago)}%;background:var(--verde)"></div>
        <div style="width:${pct(emAberto)}%;background:var(--ambar)"></div>
        <div style="width:${pct(aSolicitar)}%;background:var(--texto-3)"></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:8px;font-size:12px;color:var(--texto-2)">
        <span>${pontinho('var(--verde)')}Pago · ${moeda(pago)}</span>
        <span>${pontinho('var(--ambar)')}Em aberto · ${moeda(emAberto)}</span>
        <span>${pontinho('var(--texto-3)')}A solicitar · ${moeda(aSolicitar)}</span>
      </div>
      <div class="rotulo" style="margin-top:4px">sobre o orçado de ${moeda(orcado)}</div>
    </div>

    <h2 style="font-size:15px;margin:24px 0 10px">Gastos por categoria</h2>
    <div class="cartao">
      ${cats.map(([nome, v]) => {
        const p = v.orcado > 0 ? Math.round(v.pago / v.orcado * 100) : 0;
        return `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;margin-bottom:4px">
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nome)}</span>
            <span style="white-space:nowrap"><span class="num" style="color:var(--verde);font-weight:500">${moeda(v.pago)}</span> <span style="color:var(--texto-3)">/ ${moeda(v.orcado)}</span></span>
          </div>
          <div style="height:8px;background:var(--superficie-2);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${p}%;background:var(--verde)"></div>
          </div>
        </div>`;
      }).join('')}
      <div class="rotulo" style="margin-top:6px">${pontinho('var(--verde)')}preenchido = já pago · trilha = orçado</div>
    </div>

    <h2 style="font-size:15px;margin:24px 0 10px">Receitas por fonte ${selo('Fase 4')}</h2>
    <div class="cartao" style="color:var(--texto-2);font-size:14px">
      Disponível com o módulo de Receitas: distribuição por fonte (bilheteria, patrocínio, camarotes, bar).
    </div>
  `;
}
