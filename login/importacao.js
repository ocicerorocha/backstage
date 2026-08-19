// ═══════════════════════════════════════════════════════
// Importação assistida da planilha do evento anterior
//
// Quatro passos: enviar, dizer o que é cada coluna, acertar
// as categorias, revisar e gravar.
//
// As categorias são resolvidas UMA VEZ POR NOME, não item a
// item. Uma planilha de 200 linhas costuma ter oito categorias
// — são oito decisões, não duzentas.
// ═══════════════════════════════════════════════════════

import {
  criarItensEmLote, registrarImportacao, criarCategoria,
  empresaAtual, apagarItem,
} from './nucleo.js';
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

let _planilha = null;
let _mapa = {};
let _categorias = [];
let _mapaCategorias = [];  // [{ texto, qtd, acao, categoria_id }]
let _revisao = [];
let _substituir = false;

export function abrirImportacao(categorias) {
  _categorias = [...(categorias || [])];
  _planilha = null; _mapa = {}; _revisao = []; _mapaCategorias = []; _substituir = false;
  etapaArquivo();
}

/* ── passo 1: enviar ───────────────────────────────── */

function etapaArquivo() {
  const jaTem = contexto.itens.length;
  abrirModal('Importar planilha', `
    <p style="font-size:14px;color:var(--texto-2);margin-bottom:16px">
      Envie a planilha do evento anterior como ela é. Você confere e corrige tudo
      antes de qualquer coisa ser gravada.
    </p>

    ${jaTem ? `
      <div class="cartao" style="background:var(--ambar-fundo);border-color:var(--ambar);margin-bottom:14px">
        <div style="font-size:13px;color:var(--ambar);margin-bottom:10px">
          Este evento já tem ${jaTem} ${jaTem === 1 ? 'item' : 'itens'}.
        </div>
        <label class="caixa-perm" style="margin-bottom:6px">
          <input type="radio" name="modo" value="acrescentar" checked>
          <span><span class="rot">Acrescentar</span><span class="desc">Mantém o que já existe</span></span>
        </label>
        <label class="caixa-perm">
          <input type="radio" name="modo" value="substituir">
          <span><span class="rot">Substituir tudo</span><span class="desc">Apaga os ${jaTem} itens atuais antes de importar</span></span>
        </label>
      </div>` : ''}

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
    _substituir = document.querySelector('input[name=modo]:checked')?.value === 'substituir';
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
  if (f.name.toLowerCase().endsWith('.csv')) return lerCSV(await f.text());
  const XLSX = await carregarXLSX();
  const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
  const aba = wb.Sheets[wb.SheetNames[0]];
  return montar(XLSX.utils.sheet_to_json(aba, { header: 1, blankrows: false, defval: '' }));
}

let _xlsx = null;
async function carregarXLSX() {
  if (!_xlsx) _xlsx = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  return _xlsx;
}

function lerCSV(texto) {
  const cab = texto.split('\n')[0] || '';
  const sep = (cab.match(/;/g) || []).length > (cab.match(/,/g) || []).length ? ';' : ',';
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

function montar(matriz) {
  const limpa = matriz.filter(l => l && l.some(c => String(c ?? '').trim() !== ''));
  if (!limpa.length) return { colunas: [], linhas: [] };
  let iCab = 0;
  for (let i = 0; i < Math.min(limpa.length, 15); i++) {
    const textos = limpa[i].filter(c => String(c ?? '').trim() && isNaN(Number(String(c).replace(',', '.'))));
    if (textos.length >= 2) { iCab = i; break; }
  }
  const colunas = limpa[iCab].map((c, k) => String(c ?? '').trim() || `Coluna ${k + 1}`);
  const linhas = limpa.slice(iCab + 1).map(l => colunas.map((_, k) => String(l[k] ?? '').trim()));
  return { colunas, linhas };
}

/* ── passo 2: mapear colunas ───────────────────────── */

function adivinharMapa() {
  _mapa = {};
  const usadas = new Set();
  for (const campo of CAMPOS) {
    const achou = _planilha.colunas.findIndex((c, k) =>
      !usadas.has(k) && campo.pistas.some(p => c.toLowerCase().includes(p)));
    if (achou >= 0) { _mapa[campo.id] = achou; usadas.add(achou); }
  }
}

function etapaMapear() {
  const opcoes = sel => `
    <option value="">— não usar —</option>
    ${_planilha.colunas.map((c, k) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;

  abrirModal('Importar — o que é cada coluna', `
    <p style="font-size:14px;color:var(--texto-2);margin-bottom:14px">
      Li ${_planilha.linhas.length} ${_planilha.linhas.length === 1 ? 'linha' : 'linhas'}
      e ${_planilha.colunas.length} colunas. Confira o que entendi.
    </p>
    ${CAMPOS.map(c => `
      <div class="campo">
        <label for="m-${c.id}">${esc(c.rotulo)}${c.obrigatorio ? '' : ' <span style="font-weight:400;color:var(--texto-3)">(opcional)</span>'}</label>
        <select class="controle" id="m-${c.id}">${opcoes(_mapa[c.id])}</select>
      </div>`).join('')}
    <details style="margin-top:10px">
      <summary style="cursor:pointer;font-size:13px;color:var(--texto-2)">Ver as primeiras linhas</summary>
      <div class="tabela-rolagem" style="margin-top:10px;max-height:220px">
        <table class="tabela" style="font-size:12px">
          <thead><tr>${_planilha.colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${_planilha.linhas.slice(0, 5).map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </details>
    <div class="modal-acoes">
      <button type="button" class="botao" id="voltar">Voltar</button>
      <button type="button" class="botao botao-primario" id="seguir">Continuar</button>
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
    if (_mapa.categoria == null) { prepararRevisao(); return etapaRevisar(); }
    prepararCategorias();
    etapaCategorias();
  });
}

/* ── passo 3: categorias ───────────────────────────── */

/** Reduz o nome a uma forma comparável: sem acento, "&" vira "e". */
function chave(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const PALAVRAS_VAZIAS = new Set(['e','de','da','do','das','dos','a','o','as','os','em','para','com','the']);

function palavrasUteis(s) {
  return chave(s).split(' ').filter(p => p.length > 2 && !PALAVRAS_VAZIAS.has(p));
}

/**
 * Acha a categoria mais próxima. Resolve os casos reais das PPPs:
 * "INFRA & CENOGRAFIA" → "Infraestrutura e cenografia",
 * "MÍDIA & COMUNICAÇÃO" → "Mídia e comunicação".
 */
function melhorCategoria(texto) {
  const k = chave(texto);
  if (!k) return null;

  let achou = _categorias.find(c => chave(c.nome) === k);
  if (achou) return achou;

  achou = _categorias.find(c => {
    const ck = chave(c.nome);
    return ck.startsWith(k) || k.startsWith(ck);
  });
  if (achou) return achou;

  const pw = palavrasUteis(texto);
  if (!pw.length) return null;

  let melhor = null, nota = 0;
  for (const c of _categorias) {
    const cw = palavrasUteis(c.nome);
    if (!cw.length) continue;
    const comuns = pw.filter(p => cw.some(x =>
      x.startsWith(p.slice(0, 4)) || p.startsWith(x.slice(0, 4))));
    const n = comuns.length / Math.max(pw.length, cw.length);
    if (n > nota) { nota = n; melhor = c; }
  }
  return nota >= 0.6 ? melhor : null;
}

function prepararCategorias() {
  const contagem = new Map();
  for (const l of _planilha.linhas) {
    const t = (l[_mapa.categoria] || '').trim();
    if (!t) continue;
    contagem.set(t, (contagem.get(t) || 0) + 1);
  }

  _mapaCategorias = [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([texto, qtd]) => {
      const m = melhorCategoria(texto);
      return {
        texto, qtd,
        acao: m ? 'existente' : 'criar',
        categoria_id: m?.id || '',
        sugerida: m?.nome || null,
      };
    });
}

function etapaCategorias() {
  const criar = _mapaCategorias.filter(c => c.acao === 'criar').length;

  abrirModal('Importar — categorias', `
    <p style="font-size:14px;color:var(--texto-2);margin-bottom:6px">
      Encontrei ${_mapaCategorias.length} ${_mapaCategorias.length === 1 ? 'categoria' : 'categorias'} na planilha.
      Resolva aqui uma vez e vale para todos os itens.
    </p>
    ${criar ? `<p class="dica" style="margin-bottom:14px">
      ${criar} ${criar === 1 ? 'não existe' : 'não existem'} no sistema e ${criar === 1 ? 'será criada' : 'serão criadas'} na importação.
    </p>` : '<div style="height:8px"></div>'}

    <div class="tabela-rolagem" style="max-height:380px">
      <table class="tabela" style="font-size:13px">
        <thead>
          <tr>
            <th>Na planilha</th>
            <th style="width:58px" class="num">Itens</th>
            <th style="width:230px">Vira</th>
          </tr>
        </thead>
        <tbody>
          ${_mapaCategorias.map((c, k) => `
            <tr>
              <td>
                <div style="font-weight:500">${esc(c.texto)}</div>
                ${c.sugerida ? `<div style="font-size:11px;color:var(--verde)">reconhecida</div>` : ''}
              </td>
              <td class="num" style="color:var(--texto-2)">${c.qtd}</td>
              <td>
                <select class="controle c-acao" data-k="${k}" style="height:34px;font-size:13px">
                  <option value="criar" ${c.acao === 'criar' ? 'selected' : ''}>Criar "${esc(c.texto)}"</option>
                  ${_categorias.map(x => `
                    <option value="${esc(x.id)}" ${c.acao === 'existente' && c.categoria_id === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}
                  <option value="ignorar" ${c.acao === 'ignorar' ? 'selected' : ''}>Deixar sem categoria</option>
                </select>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="modal-acoes">
      <button type="button" class="botao" id="voltar">Voltar</button>
      <button type="button" class="botao botao-primario" id="seguir">Continuar</button>
    </div>
  `);

  document.querySelectorAll('.c-acao').forEach(el =>
    el.addEventListener('change', () => {
      const c = _mapaCategorias[el.dataset.k];
      if (el.value === 'criar')        { c.acao = 'criar';     c.categoria_id = ''; }
      else if (el.value === 'ignorar') { c.acao = 'ignorar';   c.categoria_id = ''; }
      else                             { c.acao = 'existente'; c.categoria_id = el.value; }
    }));

  document.getElementById('voltar').addEventListener('click', etapaMapear);
  document.getElementById('seguir').addEventListener('click', () => {
    prepararRevisao();
    etapaRevisar();
  });
}

/* ── passo 4: revisar ──────────────────────────────── */

function prepararRevisao() {
  const porTexto = new Map();
  _mapaCategorias.forEach(c => porTexto.set(c.texto, c));

  _revisao = [];
  const descartes = [];

  _planilha.linhas.forEach((l, idx) => {
    const desc = (l[_mapa.descricao] || '').trim();
    const valor = numeroBR(l[_mapa.valor_orcado]);
    const ref = numeroBR(l[_mapa.custo_referencia]);
    const catTexto = _mapa.categoria != null ? (l[_mapa.categoria] || '').trim() : '';

    if (!desc) { descartes.push({ linha: idx + 2, motivo: 'sem nome de item' }); return; }
    if (/^(total|soma|subtotal)/i.test(desc)) {
      descartes.push({ linha: idx + 2, motivo: 'linha de totalização', texto: desc }); return;
    }
    if (chave(desc) === chave(_planilha.colunas[_mapa.descricao] || '')) {
      descartes.push({ linha: idx + 2, motivo: 'cabeçalho repetido', texto: desc }); return;
    }
    if (valor === 0 && ref === 0) {
      descartes.push({ linha: idx + 2, motivo: 'sem valor algum', texto: desc }); return;
    }

    const c = porTexto.get(catTexto);
    _revisao.push({
      incluir: true,
      descricao: desc,
      categoria_texto: catTexto,
      categoria_id: c?.acao === 'existente' ? c.categoria_id : '',
      criar_categoria: c?.acao === 'criar' ? catTexto : null,
      valor_orcado: valor,
      custo_referencia: _mapa.custo_referencia != null ? ref : null,
    });
  });

  _revisao.descartes = descartes;
}

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
  const criar = [...new Set(_revisao.map(r => r.criar_categoria).filter(Boolean))];
  const total = () => _revisao.filter(r => r.incluir).reduce((a, r) => a + Number(r.valor_orcado || 0), 0);

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

    ${_substituir ? `
      <div class="cartao" style="background:var(--vermelho-fundo);border-color:var(--vermelho);margin-bottom:14px">
        <div style="font-size:13px;color:var(--vermelho)">
          Os ${contexto.itens.length} itens atuais serão apagados antes da importação.
          A exclusão fica registrada na auditoria.
        </div>
      </div>` : ''}

    ${criar.length ? `
      <p class="dica" style="margin-bottom:12px">
        Categorias que serão criadas: ${criar.map(esc).join(', ')}
      </p>` : ''}

    ${d.length ? `
      <details style="margin-bottom:14px">
        <summary style="cursor:pointer;font-size:13px;color:var(--ambar)">Ver as ${d.length} linhas descartadas e o motivo</summary>
        <div class="cartao" style="margin-top:8px;padding:10px;max-height:180px;overflow:auto">
          ${d.map(x => `<div style="font-size:12px;color:var(--texto-2);padding:3px 0">
            Linha ${x.linha} — ${esc(x.motivo)}${x.texto ? ': ' + esc(x.texto.slice(0, 60)) : ''}</div>`).join('')}
        </div>
      </details>` : ''}

    <div class="tabela-rolagem" style="max-height:320px">
      <table class="tabela" style="font-size:13px">
        <thead>
          <tr>
            <th style="width:34px"></th>
            <th>Item</th>
            <th style="width:150px">Categoria</th>
            <th style="width:110px" class="num">Ano anterior</th>
            <th style="width:110px" class="num">Orçado</th>
          </tr>
        </thead>
        <tbody>
          ${_revisao.map((r, k) => `
            <tr>
              <td><input type="checkbox" class="r-inc" data-k="${k}" ${r.incluir ? 'checked' : ''}></td>
              <td><input class="controle r-desc" data-k="${k}" value="${esc(r.descricao)}" style="height:32px;font-size:13px"></td>
              <td style="font-size:12px;color:var(--texto-2)">
                ${r.criar_categoria
                  ? `<span class="etiqueta etiqueta-acento">nova: ${esc(r.criar_categoria)}</span>`
                  : r.categoria_id
                    ? esc(_categorias.find(c => c.id === r.categoria_id)?.nome || '—')
                    : '<span style="color:var(--texto-3)">sem categoria</span>'}
              </td>
              <td><input class="controle r-ref num" data-k="${k}" type="number" step="0.01" value="${r.custo_referencia ?? ''}" style="height:32px;font-size:13px"></td>
              <td><input class="controle r-val num" data-k="${k}" type="number" step="0.01" value="${r.valor_orcado}" style="height:32px;font-size:13px"></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <p class="dica" style="margin-top:10px">
      Para trocar categoria, volte um passo — a mudança vale para todos os itens daquela categoria de uma vez.
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
  document.querySelectorAll('.r-val').forEach(el =>
    el.addEventListener('input', () => { _revisao[el.dataset.k].valor_orcado = Number(el.value) || 0; atualizar(); }));
  document.querySelectorAll('.r-ref').forEach(el =>
    el.addEventListener('input', () => {
      _revisao[el.dataset.k].custo_referencia = el.value === '' ? null : Number(el.value);
    }));

  document.getElementById('voltar').addEventListener('click',
    () => _mapa.categoria != null ? etapaCategorias() : etapaMapear());

  document.getElementById('gravar').addEventListener('click', async () => {
    const entram = _revisao.filter(r => r.incluir && r.descricao.trim());
    if (!entram.length) return aviso('Nenhuma linha selecionada.', 'aviso');

    await comBotao(document.getElementById('gravar'), async () => {
      try {
        // cria as categorias novas antes, uma vez cada
        const novas = {};
        for (const nome of [...new Set(entram.map(r => r.criar_categoria).filter(Boolean))]) {
          try {
            const c = await criarCategoria(empresaAtual().id, 'despesa', nome);
            novas[nome] = c.id;
            _categorias.push(c);
          } catch (e) {
            // já existe com esse nome: aproveita a existente
            const j = _categorias.find(x => chave(x.nome) === chave(nome));
            if (j) novas[nome] = j.id;
          }
        }
        entram.forEach(r => {
          if (r.criar_categoria && novas[r.criar_categoria]) r.categoria_id = novas[r.criar_categoria];
        });

        if (_substituir) {
          for (const it of contexto.itens) await apagarItem(it.id);
        }

        const criados = await criarItensEmLote(contexto.evento.id, entram);
        await registrarImportacao(contexto.evento.id, {
          arquivo: _planilha.arquivo,
          mapeamento: Object.fromEntries(Object.entries(_mapa).map(([k, v]) => [k, _planilha.colunas[v]])),
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
