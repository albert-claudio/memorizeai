-- Migration: Rename logica_juridica → exercicios_aplicados in runs.objective
-- The objective column is TEXT with a CHECK constraint, not an enum type.

-- 1. Drop the old CHECK constraint
ALTER TABLE public.runs DROP CONSTRAINT IF EXISTS valid_objective;

-- 2. Rename existing objective values
UPDATE public.runs 
SET objective = 'exercicios_aplicados' 
WHERE objective = 'logica_juridica';

-- 3. Add the updated CHECK constraint with the new value
ALTER TABLE public.runs ADD CONSTRAINT valid_objective 
CHECK (objective = ANY (ARRAY['flashcards'::text, 'questoes_banca'::text, 'exercicios_aplicados'::text])) 
NOT VALID;

ALTER TABLE public.runs VALIDATE CONSTRAINT valid_objective;
