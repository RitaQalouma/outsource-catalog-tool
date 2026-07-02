import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    'https://zgranceaggftjoerxplz.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpncmFuY2VhZ2dmdGpvZXJ4cGx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQ1ODIsImV4cCI6MjA5MDg0MDU4Mn0.RDg-q8wfSFY82cDivA9-VUXuE-Sc99fyZBEyvyxw3Ds'
  );
}