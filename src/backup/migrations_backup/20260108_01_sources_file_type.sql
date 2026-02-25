-- Migration: Add file_type column to sources
-- Description: Track document format (pdf, docx, pptx)

-- Add file_type column with default value 'pdf' for existing records
ALTER TABLE sources ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT 'pdf';

-- Add comment
COMMENT ON COLUMN sources.file_type IS 'Document format: pdf, docx, or pptx';
