require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- LOGS ---
async function registrarMovimentacao(produto_id, tipo, quantidade, usuario, obs = '') {
    try {
        const user = usuario || 'Sistema';
        // Salva também qual lote foi afetado na observação se possível
        await pool.query(
            'INSERT INTO movimentacoes (produto_id, tipo, quantidade, usuario) VALUES ($1, $2, $3, $4)',
            [produto_id, tipo + (obs ? ` (${obs})` : ''), quantidade, user]
        );
    } catch (err) { console.error("Erro log:", err.message); }
}

// --- PRODUTOS (Leitura Dinâmica) ---
app.get('/api/produtos', async (req, res) => {
    try {
        // Agora a quantidade total e a validade mais próxima vêm dos lotes
        const query = `
            SELECT p.*, 
            COALESCE((SELECT SUM(quantidade) FROM lotes WHERE produto_id = p.id), 0) as quantidade_total,
            (SELECT MIN(data_validade) FROM lotes WHERE produto_id = p.id AND quantidade > 0) as proxima_validade
            FROM produtos p 
            ORDER BY p.nome ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/produtos', async (req, res) => {
    const { nome, categoria, unidade, estoque_minimo, preco } = req.body;
    // Nota: Ao criar produto, começa com estoque 0. A entrada é feita via Lote depois.
    try {
        const result = await pool.query(
            'INSERT INTO produtos (nome, categoria, quantidade, unidade, preco, estoque_minimo) VALUES ($1, $2, 0, $3, $4, $5) RETURNING *',
            [nome, categoria, unidade, preco || 0, estoque_minimo || 5]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- GESTÃO DE LOTES (ENTRADA/SAÍDA) ---

// 1. Listar Lotes de um Produto (Para o modal de seleção)
app.get('/api/produtos/:id/lotes', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM lotes WHERE produto_id = $1 AND quantidade > 0 ORDER BY data_validade ASC',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. ENTRADA (Novo Lote ou Lote Existente)
app.post('/api/movimentacao/entrada', async (req, res) => {
    const { produto_id, quantidade, lote_id, novo_numero_lote, nova_validade, usuario } = req.body;

    try {
        if(lote_id) {
            // Adicionar ao mesmo lote
            await pool.query('UPDATE lotes SET quantidade = quantidade + $1 WHERE id = $2', [quantidade, lote_id]);
            await registrarMovimentacao(produto_id, 'ENTRADA', quantidade, usuario, 'Lote Existente');
        } else {
            // Criar novo lote
            await pool.query(
                'INSERT INTO lotes (produto_id, numero, data_validade, quantidade) VALUES ($1, $2, $3, $4)',
                [produto_id, novo_numero_lote, nova_validade || null, quantidade]
            );
            await registrarMovimentacao(produto_id, 'ENTRADA', quantidade, usuario, `Lote: ${novo_numero_lote}`);
        }
        
        // Atualiza cache total na tabela produtos (opcional, mas bom para performance)
        await pool.query('UPDATE produtos SET quantidade = (SELECT SUM(quantidade) FROM lotes WHERE produto_id = $1) WHERE id = $1', [produto_id]);
        
        res.json({ message: "Entrada realizada" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. SAÍDA (Baixa em Lote Específico)
app.post('/api/movimentacao/saida', async (req, res) => {
    const { produto_id, lote_id, quantidade, usuario } = req.body;

    try {
        // Verifica saldo do lote
        const check = await pool.query('SELECT quantidade, numero FROM lotes WHERE id = $1', [lote_id]);
        if(check.rows.length === 0 || check.rows[0].quantidade < quantidade) {
            return res.status(400).json({ error: "Saldo insuficiente neste lote" });
        }

        // Deduz do lote
        await pool.query('UPDATE lotes SET quantidade = quantidade - $1 WHERE id = $2', [quantidade, lote_id]);
        
        // Log
        await registrarMovimentacao(produto_id, 'SAIDA', quantidade, usuario, `Lote: ${check.rows[0].numero}`);

        // Atualiza cache total
        await pool.query('UPDATE produtos SET quantidade = (SELECT COALESCE(SUM(quantidade), 0) FROM lotes WHERE produto_id = $1) WHERE id = $1', [produto_id]);

        res.json({ message: "Saída realizada" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RELATÓRIOS CORRIGIDOS ---

// Relatório Vencimento: AGORA SÓ TRAZ SE TIVER SALDO NO LOTE
app.get('/api/relatorios/vencimento', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.nome, l.numero as lote, l.data_validade, l.quantidade, p.unidade
            FROM lotes l
            JOIN produtos p ON l.produto_id = p.id
            WHERE l.quantidade > 0 AND l.data_validade IS NOT NULL
            ORDER BY l.data_validade ASC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Outros endpoints padrão
app.get('/api/categorias', async (req, res) => {
    const r = await pool.query('SELECT * FROM categorias ORDER BY nome');
    res.json(r.rows);
});
app.post('/api/categorias', async (req, res) => {
    await pool.query('INSERT INTO categorias (nome) VALUES ($1)', [req.body.nome]);
    res.json({ok:true});
});
app.delete('/api/categorias/:id', async (req, res) => {
    await pool.query('DELETE FROM categorias WHERE id=$1', [req.params.id]);
    res.json({ok:true});
});
app.get('/api/movimentacoes', async (req, res) => {
    const r = await pool.query(`SELECT m.*, p.nome as produto_nome FROM movimentacoes m JOIN produtos p ON m.produto_id = p.id ORDER BY m.data_movimentacao DESC LIMIT 50`);
    res.json(r.rows);
});
app.get('/api/relatorios/mais-saidos', async (req, res) => {
    const r = await pool.query(`SELECT p.nome, p.unidade, SUM(m.quantidade) as total_saida FROM movimentacoes m JOIN produtos p ON m.produto_id = p.id WHERE m.tipo LIKE 'SAIDA%' GROUP BY p.id, p.nome, p.unidade ORDER BY total_saida DESC LIMIT 10`);
    res.json(r.rows);
});
app.delete('/api/produtos/:id', async (req, res) => {
    await pool.query('DELETE FROM produtos WHERE id=$1', [req.params.id]);
    res.json({ok:true});
});
app.put('/api/produtos/:id', async (req, res) => {
    const { nome, categoria, unidade, estoque_minimo, preco } = req.body;
    await pool.query('UPDATE produtos SET nome=$1, categoria=$2, unidade=$3, estoque_minimo=$4, preco=$5 WHERE id=$6', [nome, categoria, unidade, estoque_minimo, preco, req.params.id]);
    res.json({ok:true});
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(port, () => console.log(`Server running port ${port}`));
module.exports = app;