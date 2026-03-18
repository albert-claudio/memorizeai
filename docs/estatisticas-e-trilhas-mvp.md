# Estatisticas Claras e Organizacao por Trilhas

## Objetivo

Este documento define, com exemplos concretos, o que o produto precisa entregar para sustentar as promessas:

1. `Estatisticas claras`
2. `Organizacao por trilhas`

O foco aqui nao e a versao idealizada. O foco e um `MVP forte`, suficiente para:

1. fazer sentido para os primeiros usuarios;
2. alinhar marketing com entrega real;
3. evitar retrabalho de arquitetura.

## Resumo executivo

Hoje o produto ja tem:

1. `dados suficientes` para um painel basico de progresso;
2. `estrutura suficiente` para organizar decks por trilhas leves;
3. `lacunas de interface e agregacao`, nao de fundamento tecnico.

Em termos praticos:

1. `Estatisticas claras` deve virar um bloco real dentro do dashboard do aluno.
2. `Organizacao por trilhas` deve virar metadado estruturado em deck + filtros reais.

## Estado atual

### O que ja existe para estatisticas

O projeto ja grava dados relevantes em:

1. `cards`
   - `next_review_at`
   - `last_review_at`
   - `lapses`
   - `is_leech`
   - `difficulty`
   - `stability`

2. `card_reviews`
   - historico de revisoes
   - nota/grade por revisao
   - data da revisao

3. `simulados` e `simulado_respostas`
   - historico de simulados
   - desempenho por tentativa

4. `user_srs_settings`
   - `desired_retention`

Isso significa que o problema hoje nao e falta de dados. O problema e falta de:

1. agregacao;
2. API dedicada;
3. UI no dashboard.

### O que ja existe para organizacao

Hoje o produto possui:

1. `decks`
2. `title`
3. `description`

Na pratica, isso permite uma organizacao manual, mas ainda nao sustenta a promessa de:

1. separar por materia;
2. separar por concurso;
3. separar por tema;
4. encontrar tudo rapido.

O gap aqui e de estrutura e busca, nao de conceito.

## Definicao operacional do MVP

## 1. Estatisticas claras

Para considerar essa feature entregue no MVP, o usuario precisa ver no dashboard:

1. `cards para hoje`
2. `cards revisados hoje`
3. `precisao dos ultimos 7 dias`
4. `streak de estudo`
5. `decks que exigem atencao`
6. `media recente de simulados`

### O que essa feature precisa responder

Ao abrir o dashboard, o usuario precisa conseguir responder:

1. `Estou avancando ou parado?`
2. `Tenho coisa acumulada para revisar hoje?`
3. `Quais materias/decks estao mais fracos?`
4. `Meu desempenho em simulado esta melhorando?`

### O que nao precisa no MVP

Nao precisa agora:

1. graficos complexos;
2. IA para explicar lacunas;
3. heatmap diario sofisticado;
4. analise por chunk ou por fonte;
5. predicao de aprovacao.

## 2. Organizacao por trilhas

Para considerar essa feature entregue no MVP, cada deck precisa poder carregar:

1. `concurso`
2. `materia`
3. `tema`

E o dashboard precisa permitir:

1. `buscar por texto`
2. `filtrar por concurso`
3. `filtrar por materia`
4. `visualizar agrupado por trilha`

### Definicao pratica de trilha no MVP

No MVP, `trilha` nao precisa ser uma entidade nova no banco.

Ela pode ser apenas a combinacao:

`Concurso > Materia > Tema`

Exemplos:

1. `TJ-SP > Direito Civil > Obrigacoes`
2. `INSS > Direito Previdenciario > Beneficios`
3. `OAB > Processo Civil > Recursos`

Isso ja entrega utilidade real sem criar uma arquitetura pesada de taxonomia.

## Exemplos concretos

## Exemplo 1: dashboard com estatisticas

Bloco sugerido no topo do dashboard:

```txt
Hoje
- 42 cards para revisar
- 18 cards revisados hoje
- Precisao 7 dias: 81%
- Streak: 6 dias

Atenção
- Processo Civil - Recursos: 14 cards atrasados
- Direito Penal - Crimes contra a Administracao: 5 leech cards

Simulados
- Media ultimos 5: 68%
- Melhor resultado recente: 74%
```

### Interpretacao do usuario

Com esse bloco, o usuario entende imediatamente:

1. o volume do dia;
2. se esta mantendo consistencia;
3. onde esta a maior friccao;
4. se simulados estao melhorando.

## Exemplo 2: API de estatisticas

Rota sugerida:

`GET /api/dashboard/stats`

Resposta exemplo:

```json
{
  "today": {
    "dueCards": 42,
    "reviewedToday": 18
  },
  "performance": {
    "accuracy7d": 0.81,
    "studyStreakDays": 6
  },
  "focusDecks": [
    {
      "deckId": "deck_1",
      "deckTitle": "Processo Civil - Recursos",
      "overdueCards": 14,
      "leechCards": 2,
      "riskScore": 18
    },
    {
      "deckId": "deck_2",
      "deckTitle": "Direito Penal",
      "overdueCards": 6,
      "leechCards": 5,
      "riskScore": 16
    }
  ],
  "simulados": {
    "recentAverage": 0.68,
    "lastScore": 0.74
  }
}
```

### Regras de calculo sugeridas

1. `dueCards`
   - cards do usuario com `next_review_at <= agora`

2. `reviewedToday`
   - linhas em `card_reviews` no dia corrente

3. `accuracy7d`
   - percentual de revisoes com nota positiva nos ultimos 7 dias
   - no MVP, pode considerar:
     - `Bom` e `Facil` como acerto
     - `Errei` e `Dificil` como erro

4. `studyStreakDays`
   - numero de dias consecutivos com pelo menos 1 revisao

5. `focusDecks`
   - decks ordenados por risco
   - risco simples sugerido:
     - `overdueCards + (leechCards * 2)`

6. `recentAverage`
   - media dos ultimos 5 simulados concluidos

## Exemplo 3: criacao de deck com trilha

Formulario sugerido:

```txt
Novo Deck
- Titulo: Direito Civil - Obrigacoes
- Concurso: TJ-SP
- Materia: Direito Civil
- Tema: Obrigacoes
- Descricao: Parte geral, inadimplemento e perdas e danos
```

### Valor pratico

Com isso, o usuario pode:

1. separar o mesmo tema por concursos diferentes;
2. separar materias amplas em temas menores;
3. filtrar rapido sem depender de nome manual no titulo.

## Exemplo 4: dashboard com filtros de trilha

Controles sugeridos:

```txt
Busca: [ obrigacoes____________ ]
Concurso: [ TJ-SP v ]
Materia: [ Direito Civil v ]
Agrupar por: [ Materia v ]
```

Lista resultante:

```txt
Direito Civil
- Obrigacoes
  - Direito Civil - Obrigacoes
  - Revisar 12 cards hoje

- Responsabilidade Civil
  - Responsabilidade Civil - TJ-SP
  - Revisar 7 cards hoje
```

## Escopo tecnico recomendado

## 1. Banco de dados

Adicionar em `decks`:

1. `concurso text null`
2. `materia text null`
3. `tema text null`

Observacao:

1. todos opcionais no inicio;
2. sem criar tabela `tracks` agora;
3. com index simples se o volume crescer.

## 2. Tipos

Atualizar `Deck` para incluir:

1. `concurso`
2. `materia`
3. `tema`

## 3. Dashboard

Adicionar:

1. bloco de estatisticas no topo;
2. filtros de busca;
3. filtros por concurso e materia;
4. badges visiveis de trilha no card do deck.

## 4. API

Criar:

1. `GET /api/dashboard/stats`

Se quiser manter simples:

1. usar uma rota unica;
2. agregar tudo server-side com Supabase;
3. manter estado vazio bem tratado.

## 5. UX minima obrigatoria

Para o MVP ficar convincente, a UX precisa ter:

1. linguagem simples;
2. destaque visual para o que exige acao;
3. filtros rapidos;
4. estado vazio explicando como comecar.

## O que fazer primeiro

Ordem recomendada:

1. migration em `decks` para `concurso`, `materia`, `tema`
2. tipos e services
3. `GET /api/dashboard/stats`
4. cards de estatisticas no dashboard
5. filtros e badges de trilha
6. ajuste da landing page para refletir exatamente o MVP entregue

## Definicao de pronto

Estas promessas passam a ser defensaveis quando:

1. o dashboard mostra progresso real do aluno;
2. o usuario consegue localizar decks por concurso e materia;
3. os decks exibem trilha claramente;
4. o texto da landing bate com a experiencia real do app.

## Decisao de produto

Se for preciso abrir para usuarios antes da versao completa, a linha correta e:

1. entregar este MVP;
2. evitar promessas mais ambiciosas que ele;
3. evoluir depois para:
   - estatisticas por tema;
   - comparacao historica mais rica;
   - taxonomia mais forte de trilhas;
   - metas e planejamento por prova.
