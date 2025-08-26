'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

type SessionRow = { id: string; started_at: string; ended_at: string | null; device_id: string | null };
type ContractionRow = {
  id: string;
  started_at: string;
  duration_seconds: number;
  intensity: number | null;
  notes: string | null;
  source: 'manual' | 'device';
};

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [recent, setRecent] = useState<ContractionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // manual contraction form state
  const [isTiming, setIsTiming] = useState(false);
  const startRef = useRef<number | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [notes, setNotes] = useState('');

  // auth + load active session + recent contractions
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const sess = sessionData.session;
      if (!sess) {
        router.replace('/login');
        return;
      }
      const uid = sess.user.id;
      if (!mounted) return;
      setUserId(uid);

      // active session (ended_at is null)
      const { data: act } = await supabase
        .from('sessions')
        .select('id, started_at, ended_at, device_id')
        .eq('user_id', uid)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveSession(act ?? null);

      // recent contractions (last 24h)
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: cons } = await supabase
        .from('contractions')
        .select('id, started_at, duration_seconds, intensity, notes, source')
        .eq('user_id', uid)
        .gte('started_at', since)
        .order('started_at', { ascending: false });

      setRecent(cons ?? []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  // simple stats
  const stats = useMemo(() => {
    const now = Date.now();
    const within = (mins: number) =>
      recent.filter(c => now - new Date(c.started_at).getTime() <= mins * 60_000);

    const last10 = within(10);
    const last24h = within(24 * 60);

    const intervals = [...recent]
      .map(c => new Date(c.started_at).getTime())
      .sort((a, b) => a - b)
      .map((t, i, arr) => (i === 0 ? null : (t - arr[i - 1]) / 1000))
      .filter((x): x is number => x !== null);

    const median = (arr: number[]) => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    return {
      last10Count: last10.length,
      last24Count: last24h.length,
      medianIntervalSec: intervals.length ? Math.round(median(intervals)!) : null,
      medianDurationSec: recent.length ? Math.round(median(recent.map(r => r.duration_seconds))!) : null,
    };
  }, [recent]);

  // start session
  const startSession = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('sessions')
      .insert([{ user_id: userId, device_id: null }])
      .select('id, started_at, ended_at, device_id')
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setActiveSession(data);
  };

  // stop session
  const stopSession = async () => {
    if (!activeSession) return;
    const { error } = await supabase
      .from('sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', activeSession.id);
    if (error) {
      alert(error.message);
      return;
    }
    setActiveSession(null);
  };

  // manual contraction start/stop
  const handleManualToggle = async () => {
    if (!userId || !activeSession) {
      alert('Start a session first.');
      return;
    }
    if (!isTiming) {
      // start timing
      startRef.current = Date.now();
      setIsTiming(true);
    } else {
      // stop and save
      const startedAt = new Date(startRef.current!);
      const durationSec = Math.max(1, Math.round((Date.now() - startRef.current!) / 1000));
      setIsTiming(false);
      startRef.current = null;

      const { data, error } = await supabase.from('contractions').insert([
        {
          user_id: userId,
          session_id: activeSession.id,
          source: 'manual',
          started_at: startedAt.toISOString(),
          duration_seconds: durationSec,
          intensity,
          notes: notes || null,
        },
      ]).select('id, started_at, duration_seconds, intensity, notes, source').single();

      if (error) {
        alert(error.message);
        return;
      }
      // prepend to recent list
      setRecent(prev => [data as ContractionRow, ...prev]);
      setNotes('');
    }
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard</h2>

      {/* Session controls */}
      <div className="rounded-xl border bg-white p-4">
        <p className="mb-2 text-sm text-gray-700">
          Session status: {activeSession ? 'Active' : 'Stopped'}
        </p>
        {!activeSession ? (
          <button
            onClick={startSession}
            className="rounded-xl bg-black px-4 py-2 text-white"
          >
            Start Session
          </button>
        ) : (
          <button
            onClick={stopSession}
            className="rounded-xl bg-red-600 px-4 py-2 text-white"
          >
            Stop Session
          </button>
        )}
      </div>

      {/* Manual contraction */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h3 className="font-medium">Manual Contraction</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={handleManualToggle}
            className="rounded-xl bg-black px-4 py-2 text-white"
          >
            {isTiming ? 'Stop & Save' : 'Start'}
          </button>
          <label className="text-sm">
            Intensity: {intensity}
            <input
              type="range"
              min={1}
              max={10}
              value={intensity}
              onChange={e => setIntensity(Number(e.target.value))}
              className="ml-2 align-middle"
            />
          </label>
        </div>
        <textarea
          className="w-full rounded-xl border p-2 text-sm"
          placeholder="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      {/* Stats */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-medium mb-2">Insights (local)</h3>
        <p className="text-sm text-gray-700">
          Last 10 min: <strong>{stats.last10Count}</strong> · Last 24h:{' '}
          <strong>{stats.last24Count}</strong>
          {stats.medianIntervalSec !== null && (
            <> · Median interval: <strong>{Math.round(stats.medianIntervalSec / 60)} min</strong></>
          )}
          {stats.medianDurationSec !== null && (
            <> · Median duration: <strong>{Math.round(stats.medianDurationSec)} s</strong></>
          )}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Educational only; not a medical device. If you’re concerned, contact your clinician or go to L&amp;D.
        </p>
      </div>

      {/* Recent list */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-medium mb-2">Recent (24h)</h3>
        {!recent.length ? (
          <p className="text-sm text-gray-600">No contractions yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map(c => (
              <li key={c.id} className="text-sm">
                <span className="font-mono">
                  {new Date(c.started_at).toLocaleString()}
                </span>{' '}
                — {c.duration_seconds}s
                {c.intensity ? ` · intensity ${c.intensity}` : ''} · {c.source}
                {c.notes ? ` · ${c.notes}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
