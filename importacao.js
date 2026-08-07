// ═══════════════════════════════════════════════════════
// Importação assistida da planilha do evento anterior
//
// A pessoa sobe a planilha como ela é. O sistema lê os
// cabeçalhos e propõe o significado de cada coluna; ela
// confirma ou corrige, revisa numa tabela editável, vê o
// que foi descartado e por quê, e só então grava.
//
// Nada entra em silêncio.
// ═══════════════════════════════════════════════════════

import { criarItensEmLote, registrarImportacao } from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda } from './ui.js';
import { contexto, recarregarItens } from './evento.js';

const CAMPOS = [
  { id: 'descricao',        rotulo: 'Item',                   obrigatorio: true,
    pistas: ['item','descri','produto','servico','serviço','nome'] },
  { id: 'categoria',        rotulo: 'Categoria',              obrigatorio: false,
    pistas: ['categ','grupo','tipo','setor'] },
  { id: 'valor_orcado',     rotulo: 'Valor orçado',           obrigatorio: false,
    pistas: ['total 2026','total 2027','orcado','orçado','valor total','total','valor'] },
  { id: 'custo_referencia', rotulo: 'Custo do ano anterior',  obrigatorio: false,
    pistas: ['2025','2024','anterior','referencia','referência','custo ano'] },
];

let _planilha = null;   // { colunas:[], linhas:[[]] }
let _mapa = {};
let _categorias = [];
let _revisao = [];

export function abrirImportacao(categorias) {
  _categorias = categorias || [];
  _planilha = null; _mapa = {}; _revisao = [];
  etapaArquivo();
}

/* ── etapa 1: enviar ───────────────────────────────── */

function etapaArquivo() {
  abrirModal('Importar planilha', `
    <p style="font-size:14px;color:var(--texto-2);margin-bottom:16px">
      Envie a planilha do evento anterior como ela é. Você confere e corrige tudo
      antes de qualquer coisa ser gravada.
    </p>
    <div class="area-arquivo" id="area">
      <div style="font-size:15px;font-weight:500;margin-bottom:4px">Escolher arquivo</div>
      <div style="font-size:13px;color:var(--texto-2)">Excel (.xlsx, .xls) ou CSV</div>
      <input type="file" id="arq" accept=".xlsx,.xls,.csv,text/csv" style="display:none">
    </div>
    <div id="lendo" hidden style="text-align:center;padding:16px;color:var(--texto-2);font-size:14px">
      Lendo a planilha...
    </div>
    <div class="modal-acoes">
      <button type="button" class="botao" id="cancelar">Cancelar</button>
    </div>
  `);

  const q = s => document.querySelector(s);
  q('#cancelar').addEventListener('click', fecharModal);
  q('#area').addEventListener('click', () => q('#arq').click());
  q('#arq').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    q('#area').hidden = true; q('#lendo').hidden = false;
    try {
      _planilha = await lerArquivo(f);
      if (!_planilha.linhas.length) throw new Error('A planilha não tem linhas de dados.');
      _planilha.arquivo = f.name;
      adivinharMapa();
      etapaMapear();
    } catch (err) {
      aviso(err.message, 'erro');
      etapaArquivo();
    }
  });
}

/* ── leitura ───────────────────────────────────────── */

async function lerArquivo(f) {
  const nome = f.name.toLowerCase();
  if (nome.endsWith('.csv')) return lerCSV(await f.text());

  const XLSX = await carregarXLSX();
  const buf = await f.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const aba = wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json(aba, { header: 1, blankrows: false, defval: '' });
  return montar(matriz);
}

let _xlsx = null;
async function carregarXLSX() {
  if (_xlsx) return _xlsx;
  _xlsx = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  return _xlsx;
}

function lerCSV(texto) {
  const sep = (texto.split('\n')[0].match(/;/g) || []).length >
              (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return montar(linhas);
}

/** Acha a linha de cabeçalho e separa os dados. */
function montar(matriz) {
  const limpa = matriz.filter(l => l && l.some(c => String(c ?? '').trim() !== ''));
  if (!limpa.length) return { colunas: [], linhas: [] };

  // o cabeçalho é a primeira linha com pelo menos duas células de texto
  let iCab = 0;
  for (let i = 0; i < Math.min(limpa.length, 15); i++) {
    const textos = limpa[i].filter(c => String(c ?? '').trim() && isNaN(Number(String(c).replace(',', '.'))));
    if (textos.length >= 2) { iCab = i; break; }
  }

  const colunas = limpa[iCab].map((c, k) => String(c ?? '').trim() || `Coluna ${k + 1}`);
  const linhas = limpa.slice(iCab + 1).map(l => colunas.map((_, k) => String(l[k] ?? '').trim()));
  return { colunas, linhas };
}

/* ── etapa 2: mapear ───────────────────────────────── */

function adivinharMapa() {
  _mapa = {};
  const usadas = new Set();
  for (const campo of CAMPOS) {
    const achou = _planilha.colunas.findIndex((c, k) => {
      if (usadas.has(k)) return false;
      const n = c.toLowerCase();
      return campo.pistas.some(p => n.includes(p));
    });
    if (achou >= 0) { _mapa[campo.id] = achou; usadas.add(achou); }
  }
}

function etapaMapear() {
  const opcoes = (sel) => `
    <option value="">— não usar —</option>
    ${_planilha.colunas.map((c, k) =>
      `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;

  abrirModal('Importar — o que é cada coluna', `
    <p style="font-size:14px;color:var(--texto-2);margin-bottom:14px">
      Li ${_planilha.linhas.length} ${_planilha.linhas.length === 1 ? 'linha' : 'linhas'}
      e ${_planilha.colunas.length} colunas. Confira o que entendi de cada uma.
    </p>

    ${CAMPOS.map(c => `
      <div class="campo">
        <label for="m-${c.id}">${esc(c.rotulo)}${c.obrigatorio ? '' : ' <span style="font-weight:400;color:var(--texto-3)">(opcional)</span>'}</label>
        <select class="controle" id="m-${c.id}">${opcoes(_mapa[c.id])}</select>
      </div>`).join('')}

    <details style="margin-top:10px">
      <summary style="cursor:pointer;font-size:13px;color:var(--texto-2)">Ver as primeiras linhas da planilha</summary>
      <div class="tabela-rolagem" style="margin-top:10px;max-height:220px">
        <table class="tabela" style="font-size:12px">
          <thead><tr>${_planilha.colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>
            ${_planilha.linhas.slice(0, 5).map(l =>
              `<tr>${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>

    <div class="modal-acoes">
      <button type="button" class="botao" id="voltar">Voltar</button>
      <button type="button" class="botao botao-primario" id="seguir">Revisar</button>
    </div>
  `);

  const q = s => document.querySelector(s);
  q('#voltar').addEventListener('click', etapaArquivo);
  q('#seguir').addEventListener('click', () => {
    _mapa = {};
    for (const c of CAMPOS) {
      const v = q('#m-' + c.id).value;
      if (v !== '') _mapa[c.id] = Number(v);
    }
    if (_mapa.descricao == null) return aviso('Escolha qual coluna tem o nome do item.', 'aviso');
    prepararRevisao();
    etapaRevisar();
  });
}

/* ── etapa 3: revisar ──────────────────────────────── */

function prepararRevisao() {
  const porNome = {};
  _categorias.forEach(c => { porNome[normalizar(c.nome)] = c.id; });

  _revisao = [];
  const descartes = [];

  _planilha.linhas.forEach((l, idx) => {
    const desc = (l[_mapa.descricao] || '').trim();
    const valor = numeroBR(l[_mapa.valor_orcado]);
    const ref = numeroBR(l[_mapa.custo_referencia]);
    const cat = _mapa.categoria != null ? (l[_mapa.categoria] || '').trim() : '';

    if (!desc) { descartes.push({ linha: idx + 2, motivo: 'sem nome de item' }); return; }
    if (/^(total|soma|subtotal)/i.test(desc)) {
      descartes.push({ linha: idx + 2, motivo: 'linha de totalização', texto: desc }); return;
    }
    if (normalizar(desc) === normalizar(_planilha.colunas[_mapa.descricao] || '')) {
      descartes.push({ linha: idx + 2, motivo: 'cabeçalho repetido', texto: desc }); return;
    }
    if (valor === 0 && ref === 0) {
      descartes.push({ linha: idx + 2, motivo: 'sem valor algum', texto: desc }); return;
    }

    _revisao.push({
      incluir: true,
      descricao: desc,
      categoria_texto: cat,
      categoria_id: porNome[normalizar(cat)] || '',
      valor_orcado: valor,
      custo_referencia: _mapa.custo_referencia != null ? ref : null,
    });
  });

  _revisao.descartes = descartes;
}

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** Entende 1.234,56 e 1234.56, com ou sem R$. */
function numeroBR(v) {
  if (v == null || v === '') return 0;
  let s = String(v).replace(/[R$\s]/gi, '').trim();
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

function etapaRevisar() {
  const d = _revisao.descartes || [];
  const total = () => _revisao.filter(r => r.incluir)
    .reduce((a, r) => a + Number(r.valor_orcado || 0), 0);

  abrirModal('Importar — revisar antes de gravar', `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="metrica">
        <div class="rotulo">Entram</div>
        <div class="valor" style="font-size:17px" id="r-qtd">${_revisao.filter(r => r.incluir).length}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Descartadas</div>
        <div class="valor" style="font-size:17px;color:${d.length ? 'var(--ambar)' : 'var(--texto-2)'}">${d.length}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Total orçado</div>
        <div class="valor" style="font-size:17px" id="r-total">${moeda(total())}</div>
      </div>
    </div>

    ${d.length ? `
      <details style="margin-bottom:14px">
        <summary style="cursor:pointer;font-size:13px;color:var(--ambar)">
          Ver as ${d.length} linhas descartadas e o motivo
        </summary>
        <div class="cartao" style="margin-top:8px;padding:10px;max-height:180px;overflow:auto">
          ${d.map(x => `
            <div style="font-size:12px;color:var(--texto-2);padding:3px 0">
              Linha ${x.linha} — ${esc(x.motivo)}${x.texto ? ': ' + esc(x.texto.slice(0, 60)) : ''}
            </div>`).join('')}
        </div>
      </details>` : ''}

    <div class="tabela-rolagem" style="max-height:340px">
      <table class="tabela" style="font-size:13px">
        <thead>
          <tr>
            <th style="width:34px"></th>
            <th>Item</th>
            <th style="width:140px">Categoria</th>
            <th style="width:110px" class="num">Ano anterior</th>
            <th style="width:110px" class="num">Orçado</th>
          </tr>
        </thead>
        <tbody>
          ${_revisao.map((r, k) => `
            <tr>
              <td><input type="checkbox" class="r-inc" data-k="${k}" ${r.incluir ? 'checked' : ''}></td>
              <td><input class="controle r-desc" data-k="${k}" value="${esc(r.descricao)}"
                         style="height:32px;font-size:13px"></td>
              <td>
                <select class="controle r-cat" data-k="${k}" style="height:32px;font-size:13px">
                  <option value="">— sem —</option>
                  ${_categorias.map(c => `<option value="${esc(c.id)}" ${r.categoria_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
                </select>
                ${r.categoria_texto && !r.categoria_id
                  ? `<div style="font-size:11px;color:var(--texto-3)">planilha: ${esc(r.categoria_texto)}</div>` : ''}
              </td>
              <td><input class="controle r-ref num" data-k="${k}" type="number" step="0.01"
                         value="${r.custo_referencia ?? ''}" style="height:32px;font-size:13px"></td>
              <td><input class="controle r-val num" data-k="${k}" type="number" step="0.01"
                         value="${r.valor_orcado}" style="height:32px;font-size:13px"></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <p class="dica" style="margin-top:10px">
      Os valores entram como <strong>custo de referência</strong> e <strong>orçado</strong>.
      Você ajusta qualquer um deles depois, item a item.
    </p>

    <div class="modal-acoes">
      <button type="button" class="botao" id="voltar">Voltar</button>
      <button type="button" class="botao botao-primario" id="gravar">Importar</button>
    </div>
  `);

  const atualizar = () => {
    document.getElementById('r-qtd').textContent = _revisao.filter(r => r.incluir).length;
    document.getElementById('r-total').textContent = moeda(total());
  };

  document.querySelectorAll('.r-inc').forEach(el =>
    el.addEventListener('change', () => { _revisao[el.dataset.k].incluir = el.checked; atualizar(); }));
  document.querySelectorAll('.r-desc').forEach(el =>
    el.addEventListener('input', () => { _revisao[el.dataset.k].descricao = el.value; }));
  document.querySelectorAll('.r-cat').forEach(el =>
    el.addEventListener('change', () => { _revisao[el.dataset.k].categoria_id = el.value; }));
  document.querySelectorAll('.r-val').forEach(el =>
    el.addEventListener('input', () => { _revisao[el.dataset.k].valor_orcado = Number(el.value) || 0; atualizar(); }));
  document.querySelectorAll('.r-ref').forEach(el =>
    el.addEventListener('input', () => {
      _revisao[el.dataset.k].custo_referencia = el.value === '' ? null : Number(el.value);
    }));

  document.getElementById('voltar').addEventListener('click', etapaMapear);
  document.getElementById('gravar').addEventListener('click', async () => {
    const entram = _revisao.filter(r => r.incluir && r.descricao.trim());
    if (!entram.length) return aviso('Nenhuma linha selecionada.', 'aviso');

    await comBotao(document.getElementById('gravar'), async () => {
      try {
        const criados = await criarItensEmLote(contexto.evento.id, entram);
        await registrarImportacao(contexto.evento.id, {
          arquivo: _planilha.arquivo,
          mapeamento: Object.fromEntries(
            Object.entries(_mapa).map(([k, v]) => [k, _planilha.colunas[v]])),
          lidas: _planilha.linhas.length,
          criadas: criados.length,
          descartes: _revisao.descartes || [],
        });
        aviso(`${criados.length} ${criados.length === 1 ? 'item importado' : 'itens importados'}.`);
        fecharModal();
        await recarregarItens();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}
