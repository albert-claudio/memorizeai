# API de Extração de PDF

## Visão Geral

Este endpoint extrai texto de arquivos PDF e aplica pré-processamento antes de enviar para a IA.

## Endpoint

**POST** `/api/extract-pdf`

### Request

- **Content-Type**: `multipart/form-data`
- **Body**: FormData com o campo `file` contendo o PDF

### Response

```json
{
  "text": "texto limpo e processado...",
  "chunks": ["chunk1", "chunk2"],
  "stats": {
    "totalPages": 10,
    "totalCharacters": 25000,
    "totalWords": 4500,
    "chunks": 1
  }
}
```

## Validações

1. **Tipo de arquivo**: Apenas PDFs são aceitos
2. **Tamanho**: Máximo de 10MB
3. **Formato**: Deve ser um arquivo válido

## Pré-processamento de Texto

O texto extraído passa por 9 etapas de limpeza:

### 1. Remove quebras de linha excessivas

Normaliza múltiplas quebras de linha para no máximo 2.

### 2. Remove espaços em branco múltiplos

Reduz espaços e tabs consecutivos para um único espaço.

### 3. Remove hífens de quebra de linha

Une palavras que foram separadas por hífen ao final da linha.

```
Exem-
plo
```

Vira: `Exemplo`

### 4. Remove caracteres especiais desnecessários

Mantém apenas:

- Letras e números
- Espaços e quebras de linha
- Pontuação básica: `. , ; : ! ? ( ) [ ] - " '`

### 5. Remove números de página isolados

Elimina linhas que contém apenas números (geralmente numeração de páginas).

### 6. Remove cabeçalhos/rodapés repetitivos

Remove linhas como "Página 1", "Page 2", etc.

### 7. Normaliza espaços em torno de pontuação

```
Antes : word ,word.
Depois: word, word.
```

### 8. Remove linhas muito curtas

Elimina linhas com menos de 4 caracteres (provavelmente ruído).

### 9. Limpa espaços no início/fim

Remove espaços em branco desnecessários.

## Chunking

Para PDFs muito grandes (>50.000 caracteres), o texto é dividido em chunks:

- **Estratégia**: Divisão por parágrafo
- **Tamanho máximo**: 50.000 caracteres por chunk
- **Preservação**: Parágrafos nunca são cortados no meio

## Exemplo de Uso

```typescript
const formData = new FormData();
formData.append("file", pdfFile);

const response = await fetch("/api/extract-pdf", {
  method: "POST",
  body: formData,
});

const { text, chunks, stats } = await response.json();

// Use o texto limpo para enviar para a IA
const flashcards = await generateFlashcards(text);
```

## Tratamento de Erros

### 400 - Bad Request

- Nenhum arquivo fornecido
- Arquivo não é PDF
- Arquivo muito grande (>10MB)

### 500 - Internal Server Error

- Erro ao processar PDF
- Resposta inclui detalhes do erro no campo `details`

## Performance

- PDFs pequenos (~1MB): < 2 segundos
- PDFs médios (~5MB): 3-5 segundos
- PDFs grandes (~10MB): 5-10 segundos

## Tecnologias

- **pdf2json**: Extração de texto (Node.js nativo, sem DOMMatrix)
- **Buffer**: Manipulação de dados binários
- **Next.js Route Handler**: Servidor API
