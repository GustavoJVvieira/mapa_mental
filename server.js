// ====================================================================
// server.js (Backend Node.js + Express)
// ====================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

// Use a chave API do Gemini a partir das variáveis de ambiente
const gemini = new GoogleGenAI("AIzaSyBvqBe5dKexHUXJcHdqAHaYimKBuEN1nKc");

const app = express();
const PORT = 3000;

// Configurações
app.use(cors()); // Permite que o frontend em outra porta (ou arquivo local) se comunique
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições

// Função principal de comunicação com o Gemini
async function generateMindMapText(rawText) {
    const prompt = `
        Você é um gerador de estrutura de mapa mental. Sua tarefa é analisar o texto abaixo e convertê-lo em uma estrutura hierárquica usando um formato de texto estrito.

        Regras do Formato de Saída (MUITO IMPORTANTE - Responda APENAS com este formato):
        1. A estrutura deve começar com: [ideia central:] <Título da Ideia Central>
        2. Cada nó principal (Box) deve usar: [box X.] <Título do Box> (onde X é o número do box)
        3. Cada subtópico deve usar: subtópico Y - <Título do Subtópico> (onde Y é o número sequencial)
        4. Cada sub-subtópico deve usar: subtópico Y.Z - <Título do Sub-Subtópico> (onde Y é o número do subtópico pai e Z é o número sequencial)
        5. Para forçar uma quebra de linha dentro de um título (Subtópico ou Sub-subtópico), use o caractere '|' (pipe).
        6. Não inclua nenhuma outra explicação, introdução ou formatação (como Markdown ) na sua resposta. APENAS o texto puro da estrutura.

        Texto para análise:
        ---
        ${rawText}
        ---

        Exemplo de Saída Esperada (APENAS o texto da estrutura, sem aspas ou ):
        [ideia central:] Exemplo de Estrutura
        [box 1.] Nível Principal 1
        subtópico 1 - Primeiro Tópico | com quebra de linha
        subtópico 1.1 - Detalhe 1.1
        subtópico 2 - Segundo Tópico
        [box 2.] Nível Principal 2
        subtópico 1 - Tópico Secundário
    `;

    try {
        const response = await gemini.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                // Força o modelo a seguir o formato de texto
                temperature: 0.0,
                maxOutputTokens: 2048,
            }
        });

        // O resultado deve ser o texto puro da estrutura do mapa mental
        const generatedText = response.text.trim();

        if (!generatedText.startsWith('[ideia central:]')) {
             throw new Error("Resposta do modelo não está no formato de mapa mental esperado.");
        }

        return generatedText;

    } catch (error) {
        console.error("Erro ao comunicar com a API do Gemini:", error);
        throw new Error(`Falha na geração do mapa: ${error.message}`);
    }
}

// Endpoint para gerar o mapa mental
app.post('/generate-map', async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: "O campo 'text' é obrigatório." });
    }

    try {
        const mapText = await generateMindMapText(text);
        res.json({ generatedMapText: mapText });
    } catch (error) {
        res.status(500).json({ error: error.message || "Erro interno do servidor." });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
    console.log("Certifique-se de que a variável GEMINI_API_KEY está configurada.");
});