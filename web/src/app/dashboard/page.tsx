'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

// -----------------------------
// Types
// -----------------------------
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

// -----------------------------
// UI helpers (tiny primitives)
// -----------------------------
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-violet-200 bg-white/90 p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-sm font-semibold text-violet-700 ${className}`}>{children}</h3>;
}

function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
  ariaBusy,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'danger' | 'outline' | 'ghost';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  ariaBusy?: boolean;
}) {
  const base =
    'rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-violet-400';
  const variants: Record<string, string> = {
    primary: 'bg-violet-600 text-white hover:bg-violet-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    outline: 'border border-violet-300 text-violet-700 hover:bg-violet-50',
    ghost: 'text-violet-700 hover:bg-violet-100',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-busy={ariaBusy}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-sm ${className}`}>{children}</label>;
}

function TextArea({
  value,
  onChange,
  rows = 2,
  placeholder = '',
  className = '',
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-violet-200 p-2 text-sm focus:ring-2 focus:ring-violet-400 ${className}`}
    />
  );
}

function Input({
  type = 'text',
  value,
  onChange,
  placeholder,
  min,
  max,
  className = '',
}: {
  type?: string;
  value: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
      max={max}
      className={`w-full rounded-xl border border-violet-200 p-2 text-sm focus:ring-2 focus:ring-violet-400 ${className}`}
    />
  );
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-xs">
      <span className="text-violet-600">{label}</span>
      <strong className="text-violet-800">{value}</strong>
    </div>
  );
}

// -----------------------------
// Utilities
// -----------------------------
const formatClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
};

const toLocalString = (iso: string) => new Date(iso).toLocaleString();

// -----------------------------
// Page
// -----------------------------
export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [recent, setRecent] = useState<ContractionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Live/manual timing state
  const [isTiming, setIsTiming] = useState(false);
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
  const [pastStart, setPastStart] = useState<string>(''); // datetime-local
  const [pastDuration, setPastDuration] = useState<number>(60);
  const [pastIntensity, setPastIntensity] = useState<number | ''>('');
  const [pastNotes, setPastNotes] = useState('');
  const [pastSaving, setPastSaving] = useState(false);

  // ---------------------------------
  // Auth + initial load
  // ---------------------------------
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

  // ---------------------------------
  // Manual timer tick
  // ---------------------------------
  useEffect(() => {
    if (!isTiming) return;
    tickRef.current = setInterval(() => {
      if (startRef.current) setElapsed(Date.now() - startRef.current);
    }, 200);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isTiming]);

  // ---------------------------------
  // Simulation loop
  // ---------------------------------
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

  // ---------------------------------
  // Stats (local)
  // ---------------------------------
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

  // ---------------------------------
  // Session helpers
  // ---------------------------------
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
    setIsTiming(false);
    startRef.current = null;
    setElapsed(0);
  };

  const handleManualToggle = async () => {
    if (!userId || !activeSession) {
      alert('Start a session first.');
      return;
    }
    if (!isTiming) {
      startRef.current = Date.now();
      setElapsed(0);
      setIsTiming(true);
    } else {
      const startedAt = new Date(startRef.current!);
      const durationSec = Math.max(1, Math.round((Date.now() - startRef.current!) / 1000));
      setIsTiming(false);
      startRef.current = null;
      setElapsed(0);

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

  const connectDevice = async () => {
    alert('Device connection coming soon. For now, use the simulated device toggle to demo.');
  };

  // ---------------------------------
  // Past contraction insert
  // ---------------------------------
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

  // ---------------------------------
  // AI summary
  // ---------------------------------
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

  // ---------------------------------
  // Q&A
  // ---------------------------------
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

  // ---------------------------------
  // Skeleton
  // ---------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-violet-50 p-6 space-y-6">
        <div className="h-7 w-40 rounded bg-violet-200 animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-violet-200 bg-white/90 p-4 shadow-sm">
            <div className="h-5 w-48 rounded bg-violet-100 animate-pulse" />
            <div className="mt-3 h-10 w-full rounded bg-violet-50 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  // ---------------------------------
  // Render
  // ---------------------------------
  return (
    <div className="min-h-screen bg-violet-50 p-6 space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-violet-300 via-violet-200 to-violet-100 p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-violet-900">Dashboard</h2>
            <p className="text-sm text-violet-800/80">Track, log, and review your contractions</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Session status pill */}
            {activeSession ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white shadow-sm">
                ● Session Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
                ○ No Active Session
              </span>
            )}

            {/* Stats badges */}
            <div className="flex items-center gap-2">
              <StatBadge label="Last 10 min" value={stats.last10Count} />
              <StatBadge label="Last 24h" value={stats.last24Count} />
              {stats.medianIntervalSec !== null && (
                <StatBadge label="Median interval" value={`${Math.round(stats.medianIntervalSec / 60)} min`} />
              )}
              {stats.medianDurationSec !== null && (
                <StatBadge label="Median duration" value={`${stats.medianDurationSec} s`} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Start a session (live tracking) */}
      <Card className="space-y-3">
        <SectionTitle>Start a session (live tracking)</SectionTitle>

        <div className="flex flex-wrap items-center gap-3">
          {!activeSession ? (
            <Button onClick={startSession}>Start Session</Button>
          ) : (
            <Button onClick={stopSession} variant="danger">
              Stop Session
            </Button>
          )}

          <Button onClick={connectDevice} variant="outline">
            Connect device
          </Button>

          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={simulateOn}
              onChange={(e) => setSimulateOn(e.target.checked)}
              disabled={!activeSession}
              aria-label="Toggle simulated device"
              className="accent-violet-600"
            />
            <span className="text-violet-800">Simulated device</span>
          </Label>
        </div>

        {/* Live manual timing */}
        <div className="space-y-2">
          <p className="text-sm text-violet-900/80">Time a contraction in real time:</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleManualToggle} disabled={!activeSession} ariaBusy={isTiming}>
              {isTiming ? 'Stop & Save' : 'Start'}
            </Button>

            {isTiming && (
              <span className="font-mono text-sm tabular-nums text-violet-900" aria-live="polite">
                {formatClock(elapsed)}
              </span>
            )}

            <Label className="flex items-center gap-2">
              <span className="text-violet-900/80">Intensity: {intensity}</span>
              <input
                type="range"
                min={1}
                max={10}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="align-middle accent-violet-600"
                aria-label="Intensity"
              />
            </Label>
          </div>

          <TextArea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Card>

      {/* Log a past contraction */}
      <Card className="space-y-3">
        <SectionTitle>Log a past contraction (missed earlier)</SectionTitle>

        <div className="grid gap-3 md:grid-cols-2">
          <Label>
            <span className="text-violet-900/80">Start date &amp; time</span>
            <Input
              type="datetime-local"
              value={pastStart}
              onChange={(e) => setPastStart(e.target.value)}
              className="mt-1"
            />
          </Label>

          <Label>
            <span className="text-violet-900/80">Duration (seconds)</span>
            <Input
              type="number"
              min={1}
              value={pastDuration}
              onChange={(e) => setPastDuration(Number(e.target.value))}
              className="mt-1"
              placeholder="e.g., 60"
            />
          </Label>

          <Label>
            <span className="text-violet-900/80">Intensity (1–10, optional)</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={pastIntensity}
              onChange={(e) => setPastIntensity(e.target.value === '' ? '' : Number(e.target.value))}
              className="mt-1"
              placeholder="e.g., 5"
            />
          </Label>

          <Label className="md:col-span-2">
            <span className="text-violet-900/80">Notes (optional)</span>
            <TextArea value={pastNotes} onChange={(e) => setPastNotes(e.target.value)} rows={2} className="mt-1" />
          </Label>
        </div>

        <Button onClick={savePastContraction} disabled={pastSaving || !pastStart || !pastDuration} ariaBusy={pastSaving}>
          {pastSaving ? 'Saving…' : 'Save past contraction'}
        </Button>

        <p className="mt-2 text-xs text-violet-900/60">
          You can add events you forgot to log earlier. Times are stored in UTC for consistency.
        </p>
      </Card>

      {/* Insights + summary */}
      <Card>
        <SectionTitle className="mb-2">Insights (local)</SectionTitle>
        <p className="text-sm text-violet-900/80">
          Last 10 min: <strong className="text-violet-900">{stats.last10Count}</strong> · Last 24h:{' '}
          <strong className="text-violet-900">{stats.last24Count}</strong>
          {stats.medianIntervalSec !== null && (
            <> · Median interval: <strong className="text-violet-900">{Math.round(stats.medianIntervalSec / 60)} min</strong></>
          )}
          {stats.medianDurationSec !== null && (
            <> · Median duration: <strong className="text-violet-900">{stats.medianDurationSec} s</strong></>
          )}
        </p>

        <Button onClick={summarizeDay} disabled={aiLoading} ariaBusy={aiLoading} className="mt-3">
          {aiLoading ? 'Summarizing…' : 'Summarize my day'}
        </Button>

        {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
        {summary && <p className="mt-3 text-sm leading-6 text-violet-900">{summary}</p>}

        <p className="mt-2 text-xs text-violet-900/60">
          Educational only; not a medical device. If you’re concerned, contact your clinician or go to L&amp;D.
        </p>
      </Card>

      {/* Q&A */}
      <Card>
        <SectionTitle className="mb-2">Ask a question</SectionTitle>
        <div className="flex gap-2">
          <input
            value={qaInput}
            onChange={(e) => setQaInput(e.target.value)}
            placeholder="Ask a non-diagnostic pregnancy question…"
            className="flex-1 rounded-xl border border-violet-200 p-3 text-sm focus:ring-2 focus:ring-violet-400"
            aria-label="Ask a question"
          />
          <Button onClick={askQuestion} disabled={qaLoading || !qaInput.trim()} ariaBusy={qaLoading}>
            {qaLoading ? 'Thinking…' : 'Ask'}
          </Button>
        </div>

        {qaError && <p className="mt-2 text-sm text-red-600">{qaError}</p>}
        {qaAnswer && <div className="mt-3 text-sm leading-6 whitespace-pre-wrap text-violet-900">{qaAnswer}</div>}

        <p className="mt-2 text-xs text-violet-900/60">
          Educational only; not a medical device. If you’re concerned, contact your clinician or go to L&amp;D.
        </p>
      </Card>

      {/* Recent list */}
      <Card>
        <SectionTitle className="mb-2">Recent (24h)</SectionTitle>
        {!recent.length ? (
          <p className="text-sm text-violet-900/70">No contractions yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((c) => (
              <li key={c.id} className="text-sm text-violet-900">
                <span className="font-mono tabular-nums">{toLocalString(c.started_at)}</span> — {c.duration_seconds}s
                {c.intensity ? ` · intensity ${c.intensity}` : ''} · {c.source}
                {c.notes ? ` · ${c.notes}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
