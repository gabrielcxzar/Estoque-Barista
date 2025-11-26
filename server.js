require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Configuração do Banco de Dados (Neon)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(cors());
app.use(express.json());

// --- FIX CRÍTICO PARA VERCEL ---
// Serve os arquivos estáticos da pasta public corretamente
app.use(express.static(path.join(__dirname, 'public')));

// --- ROTAS DA API ---

// 1. LISTAR (GET)
app.get('/api/produtos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM produtos ORDER BY data_validade ASC NULLS LAST, id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. CRIAR (POST)
app.post('/api/produtos', async (req, res) => {
    const { nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo } = req.body;
    
    // Validação de Segurança: Não permitir estoque negativo na criação
    if (quantidade < 0) {
        return res.status(400).json({ error: "A quantidade inicial não pode ser negativa." });
    }

    try {
        const result = await pool.query(
            'INSERT INTO produtos (nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [nome, categoria, quantidade, unidade, preco, data_validade || null, estoque_minimo || 0]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 3. EDITAR (PUT)
app.put('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo } = req.body;

    // Validação de Segurança: Não permitir edição para negativo
    if (quantidade < 0) {
        return res.status(400).json({ error: "A quantidade não pode ser negativa." });
    }

    try {
        await pool.query(
            'UPDATE produtos SET nome=$1, categoria=$2, quantidade=$3, unidade=$4, preco=$5, data_validade=$6, estoque_minimo=$7 WHERE id=$8',
            [nome, categoria, quantidade, unidade, preco, data_validade || null, estoque_minimo || 0, id]
        );
        res.json({ message: "Atualizado com sucesso" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 4. REGISTRAR BAIXA (PATCH) - BLINDADO
// Recebe apenas a quantidade que saiu e desconta do estoque
app.patch('/api/produtos/:id/baixa', async (req, res) => {
    const { id } = req.params;
    const { quantidade_saida } = req.body;

    try {
        if (!quantidade_saida || isNaN(quantidade_saida) || quantidade_saida <= 0) {
            return res.status(400).json({ error: "Quantidade inválida para baixa." });
        }

        // Tenta atualizar SOMENTE se tiver estoque suficiente (quantidade >= quantidade_saida)
        const result = await pool.query(
            'UPDATE produtos SET quantidade = quantidade - $1 WHERE id = $2 AND quantidade >= $1 RETURNING *',
            [quantidade_saida, id]
        );

        if (result.rows.length === 0) {
            // Se não retornou nada, precisamos saber se foi "Produto não existe" ou "Sem estoque"
            const check = await pool.query('SELECT quantidade FROM produtos WHERE id = $1', [id]);
            
            if (check.rows.length === 0) {
                return res.status(404).json({ error: "Produto não encontrado" });
            } else {
                // Se o produto existe, então foi falta de estoque
                return res.status(400).json({ 
                    error: `Estoque insuficiente. Você tentou dar baixa em ${quantidade_saida}, mas só tem ${check.rows[0].quantidade} disponível.` 
                });
            }
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 5. DELETAR (DELETE)
app.delete('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM produtos WHERE id = $1', [id]);
        res.json({ message: "Item deletado" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- ROTA FALLBACK (IMPORTANTE) ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`☕ Servidor rodando na porta ${port}`);
});

module.exports = app;