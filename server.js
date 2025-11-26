require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// LISTAR
app.get('/api/produtos', async (req, res) => {
    try {
        // Ordenar por validade (os que vencem antes aparecem primeiro)
        const result = await pool.query('SELECT * FROM produtos ORDER BY data_validade ASC NULLS LAST, id DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// CRIAR
app.post('/api/produtos', async (req, res) => {
    const { nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO produtos (nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [nome, categoria, quantidade, unidade, preco, data_validade || null, estoque_minimo || 0]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// EDITAR
app.put('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo } = req.body;
    try {
        await pool.query(
            'UPDATE produtos SET nome=$1, categoria=$2, quantidade=$3, unidade=$4, preco=$5, data_validade=$6, estoque_minimo=$7 WHERE id=$8',
            [nome, categoria, quantidade, unidade, preco, data_validade || null, estoque_minimo || 0, id]
        );
        res.json({ message: "Atualizado" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETAR
app.delete('/api/produtos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM produtos WHERE id = $1', [req.params.id]);
        res.json({ message: "Deletado" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(port, () => console.log(`Rodando na porta ${port}`));