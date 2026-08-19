// ═══════════════════════════════════════════════════════
// Produtora — dados da empresa em que se está operando
// ═══════════════════════════════════════════════════════

import {
  sessao, empresaAtual, salvarEmpresa, souAdmin,
  enviarLogo, comprimirImagem, listarEventos, listarFornecedores,
} from './nucleo.js';
import { esc, aviso, comBotao, numero, iniciais } from './ui.js';

export async function telaProdutora() {
  const alvo = document.querySelector('#conteudo');
  const emp = empresaAtual();
  if (!emp) {
    alvo.innerHTML = `<div class="vazio"><h3>Sem produtora</h3><p>Você não está vinculado a nenhuma produtora.</p></div>`;
    return;
  }

  const podeEditar = souAdmin(emp.id);
  let eventos = [], fornecedores = [];
  try {
    [eventos, fornecedores] = await Promise.all([listarEventos(), listarFornecedores(emp.id)]);
  } catch (e) { /* números são complemento; a tela funciona sem eles */ }

  const meu = sessao.membros.find(m => m.empresa?.id === emp.id);
  const PAPEL = { mestre: 'Mestre', administrador: 'Administrador', membro: 'Membro' };

  alvo.innerHTML = `
    <div class="pagina-topo"><h1>Produtora</h1></div>

    <div class="cartao" style="margin-bottom:16px">
      <div class="envio-logo" style="margin-bottom:18px">
        ${emp.logo_url
          ? `<img class="previa" id="e-previa" src="${esc(emp.logo_url)}" alt="">`
          : `<div class="previa" id="e-previa-vazia" style="display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--texto-3)">${esc(iniciais(emp.nome))}</div>`}
        <div>
          <div style="font-size:17px;font-weight:600">${esc(emp.nome)}</div>
          <div style="font-size:13px;color:var(--texto-2)">
            ${emp.cnpj ? esc(emp.cnpj) : 'sem CNPJ cadastrado'} · você é ${esc(PAPEL[meu?.papel] || 'membro')}
          </div>
        </div>
      </div>

      ${podeEditar ? `
        <form id="fe">
          <div class="linha linha-2">
            <div class="campo">
              <label for="e-nome">Nome</label>
              <input class="controle" id="e-nome" value="${esc(emp.nome)}" required>
            </div>
            <div class="campo">
              <label for="e-cnpj">CNPJ</label>
              <input class="controle" id="e-cnpj" value="${esc(emp.cnpj || '')}" placeholder="00.000.000/0001-00">
            </div>
          </div>
          <div class="campo">
            <label>Logo</label>
            <div class="envio-logo">
              <button type="button" class="botao" id="e-escolher">Escolher imagem</button>
              <input type="file" id="e-arquivo" accept="image/*">
              <span class="dica" id="e-nome-arquivo" style="margin-top:0">Aparece no topo e no cabeçalho dos relatórios</span>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;padding-top:14px;border-top:1px solid var(--borda)">
            <button type="submit" class="botao botao-primario" id="e-salvar">Salvar</button>
          </div>
        </form>` : `
        <p style="font-size:13px;color:var(--texto-2)">
          Apenas administradores da produtora editam estes dados.
        </p>`}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
      <div class="metrica">
        <div class="rotulo">Eventos</div>
        <div class="valor">${numero(eventos.length)}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Fornecedores</div>
        <div class="valor">${numero(fornecedores.length)}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Público estimado</div>
        <div class="valor">${numero(eventos.reduce((a, e) => a + (e.publico_estimado || 0), 0))}</div>
      </div>
    </div>

    ${sessao.membros.length > 1 ? `
      <h2 style="font-size:15px;margin:24px 0 10px">Outras produtoras em que você atua</h2>
      <div class="cartao" style="padding:0;overflow:hidden">
        ${sessao.membros.slice(1).map(m => `
          <div class="linha-lista">
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:14px">${esc(m.empresa?.nome || '—')}</div>
              <div style="font-size:12px;color:var(--texto-2)">${esc(PAPEL[m.papel] || m.papel)}</div>
            </div>
          </div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--texto-3);margin-top:8px">
        Cada produtora tem seus dados isolados. Nada é somado entre elas.
      </p>` : ''}
  `;

  if (!podeEditar) return;

  const q = s => document.querySelector(s);
  let arquivo = null;

  q('#e-escolher').addEventListener('click', () => q('#e-arquivo').click());
  q('#e-arquivo').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return aviso('Escolha um arquivo de imagem.', 'erro');
    try {
      arquivo = await comprimirImagem(f, 512);
      q('#e-nome-arquivo').textContent = 'Imagem escolhida — clique em Salvar';
      const previa = q('#e-previa');
      if (previa) previa.src = URL.createObjectURL(arquivo);
    } catch (err) { aviso(err.message, 'erro'); }
  });

  q('#fe').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = q('#e-nome').value.trim();
    if (!nome) return aviso('Informe o nome da produtora.', 'aviso');

    await comBotao(q('#e-salvar'), async () => {
      try {
        const dados = { nome, cnpj: q('#e-cnpj').value };
        if (arquivo) dados.logo_url = await enviarLogo(arquivo, 'empresa');
        await salvarEmpresa(emp.id, dados);
        aviso('Dados da produtora atualizados.');
        document.dispatchEvent(new CustomEvent('produtora-alterada'));
        await telaProdutora();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}
