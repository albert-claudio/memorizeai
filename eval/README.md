# Validação do pipeline OAB/FGV

Este diretório implementa o fluxo do manual `manual-validacao-pipeline-oab.md.pdf` sem depender de fallback silencioso.

## Fontes oficiais

`oab-official-sources.json` registra os links oficiais capturados no portal da OAB para o 46º Exame de Ordem Unificado. Use os PDFs oficiais para preencher `real_questions.json` com questões reais literais.

## Arquivos de entrada

- `real_questions.json`: questões reais OAB/FGV, preenchidas manualmente a partir dos PDFs oficiais.
- `generated_questions.json`: questões exportadas do pipeline.

Use os arquivos `.example.json` apenas como contrato de campos. Não use exemplos placeholder como base de avaliação.

Campos mínimos por questão:

- `id`
- `origem`: `real` ou `gerada`
- `enunciado`
- `alternativas`
- `respostaCorreta`

## Comandos

```bash
npm run eval:oab:calibrate
npm run eval:oab:blind
```

O calibrador falha se `real_questions.json` ou `generated_questions.json` estiver ausente, vazio ou malformado.

Saídas:

- `eval/calibration-report.json`
- `eval/PARA-AVALIADOR.csv`
- `eval/COM-GABARITO.csv`

## Regra operacional

Se o avaliador cego identificar a origem das questões geradas com facilidade, isso é regressão de estilo. Ajuste prompt/rubrica e rode novamente.
