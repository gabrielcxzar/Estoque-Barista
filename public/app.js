const API_URL = '/api/produtos';
let produtosCache = [];
let categoriasCache = [];
let carrinhoMovimento = [];
let editando = false;
let tipoMovimento = 'SAIDA';
let usuarioAtual = null;

// --- USUÁRIOS (SIMPLIFICADO) ---
const users = {
    'admin': 'admin',
    'barista': 'cafe'
};

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    const dataEl = document.getElementById('dataAtual');
    if (dataEl) dataEl.innerText = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    
    // Verifica se já tem login (opcional, para manter sessão simples)
    // Por segurança, forçamos login no refresh
});

// --- LOGIN SYSTEM ---
function fazerLogin(e) {
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const errorMsg = document.getElementById('loginError');

    if (users[user] && users[user] === pass) {
        usuarioAtual = user;
        document.getElementById('displayUser').innerText = user.charAt(0).toUpperCase() + user.slice(1);
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        // Inicia dados
        carregarEstoque();
        carregarCategorias();
        atualizarDashboard();
    } else {
        errorMsg.innerText = 'Usuário ou senha incorretos';
    }
}

function fazerLogout() {
    usuarioAtual = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').innerText = '';
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
    
    const screen = document.getElementById(screenId);
    if(screen) screen.classList.add('active');

    const menuMap = {'dashboard':0, 'cadastros':1, 'movimentacao':2, 'relatorios':3};
    if(menuMap[screenId] !== undefined) document.querySelectorAll('.menu-btn')[menuMap[screenId]].classList.add('active');

    if(screenId === 'dashboard') atualizarDashboard();
    if(screenId === 'movimentacao') { carrinhoMovimento = []; renderizarTelaMovimento(); }
    if(screenId === 'relatorios') carregarRelatorios();
    if(screenId === 'cadastros') renderizarTelaCadastros();
}

// --- CORE DATA ---
async function carregarEstoque() {
    const res = await fetch(API_URL);
    produtosCache = await res.json();
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
    categoriasCache.forEach(c => {
        select.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
    });
}

// --- CADASTROS (NOVA ABA) ---
function renderizarTelaCadastros() {
    const tbody = document.getElementById('tabelaCadastros');
    tbody.innerHTML = '';
    
    produtosCache.forEach(p => {
        tbody.innerHTML += `
            <tr>
                <td>${p.nome}</td>
                <td>${p.categoria || '-'}</td>
                <td style="text-align:right">
                    <button class="btn btn-ghost" onclick='editarItem(${JSON.stringify(p)})'><i data-lucide="edit-2" size="16"></i></button>
                    <button class="btn btn-ghost" style="color:#DC2626" onclick="deletarItem(${p.id})"><i data-lucide="trash-2" size="16"></i></button>
                </td>
            </tr>
        `;
    });

    const listaCat = document.getElementById('listaCategorias');
    listaCat.innerHTML = '';
    categoriasCache.forEach(c => {
        listaCat.innerHTML += `
            <li class="cat-item">
                <span>${c.nome}</span>
                <button class="btn btn-ghost" style="color:#DC2626; padding:4px" onclick="deletarCategoria(${c.id})"><i data-lucide="trash-2" size="14"></i></button>
            </li>
        `;
    });
    lucide.createIcons();
}

async function adicionarCategoria() {
    const input = document.getElementById('novaCategoria');
    const nome = input.value.trim();
    if(!nome) return;

    await fetch('/api/categorias', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ nome })
    });
    input.value = '';
    await carregarCategorias();
    renderizarTelaCadastros();
    showToast('Sucesso', 'Categoria adicionada');
}

async function deletarCategoria(id) {
    if(!confirm('Deletar categoria?')) return;
    await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
    await carregarCategorias();
    renderizarTelaCadastros();
}

// --- DASHBOARD & RELATÓRIOS (MODIFICADO) ---
async function atualizarDashboard() {
    if(produtosCache.length === 0) await carregarEstoque();
    let total = 0, criticos = 0, vencendo = 0;
    const hoje = new Date();

    produtosCache.forEach(p => {
        total += (p.preco * p.quantidade);
        if(p.quantidade <= p.estoque_minimo) criticos++;
        if(p.data_validade) {
            const diff = (new Date(p.data_validade) - hoje) / 86400000;
            if(diff <= 7 && diff >= -1) vencendo++;
        }
    });

    document.getElementById('dashValorTotal').innerText = total.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    document.getElementById('dashItensCriticos').innerText = criticos;
    document.getElementById('dashVencendo').innerText = vencendo;

    const res = await fetch('/api/movimentacoes');
    const movs = await res.json();
    const tbody = document.getElementById('dashUltimasAtividades');
    tbody.innerHTML = movs.slice(0,5).map(m => `
        <tr>
            <td style="color:var(--text-muted)">${new Date(m.data_movimentacao).toLocaleDateString()}</td>
            <td>${m.produto_nome}</td>
            <td>${formatarTipo(m.tipo)}</td>
            <td>${m.quantidade}</td>
        </tr>`).join('');
    lucide.createIcons();
}

// --- NOVA LÓGICA DE RELATÓRIOS ---
async function carregarRelatorios() {
    const hoje = new Date();
    
    // 1. Vencimentos (Separado por status)
    const listaVencimentos = produtosCache.filter(p => p.data_validade).sort((a,b) => new Date(a.data_validade) - new Date(b.data_validade));
    const tbodyVenc = document.getElementById('relVencimentos');
    tbodyVenc.innerHTML = '';

    listaVencimentos.forEach(p => {
        const val = new Date(p.data_validade);
        val.setDate(val.getDate() + 1); // Fuso
        const diff = Math.ceil((val - hoje) / 86400000);
        
        // Lógica de exibição
        if(diff < 0) {
            tbodyVenc.innerHTML += `<tr>
                <td><strong>${p.nome}</strong></td>
                <td class="text-danger">${val.toLocaleDateString()}</td>
                <td><span class="badge badge-danger">VENCIDO</span></td>
            </tr>`;
        } else if (diff <= 15) {
            tbodyVenc.innerHTML += `<tr>
                <td>${p.nome}</td>
                <td class="text-warning">${val.toLocaleDateString()}</td>
                <td><span class="badge badge-warning">Vence em ${diff} dias</span></td>
            </tr>`;
        }
    });

    // 2. Críticos
    const criticos = produtosCache.filter(p => p.quantidade <= p.estoque_minimo);
    document.getElementById('relCriticos').innerHTML = criticos.map(p => `
        <tr><td><strong>${p.nome}</strong></td><td>${p.quantidade} ${p.unidade}</td><td class="text-danger">${p.estoque_minimo}</td></tr>
    `).join('');

    // 3. Mais Saídos
    const res = await fetch('/api/relatorios/mais-saidos');
    const saidos = await res.json();
    document.getElementById('relSaidos').innerHTML = saidos.map(p => `
        <tr><td>${p.nome}</td><td><strong>${p.total_saida}</strong> ${p.unidade}</td></tr>
    `).join('');
    
    lucide.createIcons();
}

function gerarListaApenasCriticos() {
    const criticos = produtosCache.filter(p => p.quantidade <= p.estoque_minimo);
    if(criticos.length === 0) return showToast('Info', 'Nenhum item crítico.');
    
    const texto = "*LISTA DE URGÊNCIA* 🚨\n\n" + criticos.map(p => `- [ ] ${p.nome} (Atual: ${p.quantidade}, Mín: ${p.estoque_minimo})`).join('\n');
    document.getElementById('textoLista').value = texto;
    document.getElementById('modalResultado').style.display = 'flex';
}

function formatarTipo(t) {
    if(t.includes('ENTRADA')) return '<span class="badge badge-success">Entrada</span>';
    if(t.includes('SAIDA')) return '<span class="badge badge-danger">Saída</span>';
    return `<span class="badge badge-warning">${t}</span>`;
}

// --- MOVIMENTAÇÃO (PDV) ---
function setModo(modo) {
    tipoMovimento = modo;
    document.getElementById('btnModoSaida').className = modo === 'SAIDA' ? 'mode-btn active-saida' : 'mode-btn';
    document.getElementById('btnModoEntrada').className = modo === 'ENTRADA' ? 'mode-btn active-entrada' : 'mode-btn';
    document.getElementById('tituloCarrinho').innerText = modo === 'SAIDA' ? 'Itens para Saída' : 'Itens para Entrada';
    const btn = document.getElementById('btnFinalizarMovimento');
    btn.innerText = modo === 'SAIDA' ? 'Confirmar Saída' : 'Confirmar Entrada';
    btn.className = modo === 'SAIDA' ? 'btn btn-primary' : 'btn btn-success'; // Use success class logic in CSS if wanted, defaulting to primary color logic for simplicity or update CSS
    carrinhoMovimento = [];
    renderizarCarrinho();
}

function renderizarTelaMovimento(filtro = '') {
    const container = document.getElementById('listaProdutosMovimento');
    container.innerHTML = '';
    const filtrados = produtosCache.filter(p => p.nome.toLowerCase().includes(filtro.toLowerCase()));
    
    filtrados.forEach(p => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div>
                <div style="font-weight:600">${p.nome}</div>
                <div style="font-size:0.8rem; color:var(--text-muted)">Estoque: ${p.quantidade} ${p.unidade}</div>
            </div>
            <i data-lucide="plus-circle" style="color:var(--text-muted)"></i>
        `;
        div.onclick = () => adicionarAoCarrinho(p);
        container.appendChild(div);
    });
    lucide.createIcons();
    renderizarCarrinho();
}

function adicionarAoCarrinho(p) {
    const existe = carrinhoMovimento.find(item => item.id === p.id);
    if(existe) existe.movimento++;
    else carrinhoMovimento.push({ ...p, movimento: 1 });
    renderizarCarrinho();
}

function renderizarCarrinho() {
    const container = document.getElementById('carrinhoLista');
    if(carrinhoMovimento.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">Selecione itens</div>`;
        return;
    }
    container.innerHTML = '';
    carrinhoMovimento.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div style="flex:1">
                <div style="font-weight:600; font-size:0.9rem">${item.nome}</div>
                <div style="font-size:0.75rem; color:#888">Atual: ${item.quantidade}</div>
            </div>
            <input type="number" value="${item.movimento}" min="0.1" step="0.1" onchange="atualizarQtdCarrinho(${index}, this.value)">
            <button class="btn btn-ghost" style="color:#DC2626; padding:4px;" onclick="removerDoCarrinho(${index})">
                <i data-lucide="x" size="16"></i>
            </button>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function atualizarQtdCarrinho(index, qtd) { carrinhoMovimento[index].movimento = parseFloat(qtd); }
function removerDoCarrinho(index) { carrinhoMovimento.splice(index, 1); renderizarCarrinho(); }

async function finalizarMovimentacao() {
    if(carrinhoMovimento.length === 0) return showToast('Vazio', 'Adicione itens', 'error');
    if(carrinhoMovimento.some(i => i.movimento <= 0)) return showToast('Erro', 'Qtd inválida', 'error');
    
    if (tipoMovimento === 'SAIDA') {
        const insuficientes = carrinhoMovimento.filter(i => i.movimento > i.quantidade);
        if (insuficientes.length > 0) return showToast('Bloqueado', `Estoque insuficiente: ${insuficientes[0].nome}`, 'error');
    }
    
    if(!confirm(`Confirmar ação?`)) return;

    let erros = 0;
    for (const item of carrinhoMovimento) {
        try {
            if (tipoMovimento === 'SAIDA') {
                const res = await fetch(`${API_URL}/${item.id}/baixa`, {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ quantidade_saida: item.movimento })
                });
                if(!res.ok) erros++;
            } else {
                const dados = { ...item, quantidade: parseFloat(item.quantidade) + parseFloat(item.movimento) };
                const res = await fetch(`${API_URL}/${item.id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(dados)
                });
                if(!res.ok) erros++;
            }
        } catch(e) { erros++; }
    }

    if(erros === 0) {
        showToast('Sucesso', 'Movimentação concluída!');
        carrinhoMovimento = [];
        renderizarCarrinho();
        carregarEstoque();
    } else {
        showToast('Atenção', `Alguns itens falharam`, 'error');
        carregarEstoque();
    }
}

// --- CRUD ---
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
        data_validade: document.getElementById('data_validade').value
    };
    const id = document.getElementById('id_produto').value;
    const url = editando ? `${API_URL}/${id}` : API_URL;
    const method = editando ? 'PUT' : 'POST';

    await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(dados) });
    fecharModais();
    carregarEstoque();
    renderizarTelaCadastros();
    showToast('Sucesso', 'Salvo!');
});

async function deletarItem(id) {
    if(confirm('Excluir?')) {
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        carregarEstoque(); renderizarTelaCadastros(); showToast('Deletado', 'Item removido');
    }
}

function copiarLista() {
    document.getElementById('textoLista').select();
    document.execCommand('copy');
    showToast('Copiado', 'Lista na área de transferência');
    fecharModais();
}

function fecharModais() { document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none'); }
function showToast(title, msg, type='success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div style="flex:1"><strong>${title}</strong><br><small>${msg}</small></div>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}