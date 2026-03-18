# Alta Fidelidade de Banca: Guia Pratico com Exemplos

## Objetivo

Este documento explica o que significa, na pratica, chegar em `alta fidelidade de banca` na geracao de questoes juridicas.

Nao basta a questao "parecer boa". Para considerar alta fidelidade, ela precisa combinar:

1. aderencia real ao estilo da banca;
2. ancoragem estrita na base fornecida;
3. distratores tecnicos plausiveis;
4. dificuldade compativel com o que a base suporta;
5. revisao que consiga reprovar itens fracos ou extrapolados.

## Definicao operacional

Uma questao de `alta fidelidade de banca` deve satisfazer ao mesmo tempo:

1. `Fidelidade formal`
   - o formato bate com o que a banca realmente costuma cobrar;
   - o tamanho do enunciado, o tom e a estrutura das alternativas sao criveis.

2. `Fidelidade cognitiva`
   - a operacao mental exigida e a da banca real;
   - nao e apenas "trocar palavras" ou "lembrar uma definicao".

3. `Fidelidade tecnica`
   - a correta esta sustentada na base;
   - as erradas sao erradas por um erro nuclear tecnico, nao por absurdo.

4. `Fidelidade de dificuldade`
   - a questao nao parece dificil apenas na superficie;
   - ela exige o nivel de sutileza que a banca costuma usar.

## Regra central

`Fidelidade de banca nunca pode vir acima da fidelidade a base.`

Se a base nao sustenta uma questao sofisticada, o sistema deve:

1. reduzir dificuldade;
2. reduzir ambicao estilistica;
3. ou recusar com `base_insuficiente`.

## O que existe hoje no projeto

O fluxo principal ja possui elementos corretos:

1. diagnostico previo da base;
2. persona por banca;
3. instrucao por dificuldade;
4. matriz de pegadinhas;
5. fallback de `base_insuficiente`;
6. fase de revisao.

Isso ja e suficiente para gerar questoes melhores que prompts genericos.

Mas ainda nao e suficiente para garantir `alta fidelidade` de forma consistente.

## O que falta para chegar em alta fidelidade

## 1) Revisor grounded na base

Hoje, o revisor avalia a qualidade da questao, mas para alta fidelidade ele precisa receber tambem os trechos-fonte usados na construcao do item.

Sem isso, ele consegue dizer:

1. se a questao parece boa;
2. se a correta esta escancarada;
3. se os distratores parecem plausiveis.

Mas ele nao consegue validar com seguranca:

1. se a correta esta realmente ancorada na base;
2. se um distrator ficou errado por extrapolacao externa;
3. se houve "inventividade elegante" do modelo.

### Exemplo

#### Ruim

O revisor recebe apenas:

```json
{
  "enunciado": "Assinale a alternativa correta.",
  "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
  "respostaCorreta": "C"
}
```

Ele julga forma, mas nao consegue conferir a aderencia ao texto.

#### Bom

O revisor recebe:

```json
{
  "questao": {
    "enunciado": "Assinale a alternativa correta.",
    "alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],
    "respostaCorreta": "C"
  },
  "fontes": [
    {
      "chunkId": "chunk-12",
      "citationExcerpt": "A competencia e concorrente quando..."
    },
    {
      "chunkId": "chunk-19",
      "citationExcerpt": "Excepcionalmente, admite-se..."
    }
  ]
}
```

Agora o revisor consegue perguntar:

1. a correta esta sustentada?
2. cada errada e errada por um ponto tecnicamente verificavel?
3. a mistura de subtemas realmente esta na base?

## 2) Suporte a multiplas fontes por questao

Alta fidelidade dificil quase sempre exige combinacao de mais de um ponto tecnico.

Se a questao pede:

1. regra;
2. excecao;
3. consequencia pratica;

entao frequentemente ela nasce de mais de um trecho da base.

### Problema

Se o schema aceita apenas `1 chunkId` e `1 citationExcerpt`, o sistema fica forçado a:

1. simplificar a questao;
2. esconder que ela depende de multiplos fundamentos;
3. ou manter uma questao sofisticada sem prova completa da ancoragem.

### Exemplo

#### Estrutura limitada

```json
{
  "chunkId": "chunk-12",
  "citationExcerpt": "Trecho unico"
}
```

#### Estrutura compativel com alta fidelidade

```json
{
  "sources": [
    {
      "chunkId": "chunk-12",
      "citationExcerpt": "Regra geral"
    },
    {
      "chunkId": "chunk-19",
      "citationExcerpt": "Excecao relevante"
    }
  ]
}
```

## 3) Fluxo realmente proprio por banca

Persona ajuda, mas nao substitui formato e rubrica proprios.

## FCC

Costuma exigir:

1. literalidade fina;
2. excecao;
3. distincao conceitual;
4. alternativas muito proximas.

### Exemplo de questao com boa cara de FCC

```text
Assinale a alternativa correta acerca da competencia administrativa.
```

Por que funciona:

1. enunciado direto;
2. foco tecnico;
3. pouca narrativa;
4. uma alternativa correta e quatro muito proximas.

## FGV

Costuma exigir:

1. aplicacao a cenario;
2. conflito aparente;
3. leitura de consequencia pratica;
4. alternativas defensaveis em leitura rapida.

### Exemplo de questao com boa cara de FGV

```text
Em determinado procedimento administrativo, a autoridade competente deixou de observar requisito formal previsto em norma especifica, mas produziu ato com aparente utilidade pratica. A partir dessa situacao, assinale a alternativa correta.
```

Por que funciona:

1. ha mini-caso;
2. nao entrega o conceito no enunciado;
3. exige aplicacao, nao so memorizacao.

## CESPE/CEBRASPE

Aqui a alta fidelidade exige `Certo/Errado` de verdade.

Emular CESPE em A-E pode produzir algo util, mas nao e alta fidelidade formal.

### Exemplo de formato fiel

```text
Julgue o item a seguir.

Na hipotese de competencia comum, a omissao de um ente federativo exclui, por si so, a possibilidade de atuacao administrativa dos demais.
```

Esse formato depende de:

1. assertiva autonoma;
2. erro nuclear em palavra ou alcance;
3. julgamento binario.

## 4) Rubrica objetiva por banca e por dificuldade

Alta fidelidade depende de criterio objetivo de aprovacao.

Nao basta dizer "gere no estilo FGV".

O sistema precisa saber quando reprovar.

### Exemplo de rubrica FGV dificil

Reprovar automaticamente se:

1. a questao for resolvida por identificacao direta de conceito;
2. o enunciado repetir literalmente a tese correta;
3. menos de 3 alternativas parecerem defensaveis;
4. a correta se destacar por ser mais completa ou elegante;
5. a combinacao de subtemas nao estiver sustentada na base.

### Exemplo de rubrica FCC medio

Reprovar automaticamente se:

1. houver narrativa excessiva;
2. duas alternativas forem obviamente absurdas;
3. a distincao correta/errada depender de conhecimento fora da base;
4. a pegadinha nao for tecnico-normativa.

## 5) Diagnostico da base precisa governar o pipeline

Diagnosticar a base e bom.

Mas, para alta fidelidade, o diagnostico precisa mudar o comportamento do sistema de modo forte.

### Exemplo de politica pratica

Se `qualidade_base = forte`:

1. permitir questoes com 2+ subtemas;
2. permitir dificuldade `dificil` ou `muito_dificil`;
3. exigir revisao rigorosa.

Se `qualidade_base = limitada`:

1. proibir mistura forcada de subtemas;
2. reduzir densidade das pegadinhas;
3. aceitar questoes mais contidas.

Se `qualidade_base = fraca`:

1. permitir apenas questoes literais;
2. ou retornar `base_insuficiente`.

## 6) Exemplo de diferenca entre "questao boa" e "alta fidelidade"

## Questao apenas boa

```text
Assinale a alternativa correta sobre a competencia concorrente.
```

Problemas:

1. generica demais;
2. pode ser resolvida por lembranca superficial;
3. nao reproduz necessariamente a assinatura da banca.

## Questao com alta fidelidade

```text
Determinada lei estadual disciplinou materia de competencia concorrente sem reproduzir integralmente norma geral federal ja existente. Considerando a reparticao constitucional de competencias e os efeitos juridicos dessa superveniencia normativa, assinale a alternativa correta.
```

Por que esta mais proxima:

1. ha contexto;
2. ha conflito plausivel;
3. exige relacao entre regra, limite e consequencia;
4. a banca pode explorar erro nuclear em alcance, validade ou efeito.

## 7) Medicao continua

Sem medir, o sistema melhora "na sensacao", nao na qualidade real.

### Indicadores minimos

1. taxa de reprovacao na fase de revisao;
2. taxa de itens reprovados por falta de ancoragem;
3. taxa de ambiguidade;
4. taxa de itens com correta escancarada;
5. avaliacao humana por banca;
6. comparacao com questoes reais de referencia.

### Exemplo de meta inicial

1. menos de 10% de itens com correta escancarada;
2. menos de 5% de itens com ambiguidade relevante;
3. zero item aprovado sem fonte verificavel;
4. pelo menos 80% de aprovacao humana como "plausivel para a banca".

## Checklist de pronto para alta fidelidade

Considere que o sistema esta realmente pronto quando responder `sim` para tudo abaixo:

1. O revisor recebe a questao e os trechos-fonte?
2. Uma questao pode apontar para mais de uma fonte?
3. O formato muda de verdade por banca?
4. CESPE tem fluxo proprio `Certo/Errado`?
5. A dificuldade pedida e reduzida quando a base nao sustenta?
6. O sistema reprova automaticamente questao bonita, mas extrapolada?
7. Existe rubrica objetiva por banca e nivel?
8. Existe medicao continua de qualidade?

Se a resposta for `nao` para varios itens, o sistema ainda pode gerar boas questoes, mas ainda nao chegou em `alta fidelidade de banca`.

## Prioridade recomendada de evolucao

Se for preciso atacar em etapas, a ordem mais eficiente e:

1. dar base real ao revisor;
2. suportar multiplas fontes por questao;
3. separar CESPE em fluxo proprio;
4. transformar o diagnostico da base em trava forte de pipeline;
5. criar rubricas objetivas por banca e dificuldade;
6. medir com avaliacao humana e criterios consistentes.

## Resumo

`Alta fidelidade de banca` nao e apenas um prompt mais elaborado.

Ela surge quando o sistema combina:

1. base tecnicamente forte;
2. geracao especializada por banca;
3. rastreabilidade completa da fonte;
4. revisao grounded;
5. reprovacao automatica de itens fracos;
6. medicao continua da qualidade.

Sem isso, o resultado pode ficar convincente, mas ainda sera apenas "questao com cara de banca".
