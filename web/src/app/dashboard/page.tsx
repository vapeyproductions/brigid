'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

type SessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  device_id: string | null;
};

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

  // Live/manual timing state
  const [isTiming, setIsTiming] = useState(false);
  const startRef = useRef<number | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [notes, setNotes] = useState('');

  // Simulated device (demo)
  const [simulateOn, setSimulateOn] = useState(false);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rand = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  // AI summary state
  const [summary, setSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Q&A state
  const [qaInput, setQaInput] = useState('');
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  // Past contraction form
  const [pastStart, setPastStart] = useState<string>('');     // datetime-local
  const [pastDuration, setPastDuration] = useState<number>(60);
  const [pastIntensity, setPastIntensity] = useState<number | ''>('');
  const [pastNotes, setPastNotes] = useState('');
  const [pastSaving, setPastSaving] = useState(false);

  // Auth + initial load
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

      // Active session
      const { data: act } = await supabase
        .from('sessions')
        .select('id, started_at, ended_at, device_id')
        .eq('user_id', uid)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveSession(act ?? null);

      // Recent (24h)
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

  // Simulation loop
  useEffect(() => {
    if (!simulateOn || !activeSession || !userId) {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
      return;
    }
    const insertOne = async () => {
      const startedAt = new Date();
      const durationSec = rand(30, 90);
      const intensityVal = rand(3, 8);
      const { data, error } = await supabase
        .from('contractions')
        .insert([
          {
            user_id: userId,
            session_id: activeSession.id,
            source: 'device',
            started_at: startedAt.toISOString(),
            duration_seconds: durationSec,
            intensity: intensityVal,
            notes: 'simulated',
          },
        ])
        .select('id, started_at, duration_seconds, intensity, notes, source')
        .single();
      if (!error && data) setRecent((prev) => [data as ContractionRow, ...prev]);
    };
    insertOne(); // fire one immediately
    simTimerRef.current = setInterval(insertOne, 60_000); // every 60s
    return () => {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    };
  }, [simulateOn, activeSession, userId]);

  // Stats (local)
  const stats = useMemo(() => {
    const now = Date.now();
    const within = (mins: number) =>
      recent.filter((c) => now - new Date(c.started_at).getTime() <= mins * 60_000);
    const last10 = within(10);
    const last24h = within(24 * 60);

    const timestamps = [...recent]
      .map((c) => new Date(c.started_at).getTime())
      .sort((a, b) => a - b);

    const intervals = timestamps
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
      medianDurationSec: recent.length ? Math.round(median(recent.map((r) => r.duration_seconds))!) : null,
    };
  }, [recent]);

  // Helpers — sessions
  const startSession = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('sessions')
      .insert([{ user_id: userId, device_id: null }])
      .select('id, started_at, ended_at, device_id')
      .single();
    if (error) return alert(error.message);
    setActiveSession(data);
  };

  const stopSession = async () => {
    if (!activeSession) return;
    const { error } = await supabase
      .from('sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', activeSession.id);
    if (error) return alert(error.message);
    setSimulateOn(false);
    setActiveSession(null);
  };

  const handleManualToggle = async () => {
    if (!userId || !activeSession) {
      alert('Start a session first.');
      return;
    }
    if (!isTiming) {
      startRef.current = Date.now();
      setIsTiming(true);
    } else {
      const startedAt = new Date(startRef.current!);
      const durationSec = Math.max(1, Math.round((Date.now() - startRef.current!) / 1000));
      setIsTiming(false);
      startRef.current = null;

      const { data, error } = await supabase
        .from('contractions')
        .insert([
          {
            user_id: userId,
            session_id: activeSession.id,
            source: 'manual',
            started_at: startedAt.toISOString(),
            duration_seconds: durationSec,
            intensity,
            notes: notes || null,
          },
        ])
        .select('id, started_at, duration_seconds, intensity, notes, source')
        .single();
      if (!error && data) {
        setRecent((prev) => [data as ContractionRow, ...prev]);
        setNotes('');
      }
    }
  };

  // Helpers — device connect (stub for future BLE/Wi-Fi)
  const connectDevice = async () => {
    alert('Device connection coming soon. For now, use the simulated device toggle to demo.');
  };

  // Helpers — past contraction insert
  const savePastContraction = async () => {
    if (!userId) return alert('Please log in again.');
    if (!pastStart) return alert('Please choose a start date & time.');
    if (!pastDuration || pastDuration <= 0) return alert('Please enter a positive duration (seconds).');

    setPastSaving(true);
    try {
      const startedAt = new Date(pastStart);
      const { data, error } = await supabase
        .from('contractions')
        .insert([
          {
            user_id: userId,
            session_id: null, // past entries need not be tied to a live session
            source: 'manual',
            started_at: startedAt.toISOString(),
            duration_seconds: Math.round(pastDuration),
            intensity: pastIntensity === '' ? null : Number(pastIntensity),
            notes: pastNotes || null,
          },
        ])
        .select('id, started_at, duration_seconds, intensity, notes, source')
        .single();
      if (error) return alert(error.message);
      setRecent((prev) => [data as ContractionRow, ...prev]);
      setPastStart('');
      setPastDuration(60);
      setPastIntensity('');
      setPastNotes('');
    } finally {
      setPastSaving(false);
    }
  };

  // Helpers — AI summary
  const summarizeDay = async () => {
    setAiError(null);
    setAiLoading(true);
    setSummary(null);
    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats }),
      });
      const data = await res.json();
      if (res.ok) setSummary(data.summary);
      else setAiError(data.error || 'Failed to summarize.');
    } catch (e: any) {
      setAiError(e?.message || 'Network error.');
    } finally {
      setAiLoading(false);
    }
  };

  // Helpers — Q&A
  const askQuestion = async () => {
    const q = qaInput.trim();
    if (!q) return;
    setQaError(null);
    setQaAnswer(null);
    setQaLoading(true);
    try {
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (res.ok) setQaAnswer(data.answer);
      else setQaError(data.error || 'Failed to get an answer.');
    } catch (e: any) {
      setQaError(e?.message || 'Network error.');
    } finally {
      setQaLoading(false);
    }
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard</h2>

      {/* Start a session (live tracking) */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h3 className="font-medium">Start a session (live tracking)</h3>

        <div className="flex flex-wrap items-center gap-3">
          {!activeSession ? (
            <button onClick={startSession} className="rounded-xl bg-black px-4 py-2 text-white">
              Start Session
            </button>
          ) : (
            <button onClick={stopSession} className="rounded-xl bg-red-600 px-4 py-2 text-white">
              Stop Session
            </button>
          )}

          <button onClick={connectDevice} className="rounded-xl border px-4 py-2">
            Connect device
          </button>

          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={simulateOn}
              onChange={(e) => setSimulateOn(e.target.checked)}
              disabled={!activeSession}
            />
            Simulated device
          </label>
        </div>

        {/* Live manual timing */}
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Time a contraction in real time:</p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleManualToggle}
              disabled={!activeSession}
              className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
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
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="ml-2 align-middle"
              />
            </label>
          </div>

          <textarea
            className="w-full rounded-xl border p-2 text-sm"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Log a past contraction */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h3 className="font-medium">Log a past contraction (missed earlier)</h3>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Start date &amp; time
            <input
              type="datetime-local"
              value={pastStart}
              onChange={(e) => setPastStart(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2 text-sm"
            />
          </label>

          <label className="text-sm">
            Duration (seconds)
            <input
              type="number"
              min={1}
              value={pastDuration}
              onChange={(e) => setPastDuration(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border p-2 text-sm"
              placeholder="e.g., 60"
            />
          </label>

          <label className="text-sm">
            Intensity (1–10, optional)
            <input
              type="number"
              min={1}
              max={10}
              value={pastIntensity}
              onChange={(e) => setPastIntensity(e.target.value === '' ? '' : Number(e.target.value))}
              className="mt-1 w-full rounded-xl border p-2 text-sm"
              placeholder="e.g., 5"
            />
          </label>

          <label className="text-sm md:col-span-2">
            Notes (optional)
            <textarea
              className="mt-1 w-full rounded-xl border p-2 text-sm"
              rows={2}
              value={pastNotes}
              onChange={(e) => setPastNotes(e.target.value)}
            />
          </label>
        </div>

        <button
          onClick={savePastContraction}
          disabled={pastSaving || !pastStart || !pastDuration}
          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {pastSaving ? 'Saving…' : 'Save past contraction'}
        </button>

        <p className="mt-2 text-xs text-gray-500">
          You can add events you forgot to log earlier. Times are stored in UTC for consistency.
        </p>
      </div>

      {/* Insights + summary */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-medium mb-2">Insights (local)</h3>
        <p className="text-sm text-gray-700">
          Last 10 min: <strong>{stats.last10Count}</strong> · Last 24h:{' '}
          <strong>{stats.last24Count}</strong>
          {stats.medianIntervalSec !== null && (
            <> · Median interval: <strong>{Math.round(stats.medianIntervalSec / 60)} min</strong></>
          )}
          {stats.medianDurationSec !== null && (
            <> · Median duration: <strong>{stats.medianDurationSec} s</strong></>
          )}
        </p>

        <button
          onClick={summarizeDay}
          disabled={aiLoading}
          className="mt-3 rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {aiLoading ? 'Summarizing…' : 'Summarize my day'}
        </button>

        {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
        {summary && (
          <p className="mt-3 text-sm leading-6">
            {summary}
          </p>
        )}

        <p className="mt-2 text-xs text-gray-500">
          Educational only; not a medical device. If you’re concerned, contact your clinician or go to L&amp;D.
        </p>
      </div>

      {/* Q&A */}
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-medium mb-2">Ask a question</h3>
        <div className="flex gap-2">
          <input
            value={qaInput}
            onChange={(e) => setQaInput(e.target.value)}
            placeholder="Ask a non-diagnostic pregnancy question…"
            className="flex-1 rounded-xl border p-3 text-sm"
          />
          <button
            onClick={askQuestion}
            disabled={qaLoading || !qaInput.trim()}
            className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {qaLoading ? 'Thinking…' : 'Ask'}
          </button>
        </div>

        {qaError && <p className="mt-2 text-sm text-red-600">{qaError}</p>}
        {qaAnswer && (
          <div className="mt-3 text-sm leading-6 whitespace-pre-wrap">
            {qaAnswer}
          </div>
        )}

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
            {recent.map((c) => (
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
