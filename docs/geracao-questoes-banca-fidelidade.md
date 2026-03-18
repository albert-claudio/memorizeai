# Geracao de Questoes com Alta Fidelidade de Banca (FGV/FCC/CESPE)

## Contexto

Objetivo: gerar questoes que parecam de banca real, com pegadinhas tecnicas, sem inventar conteudo fora da base.

Este guia cobre:

1. Fluxo recomendado (passo a passo).
2. Como adaptar por banca.
3. Como manter compatibilidade com o backend atual.
4. Checklist de qualidade antes de exibir para o usuario.

## Premissas

1. Toda questao deve ser fundamentada na base enviada ao modelo.
2. Se a base estiver fraca, o sistema deve recusar com mensagem de base insuficiente.
3. Fidelidade de banca depende de:
   - formato correto da prova;
   - tipo de raciocinio cobrado;
   - tipo de pegadinha;
   - calibracao de dificuldade.

## Passo a passo

## 1) Definir banca e formato da saida

Antes de gerar, defina o objetivo:

1. `FCC`: multipla escolha A-E.
2. `FGV`: multipla escolha A-E com casos mais interpretativos.
3. `CESPE/CEBRASPE`: idealmente `Certo/Errado`.

Importante para o backend atual:

1. Hoje o pipeline de `questoes_banca` espera JSON com:
   - `enunciado`
   - `alternativas` (A-E)
   - `respostaCorreta`
   - `comentario`
   - `chunkId`
   - `citationExcerpt`
2. Isso significa que CESPE ainda fica adaptado para A-E no fluxo atual.

## 2) Preparar base fechada (RAG)

Monte o contexto apenas com trechos relevantes:

1. Lei seca aplicavel.
2. Doutrina/resumo confiavel.
3. Jurisprudencia, quando pertinente.
4. Excertos de aula/apostila validos.

Regra operacional:

1. Nunca enviar contexto irrelevante ou muito amplo.
2. Priorizar trechos com densidade tecnica alta.
3. Cada trecho precisa de identificador estavel (`chunkId`).

## 3) Exigir trava de "base insuficiente"

No prompt, manter regra explicita:

1. Se faltar suporte tecnico para gerar questao fiel, retornar:
   - `BASE INSUFICIENTE PARA GERAR QUESTOES DE ALTA FIDELIDADE`
2. Em seguida, listar rapidamente o que faltou (ex.: excecoes, prazos, requisitos).

## 4) Aplicar persona e estilo por banca

Use instrucoes especificas por banca, nao apenas "estilo concurso":

1. `FCC`:
   - foco em literalidade, excecao, requisito fino e distincoes conceituais.
   - distratores proximos da correta, sem absurdos.
2. `FGV`:
   - enunciado mais contextualizado e interpretativo.
   - conflito aparente, consequencia pratica e nuance.
3. `CESPE/CEBRASPE`:
   - assertivas densas.
   - diferenca entre certo/errado por palavra nuclear, condicao ou alcance.

## 5) Controlar dificuldade

Defina dificuldade como parametro explicito:

1. Facil: nucleo conceitual.
2. Medio: conceito + aplicacao.
3. Dificil: excecoes, requisitos cumulativos, comparacao entre institutos.
4. Muito dificil: distratores altamente plausiveis e nuances sutis.

## 6) Forcar matriz de pegadinhas tecnicas

Permitir apenas pegadinhas de prova real:

1. Troca regra/excecao.
2. Supressao de requisito cumulativo.
3. Inclusao de requisito inexistente.
4. Amplificacao ou reducao indevida de alcance normativo.
5. Inversao de causa e efeito.
6. Confusao entre institutos proximos.
7. Erro de competencia, legitimidade, prazo, efeito ou hipotese.

Proibicoes:

1. Distrator bobo.
2. Alternativa caricata.
3. Enunciado didatico/professoral.
4. Duas alternativas defensaveis.

## 7) Gerar em duas fases

Recomendacao para elevar qualidade:

1. Fase A - Geracao:
   - modelo cria questoes com base e estilo definidos.
2. Fase B - Revisao:
   - outro prompt (revisor) valida fidelidade, ambiguidade e forca dos distratores.
   - itens fracos voltam para reescrita.

## 8) Auditoria obrigatoria antes de salvar

Checklist por questao:

1. Parece questao real de banca?
2. A pegadinha e tecnica ou boba?
3. A correta esta discreta (nao "brilhando")?
4. Todas as erradas sao plausiveis?
5. Existe ambiguidade?
6. Tudo veio da base?
7. Existe citacao util da base (`citationExcerpt`)?

Se algum item falhar: reescrever antes de persistir.

## 9) Compatibilizar com o backend atual

Para integrar sem quebrar o processamento atual, manter a estrutura:

```json
[
  {
    "enunciado": "Texto da questao",
    "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
    "respostaCorreta": "C",
    "comentario": "##CORRETA: C## ... ##ERRADAS## A) ... B) ... D) ... E) ... ##FONTE## ...",
    "chunkId": "ID_DO_TRECHO",
    "citationExcerpt": "Trecho exato ou recorte fiel da base"
  }
]
```

Observacao:

1. Se quiser suporte CESPE puro (`Certo/Errado`), ideal criar objetivo/fluxo especifico no backend.
2. Enquanto isso, CESPE pode ser emulado em A-E, mas com menor fidelidade formal.

## 10) Medir qualidade continuamente

Crie metricas simples para evolucao:

1. Taxa de reprovacao na fase de revisao.
2. Taxa de questoes com ambiguidade reportada por usuarios.
3. Taxa de erro por questao "ruim" vs "boa" (sinal de calibracao).
4. Feedback qualitativo por banca (FGV/FCC/CESPE).

## Template operacional de prompt (resumo)

Usar como base no gerador:

1. Persona de elaborador da banca.
2. Regra dura de nao inventar fora da base.
3. Instrucoes especificas por banca.
4. Parametro de dificuldade.
5. Matriz de pegadinhas permitidas.
6. Estrutura JSON obrigatoria do backend.
7. Fallback de base insuficiente.

## Resultado esperado

Com esse fluxo, a geracao sai de "questao generica de IA" para "questao com cara de banca", com:

1. mais fidelidade estilistica;
2. distratores mais plausiveis;
3. menor ambiguidade;
4. rastreabilidade de fonte por item.

