# Atualização do Modelo WatermelonDB (MVP Estatísticas e Trilhas)

Para manter a compatibilidade com a nova estrutura web do Supabase, o schema local do WatermelonDB no app móvel precisará ser atualizado na próxima etapa da equipe Mobile.

## Alterações no Schema (`model/schema.js`)
Na tabela `decks`, adicione três novas colunas de texto opcionais:

```javascript
tableSchema({
  name: 'decks',
  columns: [
    // ... colunas existentes (id, title, etc)
    { name: 'concurso', type: 'string', isOptional: true },
    { name: 'materia', type: 'string', isOptional: true },
    { name: 'tema', type: 'string', isOptional: true },
  ]
});
```

## Alterações no Model (`model/Deck.js`)
Adicione os decoradores de campo (`@text`) para mapear essas novas colunas no modelo da aplicação Mobile:

```javascript
import { Model } from '@nozbe/watermelondb'
import { text } from '@nozbe/watermelondb/decorators'

export default class Deck extends Model {
  static table = 'decks'

  // ... associações e campos pré-existentes

  @text('concurso') concurso
  @text('materia') materia
  @text('tema') tema
}
```

## Observações de Sincronização (Sync Protocol)
A API de Sync Push/Pull que trafega as atualizações locais do mobile para o Supabase precisará garantir a passagem das chaves JSON `concurso`, `materia` e `tema` sem formatações bruscas, dado que o Web App já opera nativamente com elas com trim().
