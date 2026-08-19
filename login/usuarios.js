// ═══════════════════════════════════════════════════════
// Usuários, papéis e permissões
//
// O papel é atalho: escolher preenche as caixas, que ficam
// visíveis para conferência e ajuste. Nunca uma jaula.
// ═══════════════════════════════════════════════════════

import {
  sessao, listarMembros, listarConvites, convidar, convidarUsuario, cancelarConvite,
  alterarMembro, listarEventos, listarPermissoes, salvarPermissao, removerPermissao,
} from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda, dataBR } from './ui.js';

/* Permissões de evento, na ordem em que aparecem */
export const PERMISSOES_EVENTO = [
  ['ver_evento',          'Ver evento',           'Painel, produção, solicitações e histórico'],
  ['editar_producao',     'Editar produção',      'Criar e alterar itens orçados'],
  ['criar_solicitacao',   'Criar solicitação',    'Pedir pagamento de um item'],
  ['aprovar_pagamento',   'Aprovar pagamento',    'Autorizar a solicitação'],
  ['confirmar_pagamento', 'Confirmar pagamento',  'Registrar que o dinheiro saiu'],
  ['ver_receitas',        'Ver receitas',         'Acompanhar as entradas'],
  ['lancar_receitas',     'Lançar receitas',      'Registrar entradas'],
  ['exportar',            'Exportar relatórios',  'Gerar planilha e PDF'],
];

/* Papéis prontos e o que cada um marca */
export const PAPEIS_EVENTO = {
  administrador:        { rotulo: 'Administrador',          marca: PERMISSOES_EVENTO.map(p => p[0]) },
  produtor:             { rotulo: 'Produtor',               marca: ['ver_evento','editar_producao','criar_solicitacao'] },
  financeiro_aprovador: { rotulo: 'Financeiro — aprovador', marca: ['ver_evento','aprovar_pagamento','ver_receitas'] },
  financeiro_pagador:   { rotulo: 'Financeiro — pagador',   marca: ['ver_evento','confirmar_pagamento','ver_receitas'] },
  socio:                { rotulo: 'Sócio',                  marca: ['ver_evento','ver_receitas','exportar'] },
  personalizado:        { rotulo: 'Personalizado',          marca: [] },
};

const PERMISSOES_EMPRESA = [
  ['ver_painel',         'Painel da empresa',      'Resultado consolidado e total a pagar'],
  ['criar_eventos',      'Criar eventos',          'Abrir novo evento'],
  ['gerir_fornecedores', 'Fornecedores',           'Cadastro e meios de pagamento'],
  ['gerir_custos_adm',   'Custos administrativos', 'Despesas fora de evento'],
  ['gerir_usuarios',     'Gerir usuários',         'Convidar pessoas e definir permissões'],
];

const PAPEL_EMPRESA = { mestre: 'Mestre', administrador: 'Administrador', membro: 'Membro' };

let _empresa = null;
let _eventos = [];

export async function telaUsuarios() {
  const alvo = document.querySelector('#conteudo');
  _empresa = sessao.membros[0]?.empresa;
  if (!_empresa) {
    alvo.innerHTML = `<div class="vazio"><h3>Sem produtora</h3><p>Você não está vinculado a nenhuma produtora.</p></div>`;
    return;
  }

  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Carregando...</div>`;

  let membros, convites;
  try {
    [membros, convites, _eventos] = await Promise.all([
      listarMembros(_empresa.id), listarConvites(_empresa.id), listarEventos(),
    ]);
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`;
    return;
  }

  alvo.innerHTML = `
    <div class="pagina-topo">
      <h1>Usuários</h1>
      <div class="espaco"></div>
      <button class="botao botao-primario" id="convidar">Convidar pessoa</button>
    </div>

    <div class="cartao" style="padding:0;overflow:hidden;margin-bottom:20px">
      ${membros.map(m => linhaMembro(m)).join('') || vazio('Nenhum usuário ainda.')}
    </div>

    ${convites.length ? `
      <h2 style="font-size:15px;margin-bottom:10px">Convites aguardando</h2>
      <div class="cartao" style="padding:0;overflow:hidden">
        ${convites.map(c => linhaConvite(c)).join('')}
      </div>
      <p style="font-size:12px;color:var(--texto-3);margin-top:10px">
        A pessoa recebe um email com um link para criar a senha e entrar. Se não
        chegar, use "Reenviar". O vínculo é aplicado sozinho no primeiro acesso.
      </p>` : ''}
  `;

  alvo.querySelector('#convidar').addEventListener('click', () => modalConvite());
  alvo.querySelectorAll('[data-permissoes]').forEach(el =>
    el.addEventListener('click', () => modalPermissoes(el.dataset.permissoes, el.dataset.nome)));
  alvo.querySelectorAll('[data-cancelar]').forEach(el =>
    el.addEventListener('click', () => removerConvite(el.dataset.cancelar)));
  alvo.querySelectorAll('[data-reenviar]').forEach(el =>
    el.addEventListener('click', () => reenviarConvite(el.dataset.reenviar, el.dataset.rnome)));
  alvo.querySelectorAll('[data-ativar]').forEach(el =>
    el.addEventListener('click', () => alternarAtivo(el.dataset.ativar, el.dataset.estado === 'true')));
}

function vazio(t) {
  return `<div style="padding:28px;text-align:center;color:var(--texto-2);font-size:14px">${esc(t)}</div>`;
}

function linhaMembro(m) {
  const u = m.usuario || {};
  const eu = u.id === sessao.usuario.id;
  return `
    <div class="linha-lista">
      <div style="min-width:0;flex:1">
        <div style="font-weight:500;font-size:14px">
          ${esc(u.nome || '—')}
          ${eu ? '<span class="etiqueta etiqueta-neutra" style="margin-left:6px">você</span>' : ''}
        </div>
        <div style="font-size:12px;color:var(--texto-2)">
          ${esc(PAPEL_EMPRESA[m.papel] || m.papel)}${!m.ativo ? ' · inativo' : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
        <button class="botao" style="height:32px;font-size:13px"
                data-permissoes="${esc(u.id)}" data-nome="${esc(u.nome || '')}">Permissões</button>
        ${eu ? '' : `<button class="botao" style="height:32px;font-size:13px"
                data-ativar="${esc(m.id)}" data-estado="${m.ativo}">${m.ativo ? 'Desativar' : 'Ativar'}</button>`}
      </div>
    </div>`;
}

function linhaConvite(c) {
  return `
    <div class="linha-lista">
      <div style="min-width:0;flex:1">
        <div style="font-weight:500;font-size:14px">${esc(c.nome || c.email)}</div>
        <div style="font-size:12px;color:var(--texto-2)">
          ${esc(c.email)} · ${esc(PAPEL_EMPRESA[c.papel] || c.papel)} · convidado em ${dataBR(c.criado_em)}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
        <button class="botao" style="height:32px;font-size:13px" data-reenviar="${esc(c.email)}" data-rnome="${esc(c.nome || '')}">Reenviar</button>
        <button class="botao" style="height:32px;font-size:13px" data-cancelar="${esc(c.id)}">Cancelar</button>
      </div>
    </div>`;
}

/* ── convite ───────────────────────────────────────── */

function modalConvite() {
  abrirModal('Convidar pessoa', `
    <form id="fc">
      <div class="linha linha-2">
        <div class="campo">
          <label for="c-email">Email</label>
          <input class="controle" type="email" id="c-email" placeholder="nome@produtora.com.br" required>
        </div>
        <div class="campo">
          <label for="c-nome">Nome</label>
          <input class="controle" id="c-nome" placeholder="Como você chama a pessoa">
        </div>
      </div>

      <div class="campo">
        <label for="c-papel">Papel na produtora</label>
        <select class="controle" id="c-papel">
          <option value="membro">Membro — acessa só os eventos que você liberar</option>
          <option value="administrador">Administrador — acessa tudo da produtora</option>
        </select>
      </div>

      <div class="campo" id="c-emp-wrap">
        <label>Permissões na produtora</label>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${PERMISSOES_EMPRESA.map(([k, r, d]) => `
            <label class="caixa-perm">
              <input type="checkbox" class="c-emp" value="${k}">
              <span><span class="rot">${esc(r)}</span><span class="desc">${esc(d)}</span></span>
            </label>`).join('')}
        </div>
      </div>

      <div class="campo">
        <label>Acesso aos eventos</label>
        ${_eventos.length ? `
          <div style="display:flex;flex-direction:column;gap:8px" id="c-eventos">
            ${_eventos.map(ev => `
              <div class="cartao" style="padding:12px">
                <label class="caixa-perm" style="margin-bottom:0">
                  <input type="checkbox" class="c-ev" value="${esc(ev.id)}">
                  <span><span class="rot">${esc(ev.nome)}</span></span>
                </label>
                <div class="c-ev-detalhe" data-para="${esc(ev.id)}" hidden style="margin-top:10px;padding-top:10px;border-top:1px solid var(--borda)">
                  <select class="controle c-ev-papel" data-para="${esc(ev.id)}" style="height:34px;font-size:14px;margin-bottom:10px">
                    ${Object.entries(PAPEIS_EVENTO).map(([v, p]) =>
                      `<option value="${v}" ${v === 'produtor' ? 'selected' : ''}>${p.rotulo}</option>`).join('')}
                  </select>
                  <div style="display:flex;flex-direction:column;gap:7px">
                    ${PERMISSOES_EVENTO.map(([k, r]) => `
                      <label class="caixa-perm pequena">
                        <input type="checkbox" class="c-ev-perm" data-para="${esc(ev.id)}" value="${k}">
                        <span><span class="rot">${esc(r)}</span></span>
                      </label>`).join('')}
                  </div>
                  <div style="margin-top:10px">
                    <label style="font-size:12px;color:var(--texto-2);display:block;margin-bottom:4px">
                      Teto de aprovação (opcional)
                    </label>
                    <input class="controle c-ev-teto" data-para="${esc(ev.id)}" type="number" min="0" step="0.01"
                           placeholder="sem limite" style="height:34px;font-size:14px">
                  </div>
                </div>
              </div>`).join('')}
          </div>` : `<div class="dica">Nenhum evento cadastrado ainda.</div>`}
      </div>

      <div class="modal-acoes">
        <button type="button" class="botao" id="c-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="c-salvar">Convidar</button>
      </div>
    </form>
  `);

  const q = s => document.querySelector(s);
  q('#c-cancelar').addEventListener('click', fecharModal);

  // marcar o evento revela as permissões dele
  document.querySelectorAll('.c-ev').forEach(cb => {
    cb.addEventListener('change', () => {
      const d = document.querySelector(`.c-ev-detalhe[data-para="${cb.value}"]`);
      d.hidden = !cb.checked;
      if (cb.checked) aplicarPapel(cb.value, document.querySelector(`.c-ev-papel[data-para="${cb.value}"]`).value);
    });
  });

  // escolher o papel preenche as caixas — e elas continuam ajustáveis
  document.querySelectorAll('.c-ev-papel').forEach(sel => {
    sel.addEventListener('change', () => aplicarPapel(sel.dataset.para, sel.value));
  });

  q('#fc').addEventListener('submit', async e => {
    e.preventDefault();
    const email = q('#c-email').value.trim();
    if (!email) return aviso('Informe o email.', 'aviso');

    const permissoesEmpresa = {};
    document.querySelectorAll('.c-emp').forEach(c => { permissoesEmpresa[c.value] = c.checked; });

    const permissoesEventos = [];
    document.querySelectorAll('.c-ev:checked').forEach(cb => {
      const id = cb.value;
      const linha = { evento_id: id, papel: document.querySelector(`.c-ev-papel[data-para="${id}"]`).value };
      document.querySelectorAll(`.c-ev-perm[data-para="${id}"]`).forEach(p => { linha[p.value] = p.checked; });
      const teto = document.querySelector(`.c-ev-teto[data-para="${id}"]`).value;
      if (teto) linha.teto_aprovacao = teto;
      permissoesEventos.push(linha);
    });

    await comBotao(q('#c-salvar'), async () => {
      try {
        await convidar({
          empresaId: _empresa.id, email, nome: q('#c-nome').value,
          papel: q('#c-papel').value, permissoesEmpresa, permissoesEventos,
        });
        try {
          await convidarUsuario({ email, nome: q('#c-nome').value });
          aviso('Convite enviado por email para ' + email + '.');
        } catch (err) {
          aviso('Convite criado, mas o email falhou: ' + err.message + ' Use "Reenviar" na lista.', 'aviso', 9000);
        }
        fecharModal();
        await telaUsuarios();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

function aplicarPapel(eventoId, papel) {
  const marca = PAPEIS_EVENTO[papel]?.marca || [];
  document.querySelectorAll(`.c-ev-perm[data-para="${eventoId}"]`).forEach(c => {
    c.checked = marca.includes(c.value);
  });
}

async function removerConvite(id) {
  if (!confirm('Cancelar este convite?')) return;
  try { await cancelarConvite(id); aviso('Convite cancelado.'); await telaUsuarios(); }
  catch (e) { aviso(e.message, 'erro'); }
}

async function reenviarConvite(email, nome) {
  try { await convidarUsuario({ email, nome }); aviso('Convite reenviado para ' + email + '.'); }
  catch (e) { aviso(e.message, 'erro'); }
}

async function alternarAtivo(id, ativo) {
  try { await alterarMembro(id, { ativo: !ativo }); aviso(ativo ? 'Usuário desativado.' : 'Usuário ativado.'); await telaUsuarios(); }
  catch (e) { aviso(e.message, 'erro'); }
}

/* ── permissões por evento de quem já está dentro ──── */

async function modalPermissoes(usuarioId, nome) {
  const porEvento = {};
  try {
    const listas = await Promise.all(_eventos.map(ev => listarPermissoes(ev.id)));
    _eventos.forEach((ev, i) => {
      porEvento[ev.id] = (listas[i] || []).find(p => p.usuario_id === usuarioId) || null;
    });
  } catch (e) { return aviso(e.message, 'erro'); }

  abrirModal(`Permissões de ${nome}`, `
    <form id="fp">
      ${_eventos.length ? _eventos.map(ev => {
        const p = porEvento[ev.id];
        return `
        <div class="cartao" style="padding:12px;margin-bottom:10px">
          <label class="caixa-perm" style="margin-bottom:0">
            <input type="checkbox" class="p-ev" value="${esc(ev.id)}" ${p ? 'checked' : ''}>
            <span><span class="rot">${esc(ev.nome)}</span></span>
          </label>
          <div class="p-detalhe" data-para="${esc(ev.id)}" ${p ? '' : 'hidden'}
               style="margin-top:10px;padding-top:10px;border-top:1px solid var(--borda)">
            <div style="display:flex;flex-direction:column;gap:7px">
              ${PERMISSOES_EVENTO.map(([k, r]) => `
                <label class="caixa-perm pequena">
                  <input type="checkbox" class="p-perm" data-para="${esc(ev.id)}" value="${k}"
                         ${p && p[k] ? 'checked' : (k === 'ver_evento' ? 'checked' : '')}>
                  <span><span class="rot">${esc(r)}</span></span>
                </label>`).join('')}
            </div>
            <div style="margin-top:10px">
              <label style="font-size:12px;color:var(--texto-2);display:block;margin-bottom:4px">Teto de aprovação</label>
              <input class="controle p-teto" data-para="${esc(ev.id)}" type="number" min="0" step="0.01"
                     value="${p?.teto_aprovacao ?? ''}" placeholder="sem limite" style="height:34px;font-size:14px">
              ${p?.teto_aprovacao ? `<div class="dica">Aprova até ${moeda(p.teto_aprovacao)}</div>` : ''}
            </div>
          </div>
        </div>`;
      }).join('') : `<div class="dica">Nenhum evento cadastrado.</div>`}

      <div class="modal-acoes">
        <button type="button" class="botao" id="p-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="p-salvar">Salvar</button>
      </div>
    </form>
  `);

  document.querySelectorAll('.p-ev').forEach(cb => {
    cb.addEventListener('change', () => {
      document.querySelector(`.p-detalhe[data-para="${cb.value}"]`).hidden = !cb.checked;
    });
  });

  document.getElementById('p-cancelar').addEventListener('click', fecharModal);
  document.getElementById('fp').addEventListener('submit', async e => {
    e.preventDefault();
    await comBotao(document.getElementById('p-salvar'), async () => {
      try {
        for (const ev of _eventos) {
          const marcado = document.querySelector(`.p-ev[value="${ev.id}"]`).checked;
          if (!marcado) { await removerPermissao(ev.id, usuarioId); continue; }
          const campos = { papel: 'personalizado' };
          document.querySelectorAll(`.p-perm[data-para="${ev.id}"]`).forEach(c => { campos[c.value] = c.checked; });
          const teto = document.querySelector(`.p-teto[data-para="${ev.id}"]`).value;
          campos.teto_aprovacao = teto ? Number(teto) : null;
          await salvarPermissao(ev.id, usuarioId, campos);
        }
        aviso('Permissões atualizadas.');
        fecharModal();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}
