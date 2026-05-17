import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useSessionRealtime(sessionId?: string) {
  const [session, setSession] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [essays, setEssays] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) return;

    const fetchData = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError('Teacher login is required.');
        return;
      }

      const response = await fetch(`/api/teacher/session-state?sessionId=${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error || 'Could not load session state.');
        return;
      }

      setError('');
      setSession(body.session);
      setStudents(body.students || []);
      setEssays(body.essays || []);
    };

    fetchData();
    const interval = window.setInterval(fetchData, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [sessionId]);

  return { session, students, essays, error };
}
