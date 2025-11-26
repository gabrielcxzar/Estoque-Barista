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

// --- FUNÇÃO DE LOG ATUALIZADA ---
async function registrarMovimentacao(produto_id, tipo, quantidade, usuario) {
    try {
        // Se não vier usuário, define como 'Sistema'
        const user = usuario || 'Sistema';
        await pool.query(
            'INSERT INTO movimentacoes (produto_id, tipo, quantidade, usuario) VALUES ($1, $2, $3, $4)',
            [produto_id, tipo, quantidade, user]
        );
    } catch (err) { console.error("Erro log:", err.message); }
}

// --- ROTAS PRODUTOS ---
app.get('/api/produtos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM produtos ORDER BY nome ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/produtos', async (req, res) => {
    // Agora recebe 'usuario' do corpo da requisição
    const { nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo, usuario } = req.body;
    
    if (quantidade < 0) return res.status(400).json({ error: "Qtd não pode ser negativa" });

    try {
        const result = await pool.query(
            'INSERT INTO produtos (nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [nome, categoria, quantidade, unidade, preco, data_validade || null, estoque_minimo || 0]
        );
        
        if(result.rows[0].quantidade > 0) {
            await registrarMovimentacao(result.rows[0].id, 'ENTRADA', result.rows[0].quantidade, usuario);
        }
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo, usuario } = req.body;

    try {
        const old = await pool.query('SELECT quantidade FROM produtos WHERE id = $1', [id]);
        if(old.rows.length === 0) return res.status(404).json({error: 'Não encontrado'});
        
        const diff = parseFloat(quantidade) - parseFloat(old.rows[0].quantidade);

        await pool.query(
            'UPDATE produtos SET nome=$1, categoria=$2, quantidade=$3, unidade=$4, preco=$5, data_validade=$6, estoque_minimo=$7 WHERE id=$8',
            [nome, categoria, quantidade, unidade, preco, data_validade || null, estoque_minimo || 0, id]
        );

        if(diff !== 0) {
            const tipo = diff > 0 ? 'ENTRADA (AJUSTE)' : 'SAIDA (AJUSTE)';
            await registrarMovimentacao(id, tipo, Math.abs(diff), usuario);
        }
        res.json({ message: "Atualizado" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/produtos/:id/baixa', async (req, res) => {
    const { id } = req.params;
    const { quantidade_saida, usuario } = req.body;

    try {
        const result = await pool.query(
            'UPDATE produtos SET quantidade = quantidade - $1 WHERE id = $2 AND quantidade >= $1 RETURNING *',
            [quantidade_saida, id]
        );
        if (result.rows.length === 0) return res.status(400).json({ error: "Estoque insuficiente ou item não existe" });
        
        await registrarMovimentacao(id, 'SAIDA', quantidade_saida, usuario);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/produtos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM produtos WHERE id = $1', [req.params.id]);
        res.json({ message: "Deletado" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROTAS CATEGORIAS ---
app.get('/api/categorias', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categorias ORDER BY nome ASC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/categorias', async (req, res) => {
    try {
        const result = await pool.query('INSERT INTO categorias (nome) VALUES ($1) RETURNING *', [req.body.nome]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/categorias/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM categorias WHERE id = $1', [req.params.id]);
        res.json({ message: "Deletado" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROTAS RELATÓRIOS/HISTÓRICO ---
app.get('/api/movimentacoes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, p.nome as produto_nome, p.unidade 
            FROM movimentacoes m 
            JOIN produtos p ON m.produto_id = p.id 
            ORDER BY m.data_movimentacao DESC LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/relatorios/mais-saidos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.nome, p.unidade, SUM(m.quantidade) as total_saida
            FROM movimentacoes m
            JOIN produtos p ON m.produto_id = p.id
            WHERE m.tipo = 'SAIDA'
            GROUP BY p.id, p.nome, p.unidade
            ORDER BY total_saida DESC
            LIMIT 10
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => console.log(`Rodando na porta ${port}`));
module.exports = app;