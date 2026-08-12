// ═══════════════════════════════════════════════════════
// Painel da empresa — a visão consolidada da produtora
//
// Junta os eventos: orçado, pago, receita, recebido, resultado.
// Linha temporal receita × gastos, comparativo por evento,
// a receber × a pagar. Tudo respeita o olhinho (moeda mascara).
// ═══════════════════════════════════════════════════════

import {
  empresaAtual, resumoEventos, fluxoMensal, listarAgenda, listarAgendaReceita,
} from './nucleo.js';
import { esc, moeda, numero, dataBR, SITUACAO_EVENTO, registrarView, privadoAtivo } from './ui.js';
import { telaEvento } from './evento.js';

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

let _dados = null;
let _periodo = 12;   // meses na linha temporal
let _Chart = null;
let _cLinha = null, _cBarra = null;

export async function telaPainelEmpresa() {
  const alvo = document.querySelector('#conteudo');
  const emp = empresaAtual();
  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Carregando o painel...</div>`;

  try {
    const [eventos, fluxo, agPagar, agReceber] = await Promise.all([
      resumoEventos(emp.id),
      fluxoMensal(emp.id),
      listarAgenda(emp.id).catch(() => []),
      listarAgendaReceita(emp.id).catch(() => []),
    ]);
    _dados = { emp, eventos, fluxo, agPagar, agReceber };
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui abrir o painel</h3><p>${esc(e.message)}</p></div>`;
    return;
  }

  registrarView(desenhar);   // o olhinho repinta daqui, sem refazer as consultas
  desenhar();
}

function rotuloMes(iso) {
  const [a, m] = String(iso).slice(0, 7).split('-');
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}

function desenhar() {
  const alvo = document.querySelector('#conteudo');
  if (!_dados) return;
  const { eventos, agPagar, agReceber } = _dados;

  const orcado = eventos.reduce((a, e) => a + Number(e.orcado || 0), 0);
  const pago = eventos.reduce((a, e) => a + Number(e.pago || 0), 0);
  const receitaPrev = eventos.reduce((a, e) => a + Number(e.receita_prevista || 0), 0);
  const recebido = eventos.reduce((a, e) => a + Number(e.recebido || 0), 0);
  const resPrev = receitaPrev - orcado;
  const resReal = recebido - pago;

  // a receber × a pagar nos próximos 60 dias (inclui vencidos)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje); limite.setDate(limite.getDate() + 60);
  const dentro = v => { if (!v) return false; const d = new Date(v + 'T00:00:00'); return d <= limite; };
  const somaFalta = lista => lista.filter(x => dentro(x.vencimento)).reduce((a, x) => a + Number(x.falta || 0), 0);
  const contaFalta = lista => lista.filter(x => dentro(x.vencimento)).length;
  const aReceber = somaFalta(agReceber), aPagar = somaFalta(agPagar);

  const oculto = privadoAtivo();

  alvo.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:6px">
      <h1 style="margin:0">${esc(_dados.emp?.nome || 'Painel')}</h1>
      <div style="font-size:13px;color:var(--texto-2)">${numero(eventos.length)} ${eventos.length === 1 ? 'evento' : 'eventos'}</div>
    </div>

    <h2 style="font-size:15px;margin:20px 0 10px">Consolidado</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
      <div class="metrica"><div class="rotulo">Orçado</div><div class="valor">${moeda(orcado)}</div></div>
      <div class="metrica"><div class="rotulo">Pago</div><div class="valor" style="color:var(--verde)">${moeda(pago)}</div></div>
      <div class="metrica"><div class="rotulo">Receita prevista</div><div class="valor">${moeda(receitaPrev)}</div></div>
      <div class="metrica"><div class="rotulo">Recebido</div><div class="valor" style="color:var(--verde)">${moeda(recebido)}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:10px">
      <div class="metrica"><div class="rotulo">Resultado previsto (receita − orçado)</div><div class="valor" style="color:${resPrev >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">${resPrev >= 0 ? '+' : ''}${moeda(resPrev)}</div></div>
      <div class="metrica"><div class="rotulo">Resultado real (recebido − pago)</div><div class="valor" style="color:${resReal >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">${resReal >= 0 ? '+' : ''}${moeda(resReal)}</div></div>
    </div>

    <h2 style="font-size:15px;margin:22px 0 10px">A receber × a pagar · próximos 60 dias</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="metrica"><div class="rotulo">A receber</div><div class="valor" style="color:var(--verde)">${moeda(aReceber)}</div><div class="rotulo" style="margin-top:2px">${numero(contaFalta(agReceber))} parcela(s)</div></div>
      <div class="metrica"><div class="rotulo">A pagar</div><div class="valor" style="color:var(--ambar)">${moeda(aPagar)}</div><div class="rotulo" style="margin-top:2px">${numero(contaFalta(agPagar))} parcela(s)</div></div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin:22px 0 10px;flex-wrap:wrap;gap:8px">
      <h2 style="font-size:15px;margin:0">Receita × gastos no tempo</h2>
      <div style="display:flex;gap:6px">
        ${[[6, '6 meses'], [12, '12 meses'], [999, 'geral']].map(([n, r]) =>
          `<button class="botao" data-per="${n}" style="height:30px;font-size:12px${_periodo === n ? ';border-color:var(--acento);color:var(--acento)' : ''}">${r}</button>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:16px;font-size:12px;color:var(--texto-2);margin-bottom:6px">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--verde);margin-right:5px;vertical-align:middle"></span>Receita recebida</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#d95926;margin-right:5px;vertical-align:middle"></span>Gastos pagos</span>
    </div>
    ${oculto ? boxOculto(230) : `<div style="position:relative;width:100%;height:230px"><canvas id="pe-linha"></canvas></div>`}

    <h2 style="font-size:15px;margin:22px 0 10px">Resultado por evento</h2>
    <div style="display:flex;gap:16px;font-size:12px;color:var(--texto-2);margin-bottom:6px">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#85b7eb;margin-right:5px;vertical-align:middle"></span>Previsto</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--verde);margin-right:5px;vertical-align:middle"></span>Real</span>
    </div>
    ${oculto ? boxOculto(200) : `<div style="position:relative;width:100%;height:200px"><canvas id="pe-barra"></canvas></div>`}

    <h2 style="font-size:15px;margin:22px 0 10px">Por evento</h2>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${eventos.length ? eventos.map(cartaoEvento).join('') : '<p class="dica">Nenhum evento ainda.</p>'}
    </div>
  `;

  alvo.querySelectorAll('[data-per]').forEach(b =>
    b.addEventListener('click', () => { _periodo = Number(b.dataset.per); desenhar(); }));
  alvo.querySelectorAll('[data-evento]').forEach(el =>
    el.addEventListener('click', () => telaEvento(el.dataset.evento)));

  if (!oculto) desenharGraficos();
}

function boxOculto(altura) {
  return `<div style="height:${altura}px;display:flex;align-items:center;justify-content:center;
    background:var(--superficie-2);border-radius:var(--raio);color:var(--texto-3);font-size:13px">
    Valores ocultos — toque no olho para mostrar</div>`;
}

function cartaoEvento(e) {
  const sit = SITUACAO_EVENTO[e.situacao] || SITUACAO_EVENTO.planejamento;
  const resultado = Number(e.recebido || 0) - Number(e.pago || 0);
  const pctPago = Number(e.orcado) > 0 ? Math.round(Number(e.pago) / Number(e.orcado) * 100) : 0;
  return `
    <div class="cartao" data-evento="${esc(e.evento_id)}" style="cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px">
        <strong>${esc(e.nome)}</strong>
        <span class="etiqueta ${sit.classe}">${sit.rotulo}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px">
        <div><div class="rotulo">Orçado</div><div style="font-weight:500">${moeda(e.orcado)}</div></div>
        <div><div class="rotulo">Pago</div><div style="font-weight:500;color:var(--verde)">${moeda(e.pago)}</div></div>
        <div><div class="rotulo">Recebido</div><div style="font-weight:500;color:var(--verde)">${moeda(e.recebido)}</div></div>
        <div><div class="rotulo">Resultado</div><div style="font-weight:500;color:${resultado >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">${resultado >= 0 ? '+' : ''}${moeda(resultado)}</div></div>
      </div>
      <div style="height:7px;background:var(--superficie-2);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${privadoAtivo() ? 0 : pctPago}%;background:var(--verde)"></div>
      </div>
    </div>`;
}

/* ── gráficos (Chart.js sob demanda) ───────────────── */

async function desenharGraficos() {
  if (!_Chart) {
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/auto/+esm');
      _Chart = mod.Chart || mod.default;
    } catch (e) { return; /* sem internet pro CDN: segue sem gráfico */ }
  }
  renderLinha();
  renderBarra();
}

function eixoTicks() {
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--texto-3').trim() || '#999';
  return {
    color: muted, font: { size: 11 },
    callback: v => 'R$ ' + new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v),
  };
}

function renderLinha() {
  const cv = document.getElementById('pe-linha');
  if (!cv || !_Chart) return;
  let fluxo = _dados.fluxo.slice();
  if (_periodo < 900) fluxo = fluxo.slice(-_periodo);
  const labels = fluxo.map(f => rotuloMes(f.mes));
  const rec = fluxo.map(f => Number(f.recebido || 0));
  const pag = fluxo.map(f => Number(f.pago || 0));
  if (_cLinha) _cLinha.destroy();
  _cLinha = new _Chart(cv, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Receita', data: rec, borderColor: '#199e70', backgroundColor: '#199e70', tension: .3, borderWidth: 2, pointRadius: 2 },
        { label: 'Gastos', data: pag, borderColor: '#d95926', backgroundColor: '#d95926', borderDash: [5, 4], tension: .3, borderWidth: 2, pointRadius: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: eixoTicks().color, font: { size: 11 } } },
                y: { grid: { color: 'rgba(150,150,150,.15)' }, ticks: eixoTicks() } },
    },
  });
}

function renderBarra() {
  const cv = document.getElementById('pe-barra');
  if (!cv || !_Chart) return;
  const evs = _dados.eventos;
  const labels = evs.map(e => e.nome);
  const prev = evs.map(e => Number(e.receita_prevista || 0) - Number(e.orcado || 0));
  const real = evs.map(e => Number(e.recebido || 0) - Number(e.pago || 0));
  if (_cBarra) _cBarra.destroy();
  _cBarra = new _Chart(cv, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Previsto', data: prev, backgroundColor: '#85b7eb', borderRadius: 4 },
      { label: 'Real', data: real, backgroundColor: '#199e70', borderRadius: 4 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: eixoTicks().color, font: { size: 11 } } },
                y: { grid: { color: 'rgba(150,150,150,.15)' }, ticks: eixoTicks() } },
    },
  });
}
