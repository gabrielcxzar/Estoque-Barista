const API_URL = '/api/produtos';
let produtosCache = [];
let categoriasCache = [];
let carrinhoMovimento = [];
let itemSendoAdicionado = null; // Armazena o produto temporário durante o modal
let tipoMovimento = 'SAIDA'; // 'SAIDA' ou 'ENTRADA'
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

// ==========================================
// 1. LOGIN
// ==========================================
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
        errorMsg.innerText = 'Acesso negado';
        document.getElementById('loginForm').classList.add('shake');
        setTimeout(() => document.getElementById('loginForm').classList.remove('shake'), 500);
    }
}

function fazerLogout() {
    if(!confirm("Sair do sistema?")) return;
    usuarioAtual = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('loginForm').reset();
}

// ==========================================
// 2. DADOS & NAVEGAÇÃO
// ==========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
    
    const screen = document.getElementById(screenId);
    if(screen) screen.classList.add('active');

    const menuMap = {'dashboard':0, 'estoque':1, 'cadastros':2, 'movimentacao':3, 'relatorios':4, 'historico':5};
    if(menuMap[screenId] !== undefined) {
        document.querySelectorAll('.menu-btn')[menuMap[screenId]].classList.add('active');
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
        carregarEstoque().then(() => renderizarTabelaEstoque(produtosCache));
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
    } catch (e) { showToast('Erro', 'Erro de conexão', 'error'); }
}

async function carregarCategorias() {
    const res = await fetch('/api/categorias');
    categoriasCache = await res.json();
    atualizarSelectCategoria();
}

function atualizarSelectCategoria() {
    const select = document.getElementById('categoria');
    if(!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';
    categoriasCache.forEach(c => select.innerHTML += `<option value="${c.nome}">${c.nome}</option>`);
}

// ==========================================
// 3. MOVIMENTAÇÃO COM LOTES (NOVA LÓGICA)
// ==========================================
function setModo(modo) {
    tipoMovimento = modo;
    document.getElementById('btnModoSaida').className = modo === 'SAIDA' ? 'mode-btn active-saida' : 'mode-btn';
    document.getElementById('btnModoEntrada').className = modo === 'ENTRADA' ? 'mode-btn active-entrada' : 'mode-btn';
    document.getElementById('tituloCarrinho').innerText = modo === 'SAIDA' ? 'Saída (Por Lote)' : 'Entrada (Novo Lote)';
    const btn = document.getElementById('btnFinalizarMovimento');
    btn.innerText = modo === 'SAIDA' ? 'Confirmar Saída' : 'Confirmar Entrada';
    btn.className = modo === 'SAIDA' ? 'btn btn-primary' : 'btn btn-success';
    
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
                <div style="font-size:0.8rem; color:var(--text-muted)">Total: ${p.quantidade_total || 0} ${p.unidade}</div>
            </div>
            <i data-lucide="plus-circle" style="color:var(--text-muted)"></i>
        `;
        // AGORA ABRE MODAL DE LOTE
        div.onclick = () => abrirModalLote(p);
        container.appendChild(div);
    });
    lucide.createIcons();
}

// --- MODAL DE LOTES ---
async function abrirModalLote(produto) {
    itemSendoAdicionado = produto;
    document.getElementById('tituloModalLote').innerText = tipoMovimento === 'SAIDA' ? `Saída: ${produto.nome}` : `Entrada: ${produto.nome}`;
    document.getElementById('inputQtdLote').value = '';
    
    const divEntrada = document.getElementById('conteudoLoteEntrada');
    const divSaida = document.getElementById('conteudoLoteSaida');
    
    if (tipoMovimento === 'ENTRADA') {
        divEntrada.style.display = 'block';
        divSaida.style.display = 'none';
        // Sugerir número de lote (Data atual)
        const hoje = new Date();
        document.getElementById('inputNumeroLote').value = `Lote ${hoje.getDate()}/${hoje.getMonth()+1}`;
        document.getElementById('inputValidadeLote').value = '';
    } else {
        divEntrada.style.display = 'none';
        divSaida.style.display = 'block';
        
        // Buscar lotes disponíveis deste produto
        const containerLotes = document.getElementById('listaLotesDisponiveis');
        containerLotes.innerHTML = '<p style="color:#888">Carregando lotes...</p>';
        
        try {
            const res = await fetch(`/api/produtos/${produto.id}/lotes`);
            const lotes = await res.json();
            
            containerLotes.innerHTML = '';
            if (lotes.length === 0) {
                containerLotes.innerHTML = '<p style="color:red">Sem estoque disponível.</p>';
            } else {
                lotes.forEach(l => {
                    const validade = l.data_validade ? new Date(l.data_validade).toLocaleDateString() : 'N/A';
                    containerLotes.innerHTML += `
                        <label class="lote-option">
                            <input type="radio" name="loteSelecionado" value="${l.id}" data-qtd="${l.quantidade}" data-num="${l.numero}">
                            <div class="lote-info">
                                <div class="lote-num">${l.numero}</div>
                                <div class="lote-detalhe">Val: ${validade} | Disp: <strong>${l.quantidade}</strong></div>
                            </div>
                        </label>
                    `;
                });
            }
        } catch (e) { containerLotes.innerHTML = '<p style="color:red">Erro ao buscar lotes.</p>'; }
    }

    document.getElementById('modalLote').style.display = 'flex';
}

function confirmarAdicaoCarrinho() {
    const qtd = parseFloat(document.getElementById('inputQtdLote').value);
    
    if (!qtd || qtd <= 0) return showToast('Erro', 'Quantidade inválida', 'error');

    let itemCarrinho = {
        ...itemSendoAdicionado,
        movimento: qtd
    };

    if (tipoMovimento === 'ENTRADA') {
        const numLote = document.getElementById('inputNumeroLote').value;
        const validade = document.getElementById('inputValidadeLote').value;
        
        if (!numLote) return showToast('Erro', 'Informe o número do lote', 'error');
        
        itemCarrinho.lote_numero = numLote;
        itemCarrinho.lote_validade = validade;
        itemCarrinho.tipo = 'ENTRADA';
    } else {
        // SAÍDA
        const radio = document.querySelector('input[name="loteSelecionado"]:checked');
        if (!radio) return showToast('Erro', 'Selecione um lote para retirar', 'error');
        
        const saldoLote = parseFloat(radio.dataset.qtd);
        if (qtd > saldoLote) return showToast('Erro', `Saldo insuficiente no lote (${saldoLote})`, 'error');

        itemCarrinho.lote_id = radio.value;
        itemCarrinho.lote_numero = radio.dataset.num;
        itemCarrinho.tipo = 'SAIDA';
    }

    carrinhoMovimento.push(itemCarrinho);
    renderizarCarrinho();
    fecharModais();
}

function renderizarCarrinho() {
    const container = document.getElementById('carrinhoLista');
    const totalEl = document.getElementById('totalItensCarrinho');
    if(!container) return;

    totalEl.innerText = carrinhoMovimento.length;
    container.innerHTML = '';

    if(carrinhoMovimento.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">Selecione itens ao lado</div>`;
        return;
    }
    
    carrinhoMovimento.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        
        let detalhesLote = item.tipo === 'ENTRADA' 
            ? `Entrada: ${item.lote_numero}` 
            : `Saída: ${item.lote_numero}`;

        div.innerHTML = `
            <div class="cart-item-row">
                <div style="flex:1">
                    <div style="font-weight:600; font-size:0.9rem">${item.nome}</div>
                    <div style="font-size:0.75rem; color:var(--primary)">${detalhesLote}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:bold;">${item.movimento}</span>
                    <button class="btn btn-ghost" style="color:#DC2626; padding:4px;" onclick="removerDoCarrinho(${index})">
                        <i data-lucide="x" size="16"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function removerDoCarrinho(index) {
    carrinhoMovimento.splice(index, 1);
    renderizarCarrinho();
}

async function finalizarMovimentacao() {
    if(carrinhoMovimento.length === 0) return showToast('Vazio', 'Carrinho vazio', 'error');
    
    if(!confirm(`Confirmar ${carrinhoMovimento.length} movimentações?`)) return;

    let erros = 0;
    for (const item of carrinhoMovimento) {
        try {
            let endpoint = item.tipo === 'ENTRADA' ? '/api/movimentacao/entrada' : '/api/movimentacao/saida';
            let body = {
                produto_id: item.id,
                quantidade: item.movimento,
                usuario: usuarioAtual,
                // Campos específicos
                lote_id: item.lote_id, // Apenas saída
                novo_numero_lote: item.lote_numero, // Apenas entrada
                nova_validade: item.lote_validade // Apenas entrada
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body)
            });
            
            if(!res.ok) erros++;
        } catch(e) { erros++; }
    }

    if(erros === 0) {
        showToast('Sucesso', 'Movimentações registradas!');
        carrinhoMovimento = [];
        renderizarCarrinho();
        carregarEstoque();
    } else {
        showToast('Atenção', 'Alguns itens falharam.', 'error');
        carregarEstoque();
    }
}

// ==========================================
// 4. RELATÓRIOS (AGORA COM LOTES)
// ==========================================
async function carregarRelatorios() {
    const hoje = new Date();
    
    // 1. VENCIMENTO POR LOTE (API Filtrada)
    try {
        const res = await fetch('/api/relatorios/vencimento');
        const lotesVencimento = await res.json();
        const tbody = document.getElementById('relVencimentos');
        
        if (lotesVencimento.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">Nenhum lote vencendo.</td></tr>';
        } else {
            tbody.innerHTML = lotesVencimento.map(l => {
                const val = new Date(l.data_validade);
                val.setDate(val.getDate() + 1);
                const diff = Math.ceil((val - hoje) / 86400000);
                
                let status = '';
                if(diff < 0) status = '<span class="badge badge-danger">VENCIDO</span>';
                else if(diff < 15) status = `<span class="badge badge-warning">${diff} dias</span>`;
                else status = '<span class="badge badge-success">OK</span>';

                return `
                    <tr>
                        <td><strong>${l.nome}</strong></td>
                        <td style="font-size:0.8rem; color:#666;">${l.lote}</td>
                        <td class="${diff < 0 ? 'text-danger' : ''}">${val.toLocaleDateString()}</td>
                        <td>${l.quantidade} ${l.unidade}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch(e) {}

    // 2. CRÍTICOS (Baseado no Total)
    const criticos = produtosCache.filter(p => parseFloat(p.quantidade_total) <= parseFloat(p.estoque_minimo));
    const tbodyCrit = document.getElementById('relCriticos');
    if(criticos.length === 0) {
        tbodyCrit.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#999;">Estoque saudável.</td></tr>';
    } else {
        tbodyCrit.innerHTML = criticos.map(p => `
            <tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.quantidade_total} ${p.unidade}</td>
                <td class="text-danger">${p.estoque_minimo}</td>
            </tr>
        `).join('');
    }

    // 3. MAIS SAÍDOS
    try {
        const res = await fetch('/api/relatorios/mais-saidos');
        const saidos = await res.json();
        document.getElementById('relSaidos').innerHTML = saidos.map(p => `
            <tr><td>${p.nome}</td><td><strong>${p.total_saida}</strong> ${p.unidade}</td></tr>
        `).join('');
    } catch(e) {}
    
    lucide.createIcons();
}

// ==========================================
// 5. CRUD BÁSICO (CADASTROS)
// ==========================================
function renderizarTelaCadastros() {
    const tbody = document.getElementById('tabelaCadastros');
    if(!tbody) return;
    tbody.innerHTML = '';
    produtosCache.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.categoria || '-'}</td>
                <td style="text-align:right">
                    <button class="btn btn-ghost" onclick='editarItem(${JSON.stringify(p)})'><i data-lucide="edit-2" size="16"></i></button>
                    <button class="btn btn-ghost" style="color:#DC2626" onclick="deletarItem(${p.id})"><i data-lucide="trash-2" size="16"></i></button>
                </td>
            </tr>
        `;
    });
    const listaCat = document.getElementById('listaCategorias');
    if(listaCat) {
        listaCat.innerHTML = '';
        categoriasCache.forEach(c => {
            listaCat.innerHTML += `<li class="cat-item"><span>${c.nome}</span><button class="btn btn-ghost" style="color:#DC2626; padding:4px" onclick="deletarCategoria(${c.id})"><i data-lucide="trash-2" size="14"></i></button></li>`;
        });
    }
    lucide.createIcons();
}

function filtrarTabelaCadastros(termo) {
    const t = termo.toLowerCase();
    const tbody = document.getElementById('tabelaCadastros');
    tbody.innerHTML = '';
    produtosCache.filter(p => p.nome.toLowerCase().includes(t)).forEach(p => {
        tbody.innerHTML += `<tr><td><strong>${p.nome}</strong></td><td>${p.categoria || '-'}</td><td style="text-align:right"><button class="btn btn-ghost" onclick='editarItem(${JSON.stringify(p)})'><i data-lucide="edit-2" size="16"></i></button><button class="btn btn-ghost" style="color:#DC2626" onclick="deletarItem(${p.id})"><i data-lucide="trash-2" size="16"></i></button></td></tr>`;
    });
    lucide.createIcons();
}

function abrirModalCadastro() {
    editando = false;
    document.getElementById('formProduto').reset();
    document.getElementById('modalTitle').innerText = "Novo Produto";
    document.getElementById('modalForm').style.display = 'flex';
    atualizarSelectCategoria();
}

function editarItem(p) {
    editando = true;
    document.getElementById('modalTitle').innerText = "Editar Produto";
    document.getElementById('id_produto').value = p.id;
    document.getElementById('nome').value = p.nome;
    document.getElementById('categoria').value = p.categoria;
    document.getElementById('unidade').value = p.unidade;
    document.getElementById('estoque_minimo').value = p.estoque_minimo;
    document.getElementById('preco').value = p.preco;
    document.getElementById('modalForm').style.display = 'flex';
}

document.getElementById('formProduto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
        nome: document.getElementById('nome').value,
        categoria: document.getElementById('categoria').value,
        unidade: document.getElementById('unidade').value,
        estoque_minimo: parseFloat(document.getElementById('estoque_minimo').value),
        preco: parseFloat(document.getElementById('preco').value)
    };
    
    const id = document.getElementById('id_produto').value;
    const url = editando ? `${API_URL}/${id}` : API_URL;
    const method = editando ? 'PUT' : 'POST';

    await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(dados) });
    fecharModais();
    await carregarEstoque();
    if(document.getElementById('cadastros').classList.contains('active')) renderizarTelaCadastros();
    showToast('Sucesso', 'Salvo com sucesso!');
});

async function deletarItem(id) {
    if(confirm('Excluir produto e seus lotes?')) { 
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); 
        carregarEstoque().then(() => { renderizarTelaCadastros(); showToast('Info', 'Removido'); });
    }
}

async function adicionarCategoria() {
    const nome = document.getElementById('novaCategoria').value.trim();
    if(!nome) return;
    await fetch('/api/categorias', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nome }) });
    document.getElementById('novaCategoria').value = '';
    await carregarCategorias(); renderizarTelaCadastros();
}

async function deletarCategoria(id) {
    if(!confirm('Excluir categoria?')) return;
    await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
    await carregarCategorias(); renderizarTelaCadastros();
}

// --- UTILS GERAIS ---
function renderizarTabelaEstoque(lista) {
    const tbody = document.getElementById('tabelaEstoque');
    if(!tbody) return;
    tbody.innerHTML = '';
    const hoje = new Date();

    lista.forEach(p => {
        // Status Baseado no Lote mais próximo
        let validadeHtml = '<span class="badge badge-neutral">N/A</span>';
        if(p.proxima_validade) {
            const val = new Date(p.proxima_validade);
            val.setDate(val.getDate() + 1);
            const diff = Math.ceil((val - hoje) / 86400000);
            if(diff < 0) validadeHtml = `<span class="badge badge-danger">Lote Vencido</span>`;
            else if(diff < 15) validadeHtml = `<span class="badge badge-warning">${diff} dias</span>`;
            else validadeHtml = `<span class="badge badge-success">OK</span>`;
        }

        const baixo = parseFloat(p.quantidade_total) <= parseFloat(p.estoque_minimo);
        const statusHtml = baixo 
            ? `<span class="badge badge-danger">Crítico</span>` 
            : `<span class="badge badge-success">Normal</span>`;

        tbody.innerHTML += `
            <tr>
                <td><div style="font-weight:600">${p.nome}</div></td>
                <td>${p.categoria || '-'}</td>
                <td><strong style="${baixo ? 'color:var(--danger-text)' : ''}">${p.quantidade_total}</strong> <small>${p.unidade}</small></td>
                <td>${validadeHtml}</td>
                <td>${statusHtml}</td>
            </tr>
        `;
    });
    lucide.createIcons();
}

function filtrarTabelaEstoque(val) {
    const t = val.toLowerCase();
    const f = produtosCache.filter(p => p.nome.toLowerCase().includes(t));
    renderizarTabelaEstoque(f);
}

async function atualizarDashboard() {
    if(produtosCache.length === 0) await carregarEstoque();
    let total = 0, criticos = 0, vencendo = 0;
    const hoje = new Date();

    produtosCache.forEach(p => {
        total += (parseFloat(p.preco||0) * parseFloat(p.quantidade_total));
        if(parseFloat(p.quantidade_total) <= parseFloat(p.estoque_minimo)) criticos++;
        if(p.proxima_validade) {
            const diff = (new Date(p.proxima_validade) - hoje) / 86400000;
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
                    <td>${m.produto_nome}</td>
                    <td>${formatarTipo(m.tipo)}</td>
                    <td>${m.tipo.includes('Lote') ? m.tipo.split('(')[1].replace(')','') : '-'}</td>
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
                    <td>${new Date(m.data_movimentacao).toLocaleString()}</td>
                    <td>${m.usuario || 'Sistema'}</td>
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

function gerarListaApenasCriticos() {
    const criticos = produtosCache.filter(p => parseFloat(p.quantidade_total) <= parseFloat(p.estoque_minimo));
    if(criticos.length === 0) return showToast('Info', 'Nenhum item crítico.');
    const texto = "*LISTA DE URGÊNCIA* 🚨\n\n" + criticos.map(p => `- [ ] ${p.nome} (Atual: ${p.quantidade_total})`).join('\n');
    document.getElementById('textoLista').value = texto;
    document.getElementById('modalResultado').style.display = 'flex';
}

function copiarLista() { document.getElementById('textoLista').select(); document.execCommand('copy'); showToast('Copiado', 'Copiado!'); fecharModais(); }
function fecharModais() { document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none'); }
function showToast(title, msg, type='success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div style="flex:1"><strong>${title}</strong><br><small>${msg}</small></div>`;
    container.appendChild(toast); setTimeout(() => toast.remove(), 3000);
}