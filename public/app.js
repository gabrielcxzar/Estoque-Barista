const API_URL = '/api/produtos';
let produtosCache = [];
let categoriasCache = [];
let carrinhoMovimento = [];
let editando = false;
let tipoMovimento = 'SAIDA';
let usuarioAtual = null;

const users = {
    'admin': 'admin',
    'barista': 'cafe'
};

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    const dataEl = document.getElementById('dataAtual');
    if (dataEl) dataEl.innerText = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
});

// --- LOGIN ---
function fazerLogin(e) {
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim().toLowerCase();
    const pass = document.getElementById('loginPass').value.trim();
    const errorMsg = document.getElementById('loginError');

    if (users[user] && users[user] === pass) {
        usuarioAtual = user;
        document.getElementById('displayUser').innerText = user.charAt(0).toUpperCase() + user.slice(1);
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        carregarDadosIniciais();
    } else {
        errorMsg.innerText = 'Credenciais inválidas';
        const form = document.getElementById('loginForm');
        form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 500);
    }
}

function fazerLogout() {
    if(!confirm("Deseja sair do sistema?")) return;
    usuarioAtual = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').innerText = '';
}

// --- NAVEGAÇÃO ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
    
    const screen = document.getElementById(screenId);
    if(screen) screen.classList.add('active');

    const menuMap = {'dashboard':0, 'estoque':1, 'cadastros':2, 'movimentacao':3, 'relatorios':4, 'historico':5};
    if(menuMap[screenId] !== undefined) {
        const btns = document.querySelectorAll('.menu-btn');
        if(btns[menuMap[screenId]]) btns[menuMap[screenId]].classList.add('active');
    }

    if(screenId === 'dashboard') atualizarDashboard();
    if(screenId === 'movimentacao') { 
        carrinhoMovimento = []; 
        renderizarTelaMovimento(); 
        renderizarCarrinho(); 
    }
    if(screenId === 'relatorios') carregarRelatorios();
    if(screenId === 'cadastros') renderizarTelaCadastros();
    if(screenId === 'historico') carregarHistoricoCompleto();
    if(screenId === 'estoque') {
        document.getElementById('buscaEstoque').value = '';
        renderizarTabelaEstoque(produtosCache);
    }
}

async function carregarDadosIniciais() {
    await Promise.all([carregarEstoque(), carregarCategorias()]);
    atualizarDashboard();
}

async function carregarEstoque() {
    try {
        const res = await fetch(API_URL);
        produtosCache = await res.json();
    } catch (e) { showToast('Erro', 'Falha de conexão', 'error'); }
}

async function carregarCategorias() {
    try {
        const res = await fetch('/api/categorias');
        categoriasCache = await res.json();
        atualizarSelectCategoria();
    } catch (e) { console.error(e); }
}

function atualizarSelectCategoria() {
    const select = document.getElementById('categoria');
    if(!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';
    categoriasCache.forEach(c => {
        select.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
    });
}

// --- TELA: ESTOQUE ---
function renderizarTabelaEstoque(lista) {
    const tbody = document.getElementById('tabelaEstoque');
    if(!tbody) return;
    tbody.innerHTML = '';
    const hoje = new Date();

    if(lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999; padding:20px;">Nenhum registro encontrado</td></tr>';
        return;
    }

    lista.forEach(p => {
        let validadeHtml = '<span class="badge badge-neutral">N/A</span>';
        // CORREÇÃO: Só valida data se tiver estoque positivo
        if(p.data_validade && parseFloat(p.quantidade) > 0) {
            const val = new Date(p.data_validade);
            val.setDate(val.getDate() + 1);
            const diff = Math.ceil((val - hoje) / 86400000);
            
            if(diff < 0) validadeHtml = `<span class="badge badge-danger">Vencido</span>`;
            else if(diff < 15) validadeHtml = `<span class="badge badge-warning">${diff} dias</span>`;
            else validadeHtml = `<span class="badge badge-success">OK</span>`;
        } else if (parseFloat(p.quantidade) <= 0) {
             validadeHtml = `<span class="badge badge-neutral">-</span>`;
        }

        const baixo = parseFloat(p.quantidade) <= parseFloat(p.estoque_minimo);
        const statusHtml = baixo 
            ? `<span class="badge badge-danger">Crítico</span>` 
            : `<span class="badge badge-success">Normal</span>`;

        tbody.innerHTML += `
            <tr>
                <td><div style="font-weight:600">${p.nome}</div></td>
                <td>${p.categoria || '-'}</td>
                <td><strong style="${baixo ? 'color:var(--danger-text)' : ''}">${p.quantidade}</strong> <small style="color:#777">${p.unidade}</small></td>
                <td>${validadeHtml}</td>
                <td>${statusHtml}</td>
            </tr>
        `;
    });
    lucide.createIcons();
}

function filtrarTabelaEstoque(termo) {
    const t = termo.toLowerCase();
    const filtrados = produtosCache.filter(p => p.nome.toLowerCase().includes(t) || (p.categoria || '').toLowerCase().includes(t));
    renderizarTabelaEstoque(filtrados);
}

// --- TELA: CADASTROS ---
function renderizarTelaCadastros() {
    const tbody = document.getElementById('tabelaCadastros');
    if(tbody) {
        tbody.innerHTML = '';
        produtosCache.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${p.nome}</strong><div style="font-size:0.8rem; color:#888">${p.quantidade} ${p.unidade}</div></td>
                    <td>${p.categoria || '-'}</td>
                    <td style="text-align:right">
                        <button class="btn btn-ghost" onclick='editarItem(${JSON.stringify(p)})' title="Editar"><i data-lucide="edit-2" size="16"></i></button>
                        <button class="btn btn-ghost" style="color:#DC2626" onclick="deletarItem(${p.id})" title="Excluir"><i data-lucide="trash-2" size="16"></i></button>
                    </td>
                </tr>
            `;
        });
    }

    const listaCat = document.getElementById('listaCategorias');
    if(listaCat) {
        listaCat.innerHTML = '';
        if(categoriasCache.length === 0) listaCat.innerHTML = '<li style="padding:10px; color:#888; text-align:center">Nenhuma categoria</li>';
        categoriasCache.forEach(c => {
            listaCat.innerHTML += `
                <li class="cat-item">
                    <span>${c.nome}</span>
                    <button class="btn btn-ghost" style="color:#DC2626; padding:4px" onclick="deletarCategoria(${c.id})"><i data-lucide="trash-2" size="14"></i></button>
                </li>
            `;
        });
    }
    lucide.createIcons();
}

function filtrarTabelaCadastros(termo) {
    const t = termo.toLowerCase();
    const tbody = document.getElementById('tabelaCadastros');
    if(!tbody) return;
    tbody.innerHTML = '';
    produtosCache.filter(p => p.nome.toLowerCase().includes(t)).forEach(p => {
        tbody.innerHTML += `<tr><td><strong>${p.nome}</strong><br><small>${p.quantidade}</small></td><td>${p.categoria || '-'}</td><td style="text-align:right"><button class="btn btn-ghost" onclick='editarItem(${JSON.stringify(p)})'><i data-lucide="edit-2" size="16"></i></button><button class="btn btn-ghost" style="color:#DC2626" onclick="deletarItem(${p.id})"><i data-lucide="trash-2" size="16"></i></button></td></tr>`;
    });
    lucide.createIcons();
}

async function adicionarCategoria() {
    const input = document.getElementById('novaCategoria');
    const nome = input.value.trim();
    if(!nome) return showToast('Atenção', 'Informe o nome da categoria', 'error');

    await fetch('/api/categorias', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nome }) });
    input.value = ''; await carregarCategorias(); renderizarTelaCadastros(); showToast('Sucesso', 'Categoria salva');
}

async function deletarCategoria(id) {
    if(!confirm('Confirmar exclusão?')) return;
    await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
    await carregarCategorias(); renderizarTelaCadastros(); showToast('Info', 'Categoria removida');
}

// --- TELA: MOVIMENTAÇÃO (PDV) ---
function setModo(modo) {
    tipoMovimento = modo;
    document.getElementById('btnModoSaida').className = modo === 'SAIDA' ? 'mode-btn active-saida' : 'mode-btn';
    document.getElementById('btnModoEntrada').className = modo === 'ENTRADA' ? 'mode-btn active-entrada' : 'mode-btn';
    document.getElementById('tituloCarrinho').innerText = modo === 'SAIDA' ? 'Itens para Saída' : 'Itens para Entrada';
    const btn = document.getElementById('btnFinalizarMovimento');
    btn.innerText = modo === 'SAIDA' ? 'Confirmar Saída' : 'Confirmar Entrada';
    btn.className = modo === 'SAIDA' ? 'btn btn-primary' : 'btn btn-success'; // Nota: btn-success deve existir no CSS ou usar primary

    carrinhoMovimento = [];
    renderizarCarrinho();
}

function renderizarTelaMovimento(filtro = '') {
    const container = document.getElementById('listaProdutosMovimento');
    if(!container) return;
    container.innerHTML = '';
    
    const filtrados = produtosCache.filter(p => p.nome.toLowerCase().includes(filtro.toLowerCase()));
    
    filtrados.forEach(p => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div>
                <div style="font-weight:600">${p.nome}</div>
                <div style="font-size:0.8rem; color:var(--text-muted)">Atual: ${p.quantidade} ${p.unidade}</div>
            </div>
            <i data-lucide="plus-circle" style="color:var(--text-muted)"></i>
        `;
        div.onclick = () => adicionarAoCarrinho(p);
        container.appendChild(div);
    });
    lucide.createIcons();
}

function adicionarAoCarrinho(p) {
    const existe = carrinhoMovimento.find(item => item.id === p.id);
    if(existe) {
        existe.movimento++;
    } else {
        // Se for entrada, sugere a data atual como validade (ou vazia para forçar preenchimento)
        // Aqui deixamos vazio ou a validade antiga se existir
        let validadeSugerida = p.data_validade ? p.data_validade.split('T')[0] : '';
        carrinhoMovimento.push({ ...p, movimento: 1, novaValidade: validadeSugerida });
    }
    renderizarCarrinho();
}

function renderizarCarrinho() {
    const container = document.getElementById('carrinhoLista');
    if(!container) return;

    if(carrinhoMovimento.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">Selecione itens ao lado</div>`;
        return;
    }
    
    container.innerHTML = '';
    carrinhoMovimento.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'stretch';

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <div style="flex:1">
                    <div style="font-weight:600; font-size:0.9rem">${item.nome}</div>
                    <div style="font-size:0.75rem; color:#888">Atual: ${item.quantidade}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="number" value="${item.movimento}" min="0.1" step="0.1" style="width:70px; padding:5px;" onchange="atualizarQtdCarrinho(${index}, this.value)">
                    <button class="btn btn-ghost" style="color:#DC2626; padding:4px;" onclick="removerDoCarrinho(${index})">
                        <i data-lucide="x" size="16"></i>
                    </button>
                </div>
            </div>
        `;

        // DATA DE VALIDADE POR ITEM (SÓ NA ENTRADA)
        if (tipoMovimento === 'ENTRADA') {
            html += `
                <div style="margin-top:8px; border-top:1px dashed #eee; padding-top:4px;">
                    <label style="font-size:0.7rem; color:#166534; font-weight:600;">Nova Validade:</label>
                    <input type="date" value="${item.novaValidade || ''}" style="width:100%; padding:4px; font-size:0.8rem; border-color:#166534;" onchange="atualizarValidadeCarrinho(${index}, this.value)">
                </div>
            `;
        }

        div.innerHTML = html;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function atualizarQtdCarrinho(index, qtd) { carrinhoMovimento[index].movimento = parseFloat(qtd); }
function atualizarValidadeCarrinho(index, data) { carrinhoMovimento[index].novaValidade = data; }
function removerDoCarrinho(index) { carrinhoMovimento.splice(index, 1); renderizarCarrinho(); }

async function finalizarMovimentacao() {
    if(carrinhoMovimento.length === 0) return showToast('Atenção', 'Adicione itens primeiro', 'error');
    if(carrinhoMovimento.some(i => i.movimento <= 0)) return showToast('Erro', 'Quantidades inválidas', 'error');
    
    if (tipoMovimento === 'SAIDA') {
        const insuficientes = carrinhoMovimento.filter(i => i.movimento > i.quantidade);
        if (insuficientes.length > 0) {
            return showToast('Bloqueado', `Saldo insuficiente: ${insuficientes[0].nome}`, 'error');
        }
    }
    
    const verbo = tipoMovimento === 'SAIDA' ? 'baixa' : 'entrada';
    if(!confirm(`Confirmar ${verbo}?`)) return;

    let erros = 0;
    for (const item of carrinhoMovimento) {
        try {
            if (tipoMovimento === 'SAIDA') {
                const res = await fetch(`${API_URL}/${item.id}/baixa`, {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ quantidade_saida: item.movimento, usuario: usuarioAtual })
                });
                if(!res.ok) erros++;
            } else {
                // Na entrada, atualizamos a data se o usuário informou
                const novaQtd = parseFloat(item.quantidade) + parseFloat(item.movimento);
                const dadosAtualizados = {
                    nome: item.nome,
                    categoria: item.categoria,
                    quantidade: novaQtd,
                    unidade: item.unidade,
                    estoque_minimo: item.estoque_minimo,
                    preco: item.preco,
                    data_validade: item.novaValidade || item.data_validade, // Usa a nova data do input
                    usuario: usuarioAtual
                };
                
                const res = await fetch(`${API_URL}/${item.id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(dadosAtualizados)
                });
                if(!res.ok) erros++;
            }
        } catch(e) { erros++; }
    }

    if(erros === 0) {
        showToast('Sucesso', 'Operação realizada');
        carrinhoMovimento = [];
        renderizarCarrinho();
        carregarEstoque(); 
        if(document.getElementById('dashboard').classList.contains('active')) atualizarDashboard();
    } else {
        showToast('Erro', `Falha ao processar alguns itens`, 'error');
        carregarEstoque();
    }
}

// ==========================================
// 6. RELATÓRIOS (CORRIGIDO)
// ==========================================
async function carregarRelatorios() {
    const hoje = new Date();
    
    // 1. Vencimentos - CORREÇÃO: Filtra qtd > 0
    const listaVencimentos = produtosCache
        .filter(p => p.data_validade && parseFloat(p.quantidade) > 0)
        .sort((a,b) => new Date(a.data_validade) - new Date(b.data_validade));
        
    const tbodyVenc = document.getElementById('relVencimentos');
    tbodyVenc.innerHTML = '';
    
    if(listaVencimentos.length === 0) {
        tbodyVenc.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#999;">Nenhum item próximo do vencimento.</td></tr>';
    } else {
        listaVencimentos.forEach(p => {
            const val = new Date(p.data_validade); 
            val.setDate(val.getDate() + 1);
            const diff = Math.ceil((val - hoje) / 86400000);
            
            if(diff < 0) {
                tbodyVenc.innerHTML += `<tr><td><strong>${p.nome}</strong></td><td class="text-danger">${val.toLocaleDateString()}</td><td><span class="badge badge-danger">VENCIDO</span></td></tr>`;
            } else if (diff <= 15) {
                tbodyVenc.innerHTML += `<tr><td>${p.nome}</td><td class="text-warning">${val.toLocaleDateString()}</td><td><span class="badge badge-warning">Vence em ${diff} dias</span></td></tr>`;
            }
        });
    }

    // 2. Críticos
    const criticos = produtosCache.filter(p => parseFloat(p.quantidade) <= parseFloat(p.estoque_minimo));
    const tbodyCrit = document.getElementById('relCriticos');
    if(criticos.length === 0) {
        tbodyCrit.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#999;">Estoque saudável.</td></tr>';
    } else {
        tbodyCrit.innerHTML = criticos.map(p => `<tr><td><strong>${p.nome}</strong></td><td>${p.quantidade} ${p.unidade}</td><td class="text-danger">${p.estoque_minimo}</td></tr>`).join('');
    }

    // 3. Mais Saídos
    try {
        const res = await fetch('/api/relatorios/mais-saidos');
        const saidos = await res.json();
        const tbodySaidos = document.getElementById('relSaidos');
        if(saidos.length === 0) {
            tbodySaidos.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#999;">Sem dados recentes.</td></tr>';
        } else {
            tbodySaidos.innerHTML = saidos.map(p => `<tr><td>${p.nome}</td><td><strong>${p.total_saida}</strong> ${p.unidade}</td></tr>`).join('');
        }
    } catch(e) { console.error(e); }
    
    lucide.createIcons();
}

// ==========================================
// 7. UTILS GERAIS
// ==========================================
async function atualizarDashboard() {
    if(produtosCache.length === 0) await carregarEstoque();
    let total = 0, criticos = 0, vencendo = 0;
    const hoje = new Date();

    produtosCache.forEach(p => {
        total += (parseFloat(p.preco||0) * parseFloat(p.quantidade));
        if(parseFloat(p.quantidade) <= parseFloat(p.estoque_minimo)) criticos++;
        // CORREÇÃO: Só conta vencendo se tiver estoque
        if(p.data_validade && parseFloat(p.quantidade) > 0) {
            const diff = (new Date(p.data_validade) - hoje) / 86400000;
            if(diff <= 7) vencendo++; 
        }
    });

    document.getElementById('dashValorTotal').innerText = total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    document.getElementById('dashItensCriticos').innerText = criticos;
    document.getElementById('dashVencendo').innerText = vencendo;

    try {
        const res = await fetch('/api/movimentacoes');
        const movs = await res.json();
        const tbody = document.getElementById('dashUltimasAtividades');
        if(tbody) {
            tbody.innerHTML = movs.slice(0,5).map(m => `
                <tr>
                    <td style="color:var(--text-muted)">${new Date(m.data_movimentacao).toLocaleDateString()}</td>
                    <td>${m.usuario || 'Sistema'}</td>
                    <td>${m.produto_nome}</td>
                    <td>${formatarTipo(m.tipo)}</td>
                    <td>${m.quantidade}</td>
                </tr>`).join('');
            lucide.createIcons();
        }
    } catch(e) {}
}

async function carregarHistoricoCompleto() {
    try {
        const res = await fetch('/api/movimentacoes');
        const lista = await res.json();
        const tbody = document.getElementById('tabelaHistoricoCompleta');
        if(tbody) {
            tbody.innerHTML = lista.map(m => `
                <tr>
                    <td style="color:var(--text-muted)">${new Date(m.data_movimentacao).toLocaleString()}</td>
                    <td style="font-weight:500; color:var(--primary)">${m.usuario || 'Sistema'}</td>
                    <td><strong>${m.produto_nome}</strong></td>
                    <td>${formatarTipo(m.tipo)}</td>
                    <td>${m.quantidade}</td>
                </tr>`).join('');
            lucide.createIcons();
        }
    } catch(e) {}
}

function formatarTipo(t) {
    if(t.includes('ENTRADA')) return '<span class="badge badge-success">Entrada</span>';
    if(t.includes('SAIDA')) return '<span class="badge badge-danger">Saída</span>';
    return `<span class="badge badge-warning">${t}</span>`;
}

function abrirModalCadastro() {
    editando = false;
    document.getElementById('formProduto').reset();
    document.getElementById('modalTitle').innerText = "Novo Item";
    const inputQtd = document.getElementById('quantidade');
    inputQtd.disabled = false; inputQtd.style.backgroundColor = "white";
    document.getElementById('avisoEdicao').style.display = "none";
    document.getElementById('modalForm').style.display = 'flex';
    atualizarSelectCategoria();
}

function editarItem(p) {
    editando = true;
    document.getElementById('modalTitle').innerText = "Editar Item";
    document.getElementById('id_produto').value = p.id;
    document.getElementById('nome').value = p.nome;
    document.getElementById('categoria').value = p.categoria;
    document.getElementById('quantidade').value = p.quantidade;
    document.getElementById('unidade').value = p.unidade;
    document.getElementById('estoque_minimo').value = p.estoque_minimo;
    document.getElementById('preco').value = p.preco;
    if(p.data_validade) document.getElementById('data_validade').value = p.data_validade.split('T')[0];

    const inputQtd = document.getElementById('quantidade');
    inputQtd.disabled = true; inputQtd.style.backgroundColor = "#f5f5f4";
    document.getElementById('avisoEdicao').style.display = "block";
    document.getElementById('modalForm').style.display = 'flex';
}

document.getElementById('formProduto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
        nome: document.getElementById('nome').value,
        categoria: document.getElementById('categoria').value,
        quantidade: parseFloat(document.getElementById('quantidade').value),
        unidade: document.getElementById('unidade').value,
        estoque_minimo: parseFloat(document.getElementById('estoque_minimo').value),
        preco: parseFloat(document.getElementById('preco').value),
        data_validade: document.getElementById('data_validade').value,
        usuario: usuarioAtual
    };
    const id = document.getElementById('id_produto').value;
    const url = editando ? `${API_URL}/${id}` : API_URL;
    const method = editando ? 'PUT' : 'POST';

    try {
        await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(dados) });
        fecharModais(); await carregarEstoque();
        if(document.getElementById('cadastros').classList.contains('active')) renderizarTelaCadastros();
        if(document.getElementById('estoque').classList.contains('active')) renderizarTabelaEstoque(produtosCache);
        showToast('Sucesso', 'Salvo!');
    } catch (e) { showToast('Erro', 'Falha ao salvar', 'error'); }
});

async function deletarItem(id) {
    if(confirm('Confirmar exclusão?')) { 
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); 
        carregarEstoque().then(() => {
            renderizarTelaCadastros();
            showToast('Info', 'Removido');
        });
    }
}

function gerarListaApenasCriticos() {
    const criticos = produtosCache.filter(p => parseFloat(p.quantidade) <= parseFloat(p.estoque_minimo));
    if(criticos.length === 0) return showToast('Info', 'Nenhum item crítico.');
    const texto = "LISTA DE COMPRAS (URGENTE)\n\n" + criticos.map(p => `- [ ] ${p.nome} (Atual: ${p.quantidade})`).join('\n');
    document.getElementById('textoLista').value = texto;
    document.getElementById('modalResultado').style.display = 'flex';
}

function copiarLista() { document.getElementById('textoLista').select(); document.execCommand('copy'); showToast('Sucesso', 'Copiado!'); fecharModais(); }
function fecharModais() { document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none'); }
function showToast(title, msg, type='success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div style="flex:1"><strong>${title}</strong><br><small>${msg}</small></div>`;
    container.appendChild(toast); setTimeout(() => toast.remove(), 3000);
}