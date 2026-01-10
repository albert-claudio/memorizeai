-- Migration: Update sources table for Job Queue system
-- Description: Portuguese status names and webhook trigger

-- If table already exists with old status values, alter the constraint
-- Otherwise this creates the table fresh

-- Drop old constraint if exists
ALTER TABLE sources DROP CONSTRAINT IF EXISTS valid_status;

-- Add new constraint with Portuguese status names
ALTER TABLE sources ADD CONSTRAINT valid_status 
  CHECK (status IN ('na_fila', 'processando', 'concluido', 'erro'));

-- Update any existing rows to new status names
UPDATE sources SET status = 'na_fila' WHERE status = 'uploading';
UPDATE sources SET status = 'processando' WHERE status = 'processing';
UPDATE sources SET status = 'concluido' WHERE status = 'ready';
UPDATE sources SET status = 'erro' WHERE status = 'failed';

-- ============================================================================
-- DATABASE WEBHOOK TRIGGER
-- This function is called automatically when a new source is inserted
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_new_source()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
BEGIN
  -- Only trigger for new rows with status 'na_fila'
  IF NEW.status = 'na_fila' THEN
    payload := json_build_object(
      'source_id', NEW.id,
      'user_id', NEW.user_id,
      'filename', NEW.filename,
      'storage_path', NEW.storage_path
    );
    
    -- Send notification via pg_notify (for local listeners)
    PERFORM pg_notify('new_source', payload::text);
    
    -- For Supabase Edge Functions, use http extension to call the function
    -- This requires the http extension to be enabled
    -- Uncomment below if you have http extension:
    /*
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/process-source',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := payload::jsonb
    );
    */
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for INSERT
DROP TRIGGER IF EXISTS on_source_created ON sources;
CREATE TRIGGER on_source_created
  AFTER INSERT ON sources
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_source();

-- ============================================================================
-- REALTIME SUBSCRIPTION
-- Enable realtime for sources table
-- ============================================================================

-- This needs to be done in Supabase Dashboard > Database > Replication
-- Or via SQL (may require superuser):
-- ALTER PUBLICATION supabase_realtime ADD TABLE sources;
