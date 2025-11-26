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

// 4. DELETAR (DELETE)
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
// Qualquer rota que não seja API vai devolver o HTML (necessário para Single Page Apps)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`☕ Servidor rodando na porta ${port}`);
});

// Exportar para a Vercel (Boas práticas)
module.exports = app;