-- Migration: Create Storage bucket and policies for PDFs
-- Description: Supabase Storage setup for user PDF uploads
-- 
-- NOTE: Run this in Supabase SQL Editor or via Dashboard
-- Storage bucket creation might require Dashboard for some configurations

-- Create the bucket (if using SQL - may need to be done via Dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for Storage

-- Users can upload PDFs to their own folder: /pdfs/{user_id}/*
CREATE POLICY "Users can upload PDFs to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can view their own PDFs
CREATE POLICY "Users can view own PDFs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own PDFs
CREATE POLICY "Users can delete own PDFs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'pdfs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Service role can access all PDFs (for Edge Functions)
CREATE POLICY "Service role full access PDFs"
ON storage.objects FOR ALL
USING (
  bucket_id = 'pdfs' 
  AND auth.role() = 'service_role'
);
