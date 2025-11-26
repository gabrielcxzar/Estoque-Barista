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

// --- FUNÇÃO AUXILIAR PARA REGISTRAR HISTÓRICO ---
async function registrarMovimentacao(produto_id, tipo, quantidade) {
    try {
        await pool.query(
            'INSERT INTO movimentacoes (produto_id, tipo, quantidade) VALUES ($1, $2, $3)',
            [produto_id, tipo, quantidade]
        );
    } catch (err) {
        console.error("Erro ao registrar histórico:", err.message);
        // Não quebramos a aplicação se o log falhar, apenas avisamos no console
    }
}

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

// 2. CRIAR (POST) - Registra 'ENTRADA' inicial
app.post('/api/produtos', async (req, res) => {
    const { nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo } = req.body;
    
    if (quantidade < 0) {
        return res.status(400).json({ error: "A quantidade inicial não pode ser negativa." });
    }

    try {
        const result = await pool.query(
            'INSERT INTO produtos (nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [nome, categoria, quantidade, unidade, preco, data_validade || null, estoque_minimo || 0]
        );
        
        const novoProduto = result.rows[0];
        
        // Log: Entrada Inicial
        if (novoProduto.quantidade > 0) {
            await registrarMovimentacao(novoProduto.id, 'ENTRADA', novoProduto.quantidade);
        }

        res.json(novoProduto);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 3. EDITAR (PUT) - Calcula diferença e registra 'AJUSTE'
app.put('/api/produtos/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, categoria, quantidade, unidade, preco, data_validade, estoque_minimo } = req.body;

    if (quantidade < 0) {
        return res.status(400).json({ error: "A quantidade não pode ser negativa." });
    }

    try {
        // Passo 1: Pegar quantidade antiga para calcular a diferença
        const oldData = await pool.query('SELECT quantidade FROM produtos WHERE id = $1', [id]);
        if (oldData.rows.length === 0) return res.status(404).json({ error: "Produto não encontrado" });
        
        const qtdAntiga = parseFloat(oldData.rows[0].quantidade);
        const qtdNova = parseFloat(quantidade);
        const diferenca = qtdNova - qtdAntiga;

        // Passo 2: Atualizar
        await pool.query(
            'UPDATE produtos SET nome=$1, categoria=$2, quantidade=$3, unidade=$4, preco=$5, data_validade=$6, estoque_minimo=$7 WHERE id=$8',
            [nome, categoria, quantidade, unidade, preco, data_validade || null, estoque_minimo || 0, id]
        );

        // Passo 3: Registrar Movimentação se houve mudança de estoque
        if (diferenca !== 0) {
            const tipo = diferenca > 0 ? 'ENTRADA (AJUSTE)' : 'SAIDA (AJUSTE)';
            await registrarMovimentacao(id, tipo, Math.abs(diferenca));
        }

        res.json({ message: "Atualizado com sucesso" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 4. REGISTRAR BAIXA (PATCH) - Registra 'SAIDA'
app.patch('/api/produtos/:id/baixa', async (req, res) => {
    const { id } = req.params;
    const { quantidade_saida } = req.body;

    try {
        if (!quantidade_saida || isNaN(quantidade_saida) || quantidade_saida <= 0) {
            return res.status(400).json({ error: "Quantidade inválida para baixa." });
        }

        const result = await pool.query(
            'UPDATE produtos SET quantidade = quantidade - $1 WHERE id = $2 AND quantidade >= $1 RETURNING *',
            [quantidade_saida, id]
        );

        if (result.rows.length === 0) {
            const check = await pool.query('SELECT quantidade FROM produtos WHERE id = $1', [id]);
            if (check.rows.length === 0) return res.status(404).json({ error: "Produto não encontrado" });
            
            return res.status(400).json({ 
                error: `Estoque insuficiente. Disponível: ${check.rows[0].quantidade}.` 
            });
        }
        
        // Log: Saída Manual
        await registrarMovimentacao(id, 'SAIDA', quantidade_saida);

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

// --- HISTÓRICO GERAL (DASHBOARD/AUDITORIA) ---
app.get('/api/movimentacoes', async (req, res) => {
    try {
        // Trazemos o nome do produto fazendo um JOIN
        const query = `
            SELECT m.*, p.nome as produto_nome, p.unidade 
            FROM movimentacoes m 
            JOIN produtos p ON m.produto_id = p.id 
            ORDER BY m.data_movimentacao DESC 
            LIMIT 50
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- HISTÓRICO INDIVIDUAL ---
app.get('/api/movimentacoes/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM movimentacoes WHERE produto_id = $1 ORDER BY data_movimentacao DESC LIMIT 20',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROTA FALLBACK ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`☕ Servidor rodando na porta ${port}`);
});

module.exports = app;