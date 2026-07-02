import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient(
       'https://zgranceaggftjoerxplz.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpncmFuY2VhZ2dmdGpvZXJ4cGx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQ1ODIsImV4cCI6MjA5MDg0MDU4Mn0.RDg-q8wfSFY82cDivA9-VUXuE-Sc99fyZBEyvyxw3Ds',
 
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}