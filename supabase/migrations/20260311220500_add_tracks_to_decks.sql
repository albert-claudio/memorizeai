-- Adiciona colunas para organizar decks em Trilhas Simples
-- Mantem nullability para compatibilidade com decks existentes
ALTER TABLE "public"."decks"
ADD COLUMN "concurso" text null,
ADD COLUMN "materia" text null,
ADD COLUMN "tema" text null;
