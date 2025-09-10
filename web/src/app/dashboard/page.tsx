'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// -------------------------------------------------
// Types
// -------------------------------------------------
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

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string; // ISO
};

// Saved chat types
type FolderRow = {
  id: string;
  name: string;
  created_at?: string;
};

type ThreadRow = {
  id: string;
  title: string;
  folder_id: string | null;
  started_at: string;
  updated_at: string;
  message_count: number;
};

// -------------------------------------------------
// Tiny UI primitives
// -------------------------------------------------
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
  onKeyDown,
  disabled,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      disabled={!!disabled}
      className={`w-full rounded-xl border border-violet-200 p-2 text-sm focus:ring-2 focus:ring-violet-400 disabled:opacity-60 ${className}`}
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

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm ' +
          (isUser
            ? 'bg-violet-600 text-white rounded-br-md'
            : 'bg-white text-violet-900 border border-violet-200 rounded-bl-md')
        }
      >
        <div>{message.content}</div>
        <div className={`mt-1 text-[10px] opacity-70 ${isUser ? 'text-white' : 'text-violet-700'}`}>
          {new Date(message.created_at).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function Th({ label, active, dir, onClick }: { label: string; active?: boolean; dir?: 'asc' | 'desc'; onClick?: () => void }) {
  return (
    <th
      className={`px-3 py-2 font-semibold select-none ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? <span aria-hidden>{dir === 'asc' ? '▲' : '▼'}</span> : null}
      </span>
    </th>
  );
}

// -------------------------------------------------
// Utilities
// -------------------------------------------------
const formatClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
};

const toLocalString = (iso: string) => new Date(iso).toLocaleString();

const csvEscape = (v: unknown): string => {
  if (v == null) return '';
  const s = String(v);
  const escaped = s.split('"').join('""');
  const needsQuotes = s.includes('"') || s.includes(',') || s.includes('\n');
  return needsQuotes ? `"${escaped}"` : escaped;
};

// -------------------------------------------------
// Page
// -------------------------------------------------
export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [recent, setRecent] = useState<ContractionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [pageError, setPageError] = useState<string | null>(null);

  // Live/manual timing state
  const [isTiming, setIsTiming] = useState(false);
  const startRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [notes, setNotes] = useState('');

  // Simulated device (demo)
  const [simulateOn, setSimulateOn] = useState(false);
  const simTimerRef = useRef<number | null>(null);
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  // AI summary state
  const [summary, setSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Chat state (Q&A)
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Past contraction form
  const [pastStart, setPastStart] = useState<string>('');
  const [pastDuration, setPastDuration] = useState<number>(60);
  const [pastIntensity, setPastIntensity] = useState<number | ''>('');
  const [pastNotes, setPastNotes] = useState('');
  const [pastSaving, setPastSaving] = useState(false);

  // All contractions log (paginated + filters + sort)
  const PAGE_SIZE = 50;
  const [allCons, setAllCons] = useState<ContractionRow[]>([]);
  const [allOffset, setAllOffset] = useState(0);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);
  const [allHasMore, setAllHasMore] = useState(true);

  type SourceFilter = 'all' | 'manual' | 'device';
  const [filterStart, setFilterStart] = useState<string>('');
  const [filterEnd, setFilterEnd] = useState<string>('');
  const [filterSource, setFilterSource] = useState<SourceFilter>('all');
  const [filterIntensityMin, setFilterIntensityMin] = useState<number | ''>('');
  const [filterIntensityMax, setFilterIntensityMax] = useState<number | ''>('');

  const [allSort, setAllSort] = useState<{ column: 'started_at' | 'duration_seconds' | 'intensity' | 'source'; direction: 'asc' | 'desc' }>(
    { column: 'started_at', direction: 'desc' }
  );

  // Saved chat state
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState<boolean>(true); // collapsible “Saved chats” above Q+A

// Create a browser-only Supabase client (reads/writes localStorage)
const supabase = useMemo(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
  });
}, []);

// React to auth changes (single subscription)
useEffect(() => {
  const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
    setUserId(session?.user?.id ?? null);
  });
  return () => sub.subscription.unsubscribe();
}, [supabase]);

// Fetch/paginate the contractions table (hoisted named function)
async function loadAll(reset = false) {
  if (!userId) return;
  setAllLoading(true);
  setAllError(null);

  const from = reset ? 0 : allOffset;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('contractions')
    .select('id, started_at, duration_seconds, intensity, notes, source')
    .eq('user_id', userId);

  if (filterStart) query = query.gte('started_at', new Date(filterStart).toISOString());
  if (filterEnd) query = query.lte('started_at', new Date(filterEnd).toISOString());
  if (filterSource !== 'all') query = query.eq('source', filterSource);
  if (filterIntensityMin !== '') query = query.gte('intensity', Number(filterIntensityMin));
  if (filterIntensityMax !== '') query = query.lte('intensity', Number(filterIntensityMax));

  query = query.order(allSort.column, { ascending: allSort.direction === 'asc' }).range(from, to);

  const { data, error } = await query;
  if (error) {
    setAllError(error.message);
  } else {
    const fetched = data ?? [];
    if (reset) {
      setAllCons(fetched);
      setAllOffset(fetched.length);
    } else {
      setAllCons((prev) => [...prev, ...fetched]);
      setAllOffset(from + fetched.length);
    }
    setAllHasMore(fetched.length === PAGE_SIZE);
  }

  setAllLoading(false);
}



// ---------------------------------
// Auth + initial load
// ---------------------------------
useEffect(() => {
  let cancelled = false;

  const loadInitial = async (uid: string) => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [actRes, consRes] = await Promise.all([
      supabase.from('sessions')
        .select('id, started_at, ended_at, device_id')
        .eq('user_id', uid)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
      supabase.from('contractions')
        .select('id, started_at, duration_seconds, intensity, notes, source')
        .eq('user_id', uid)
        .gte('started_at', since)
        .order('started_at', { ascending: false }),
    ]);
    if (cancelled) return;
    setActiveSession((actRes.data?.[0] as SessionRow) ?? null);
    setRecent(consRes.data ?? []);
  };

  const init = async () => {
    try {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) throw error;
      const uid = sessionData?.session?.user?.id ?? null;
      setUserId(uid);
      if (uid) await loadInitial(uid);
    } catch (e: any) {
      setPageError(e?.message ?? 'Failed to initialize dashboard.');
    } finally {
      setLoading(false);
    }
  };

  init();
  return () => { cancelled = true; };
}, [supabase]);

// Kick off the first load when we have a user
useEffect(() => {
  if (!userId) return;
  setAllOffset(0);
  setAllHasMore(true);
  loadAll(true);
}, [userId]);


  // ---------------------------------
  // Manual timer tick
  // ---------------------------------
  useEffect(() => {
  if (!isTiming) return;

  tickRef.current = window.setInterval(() => {
    if (startRef.current) setElapsed(Date.now() - startRef.current);
  }, 200);

  return () => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };
}, [isTiming]);


  // ---------------------------------
  // Simulation loop
  // ---------------------------------
  useEffect(() => {
  if (!simulateOn || !activeSession || !userId) {
    if (simTimerRef.current !== null) {
      window.clearInterval(simTimerRef.current);
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

  insertOne();
  simTimerRef.current = window.setInterval(insertOne, 60_000);

  return () => {
    if (simTimerRef.current !== null) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  };
}, [simulateOn, activeSession, userId]);


  // ---------------------------------
  // Stats (local)
  // ---------------------------------
  const stats = useMemo(() => {
    const now = Date.now();
    const within = (mins: number) => recent.filter((c) => now - new Date(c.started_at).getTime() <= mins * 60_000);
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
        setAllCons((prev) => [data as ContractionRow, ...prev]);
        setNotes('');
      }
    }
  };

  const connectDevice = async () => {
    alert('Device connection coming soon. For now, use the simulated device toggle to demo.');
  };

  // Past contraction insert
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
            session_id: null,
            source: 'manual',
            started_at: startedAt.toISOString(),
            duration_seconds: Math.round(pastDuration),
            intensity: pastIntensity === '' ? null : Number(pastIntensity),
            notes: pastNotes || null,
          },
        ])
        .select('id, started_at, duration_seconds, intensity, notes, source')
        .single();
      if (error) {
        alert(error.message);
      } else if (data) {
        setRecent((prev) => [data as ContractionRow, ...prev]);
        setAllCons((prev) => [data as ContractionRow, ...prev]);
        setPastStart('');
        setPastDuration(60);
        setPastIntensity('');
        setPastNotes('');
      }
    } finally {
      setPastSaving(false);
    }
  };

  // ---------------------------------
  // Saved chat helpers
  // ---------------------------------
  const openThread = async (tid: string) => {
    if (!userId) return;
    setCurrentThreadId(tid);
    const { data: msgs, error } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .eq('thread_id', tid)
      .order('created_at', { ascending: true });
    if (!error) {
      setChat((msgs ?? []) as ChatMessage[]);
    }
  };

  const createThread = async (title: string, folderId: string | null) => {
    if (!userId) return null;
    const { data: newThread, error } = await supabase
      .from('chat_threads')
      .insert([{ user_id: userId, folder_id: folderId, title }])
      .select('id,title,folder_id,started_at,updated_at,message_count')
      .single();
    if (error || !newThread) {
      alert(error?.message || 'Could not create thread.');
      return null;
    }
    setThreads((prev) => [newThread as ThreadRow, ...prev]);
    return newThread.id as string;
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
  // Q&A chat (persisted)
  // ---------------------------------
  const askQuestion = async () => {
    const q = qaInput.trim();
    if (!q || !userId) return;

    let threadId = currentThreadId;
    if (!threadId) {
      const title = q.length > 80 ? q.slice(0, 77) + '…' : (q.split(/\s+/).slice(0, 8).join(' ') || 'New conversation');
      threadId = await createThread(title, currentFolderId);
      if (!threadId) return;
      setCurrentThreadId(threadId);
      setChat([]); // fresh visual thread
    }

    const userMsg: ChatMessage = {
      id: 'u_' + Date.now(),
      role: 'user',
      content: q,
      created_at: new Date().toISOString(),
    };
    setChat((prev) => [...prev, userMsg]);
    setQaInput('');
    setQaError(null);
    setQaLoading(true);

    await supabase.from('chat_messages').insert([{
      thread_id: threadId,
      user_id: userId,
      role: 'user',
      content: q
    }]);

    try {
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: chat, threadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get an answer.');
      const answer = typeof data.answer === 'string' ? data.answer : JSON.stringify(data);

      await supabase.from('chat_messages').insert([{
        thread_id: threadId,
        user_id: userId,
        role: 'assistant',
        content: answer
      }]);

      const assistantMsg: ChatMessage = {
        id: 'a_' + Date.now(),
        role: 'assistant',
        content: answer,
        created_at: new Date().toISOString(),
      };
      setChat((prev) => [...prev, assistantMsg]);

      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === threadId);
        if (idx < 0) return prev;
        const copy = [...prev];
        const updated: ThreadRow = {
          ...copy[idx],
          updated_at: new Date().toISOString(),
          message_count: (copy[idx].message_count ?? 0) + 2,
        };
        copy.splice(idx, 1);
        return [updated, ...copy];
      });
    } catch (e: any) {
      setQaError(e?.message || 'Network error.');
    } finally {
      setQaLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat, qaLoading]);

  // ---------------------------------
  // Helpers: sorting + CSV + filters
  // ---------------------------------
  const toggleSort = (column: 'started_at' | 'duration_seconds' | 'intensity' | 'source') => {
    const next = {
      column,
      direction: allSort.column === column && allSort.direction === 'desc' ? 'asc' : 'desc',
    } as typeof allSort;
    setAllSort(next);
    loadAll(true);
  };

  const downloadCSV = () => {
    const header = ['id', 'started_at', 'duration_seconds', 'intensity', 'source', 'notes'];
    const rows = allCons.map((c) => [
      c.id,
      new Date(c.started_at).toISOString(),
      c.duration_seconds,
      c.intensity == null ? '' : c.intensity,
      c.source,
      c.notes == null ? '' : c.notes,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', 'contractions.csv');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFilterStart('');
    setFilterEnd('');
    setFilterSource('all');
    setFilterIntensityMin('');
    setFilterIntensityMax('');
  };

  const applyFilters = () => {
    setAllOffset(0);
    setAllHasMore(true);
    loadAll(true);
  };

  // ---------------------------------
  // Skeleton
  // ---------------------------------
  if (pageError) {
  return (
    <div className="min-h-screen bg-violet-50 p-6 max-w-screen-2xl mx-auto">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
        <div className="font-semibold">Dashboard failed to load</div>
        <div className="mt-1 text-sm break-words">{pageError}</div>
      </div>
    </div>
  );
}

  // If not loading and no user, show a friendly sign-in screen instead of the blur
if (!loading && !userId) {
  return (
    <div className="min-h-screen bg-violet-50 p-6 max-w-screen-2xl mx-auto grid place-items-center">
      <div className="rounded-xl border border-violet-200 bg-white/90 p-6 shadow-sm text-center">
        <h2 className="text-lg font-semibold text-violet-900">You’re not signed in</h2>
        <p className="mt-2 text-sm text-violet-800/80">Please sign in to view your dashboard.</p>
        <button
          onClick={() => window.location.assign('/login')}
          className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          Go to login
        </button>
      </div>
    </div>
  );
}

  
  if (loading) {
    return (
      <div className="min-h-screen bg-violet-50 p-6 space-y-6 max-w-screen-2xl mx-auto">
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

  // -------------------------------------------------
  // Render
  // -------------------------------------------------
  return (
    <div className="min-h-screen bg-violet-50 p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-violet-300 via-violet-200 to-violet-100 p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-violet-900">Dashboard</h2>
            <p className="text-sm text-violet-800/80">Track, log, and review your contractions</p>
          </div>

          <div className="flex items-center gap-3">
            {activeSession ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white shadow-sm">
                ● Session Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700">
                ○ No Active Session
              </span>
            )}

            <div className="flex items-center gap-2">
              <StatBadge label="Last 10 min" value={stats.last10Count} />
              <StatBadge label="Last 24h" value={stats.last24Count} />
              {stats.medianIntervalSec !== null ? (
                <StatBadge label="Median interval" value={Math.round(stats.medianIntervalSec / 60) + ' min'} />
              ) : null}
              {stats.medianDurationSec !== null ? (
                <StatBadge label="Median duration" value={stats.medianDurationSec + ' s'} />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Row 1: Controls (L) + Right column (Saved + Chat) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Left controls */}
        <div className="space-y-6 md:col-span-4">
          {/* Start a session */}
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

                {isTiming ? (
                  <span className="font-mono text-sm tabular-nums text-violet-900" aria-live="polite">
                    {formatClock(elapsed)}
                  </span>
                ) : null}

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
                <Input type="datetime-local" value={pastStart} onChange={(e) => setPastStart(e.target.value)} className="mt-1" />
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
        </div>

        {/* Right: Saved chats (top) + Chat (bottom) */}
        <div className="space-y-6 md:col-span-8">
          {/* Saved chats panel (compact + collapsible) */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Saved chats</SectionTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setSavedOpen((v) => !v)}>
                  {savedOpen ? 'Hide' : 'Show'}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!userId) return;
                    const name = prompt('Folder name');
                    if (!name) return;
                    const { data, error } = await supabase
                      .from('chat_folders')
                      .insert([{ user_id: userId, name }])
                      .select('id,name,created_at')
                      .single();
                    if (!error && data) setFolders((p) => [...p, data as FolderRow]);
                  }}
                >
                  + Folder
                </Button>
                <Button
                  onClick={async () => {
                    const title = 'New conversation';
                    const tid = await createThread(title, currentFolderId);
                    if (tid) {
                      setCurrentThreadId(tid);
                      setChat([]);
                    }
                  }}
                >
                  + New chat
                </Button>
              </div>
            </div>

            {savedOpen && (
              <div className="space-y-3">
                {/* Filter row */}
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="flex items-center gap-2">
                    <span className="text-violet-900/80">Folder</span>
                    <select
                      value={currentFolderId ?? ''}
                      onChange={(e) => setCurrentFolderId(e.target.value || null)}
                      className="w-48 rounded-xl border border-violet-200 p-2 text-sm focus:ring-2 focus:ring-violet-400"
                    >
                      <option value="">All</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Label>

                  {currentThreadId && (
                    <>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const newTitle = prompt('Thread title');
                          if (!newTitle) return;
                          await supabase.from('chat_threads').update({ title: newTitle }).eq('id', currentThreadId);
                          setThreads((prev) => prev.map((t) => (t.id === currentThreadId ? { ...t, title: newTitle } : t)));
                        }}
                      >
                        Rename thread
                      </Button>

                      <Button
                        variant="outline"
                        onClick={async () => {
                          if (folders.length === 0) {
                            alert('No folders yet. Create one first.');
                            return;
                          }
                          const choice = prompt(
                            'Move to folder (exact name). Leave blank for Unfiled:\n' + folders.map((x) => `• ${x.name}`).join('\n')
                          );
                          if (choice === null) return;
                          const dest = folders.find((x) => x.name === choice);
                          await supabase.from('chat_threads').update({ folder_id: dest?.id ?? null }).eq('id', currentThreadId);
                          setThreads((prev) =>
                            prev.map((t) => (t.id === currentThreadId ? { ...t, folder_id: dest?.id ?? null } : t))
                          );
                        }}
                      >
                        Move thread
                      </Button>

                      <Button
                        variant="danger"
                        onClick={async () => {
                          if (!confirm('Delete this thread?')) return;
                          await supabase.from('chat_threads').delete().eq('id', currentThreadId);
                          setThreads((prev) => prev.filter((t) => t.id !== currentThreadId));
                          setCurrentThreadId(null);
                          setChat([]);
                        }}
                      >
                        Delete thread
                      </Button>
                    </>
                  )}
                </div>

                {/* Threads list (compact, scrollable) */}
                <div className="max-h-56 overflow-y-auto rounded-md border border-violet-100 bg-white/70">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white text-violet-800">
                      <tr>
                        <th className="px-3 py-2">Title</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Msgs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-violet-100">
                      {threads
                        .filter((t) => (currentFolderId ? t.folder_id === currentFolderId : true))
                        .map((t) => (
                          <tr
                            key={t.id}
                            className={`hover:bg-violet-50/60 ${currentThreadId === t.id ? 'bg-violet-50' : ''} cursor-pointer`}
                            onClick={() => openThread(t.id)}
                          >
                            <td className="px-3 py-2">
                              <div className="truncate">{t.title}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-violet-700/80">
                              {new Date(t.started_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2">{t.message_count}</td>
                          </tr>
                        ))}
                      {threads.filter((t) => (currentFolderId ? t.folder_id === currentFolderId : true)).length === 0 && (
                        <tr>
                          <td className="px-3 py-3 text-violet-700" colSpan={3}>
                            No threads yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>

          {/* Chat box */}
          <Card className="flex min-h-[60vh] flex-col md:h-[calc(100vh-240px)]">
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle>
                Ask a question {currentThreadId ? <span className="text-violet-500">• saved</span> : <span className="text-violet-400">• unsaved</span>}
              </SectionTitle>
              {chat.length > 0 ? (
                <button
                  onClick={() => setChat([])}
                  className="text-xs text-violet-700 underline underline-offset-2 hover:text-violet-900"
                  title="Clears visible messages (does not delete saved history)"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto rounded-lg border border-violet-100 bg-violet-50/50 p-3"
              aria-live="polite"
              aria-label="Conversation"
            >
              {chat.length === 0 ? (
                <div className="grid h-full place-items-center text-center text-sm text-violet-700/80">
                  <div>
                    <p className="font-medium text-violet-800">Start the conversation</p>
                    <p className="mt-1">Examples: "What do early contractions feel like?", "How do I time them?"</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {chat.map((m) => (
                    <ChatBubble key={m.id} message={m} />
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                askQuestion();
              }}
              className="mt-3 flex items-end gap-2"
            >
              <TextArea
                value={qaInput}
                onChange={(e) => setQaInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                rows={1}
                placeholder="Ask a non-diagnostic pregnancy question… (Shift+Enter for newline)"
                className="flex-1 resize-none"
                disabled={qaLoading}
              />
              <Button type="submit" disabled={qaLoading || !qaInput.trim()} ariaBusy={qaLoading}>
                {qaLoading ? 'Thinking…' : 'Ask'}
              </Button>
            </form>

            {qaError ? <p className="mt-2 text-sm text-red-600">{qaError}</p> : null}
            <p className="mt-2 text-xs text-violet-900/60">
              Educational only; not a medical device. If you're concerned, contact your clinician or go to L&amp;D.
            </p>
          </Card>
        </div>
      </div>

      {/* Row 2: Insights (L) + Recent 24h (R) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="md:col-span-4">
          <Card>
            <SectionTitle className="mb-2">Insights (local)</SectionTitle>
            <p className="text-sm text-violet-900/80">
              Last 10 min: <strong className="text-violet-900">{stats.last10Count}</strong> · Last 24h:{' '}
              <strong className="text-violet-900">{stats.last24Count}</strong>
              {stats.medianIntervalSec !== null ? (
                <span> · Median interval: <strong className="text-violet-900">{Math.round(stats.medianIntervalSec / 60)} min</strong></span>
              ) : null}
              {stats.medianDurationSec !== null ? (
                <span> · Median duration: <strong className="text-violet-900">{stats.medianDurationSec} s</strong></span>
              ) : null}
            </p>

            <Button onClick={summarizeDay} disabled={aiLoading} ariaBusy={aiLoading} className="mt-3">
              {aiLoading ? 'Summarizing…' : 'Summarize my day'}
            </Button>

            {aiError ? <p className="mt-2 text-sm text-red-600">{aiError}</p> : null}
            {summary ? <p className="mt-3 text-sm leading-6 text-violet-900">{summary}</p> : null}

            <p className="mt-2 text-xs text-violet-900/60">
              Educational only; not a medical device. If you're concerned, contact your clinician or go to L&amp;D.
            </p>
          </Card>
        </div>

        <div className="md:col-span-8">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle>Recent (24h)</SectionTitle>
              <span className="text-xs text-violet-700">{recent.length} entries</span>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-violet-900/70">No contractions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-3 pr-2">
                  {recent.map((c) => (
                    <div key={c.id} className="min-w-[220px] rounded-lg border border-violet-200 bg-white/80 p-3 text-sm shadow-sm">
                      <div className="font-mono tabular-nums text-violet-900">{toLocalString(c.started_at)}</div>
                      <div className="mt-1 text-violet-800">
                        {c.duration_seconds}s{c.intensity ? ' · intensity ' + c.intensity : ''} · {c.source}
                      </div>
                      {c.notes ? <div className="mt-1 text-xs text-violet-700/80">{c.notes}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Row 3: Full-width data log */}
      <div className="grid grid-cols-1">
        <Card>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionTitle>All contractions (log)</SectionTitle>
              <p className="mt-1 text-xs text-violet-800/70">Click a column to sort. Export downloads currently loaded rows.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={downloadCSV}>Export CSV</Button>
              <Button variant="outline" onClick={() => loadAll(true)} disabled={allLoading} ariaBusy={allLoading}>
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-3 grid gap-2 md:grid-cols-5">
            <Label>
              <span className="text-violet-900/80">Start (from)</span>
              <Input type="datetime-local" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="mt-1" />
            </Label>
            <Label>
              <span className="text-violet-900/80">End (to)</span>
              <Input type="datetime-local" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="mt-1" />
            </Label>
            <Label>
              <span className="text-violet-900/80">Source</span>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value as SourceFilter)}
                className="mt-1 w-full rounded-xl border border-violet-200 p-2 text-sm focus:ring-2 focus:ring-violet-400"
              >
                <option value="all">All</option>
                <option value="manual">Manual</option>
                <option value="device">Device</option>
              </select>
            </Label>
            <Label>
              <span className="text-violet-900/80">Intensity min</span>
              <Input
                type="number"
                min={1}
                max={10}
                value={filterIntensityMin}
                onChange={(e) => setFilterIntensityMin(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1"
              />
            </Label>
            <Label>
              <span className="text-violet-900/80">Intensity max</span>
              <Input
                type="number"
                min={1}
                max={10}
                value={filterIntensityMax}
                onChange={(e) => setFilterIntensityMax(e.target.value === '' ? '' : Number(e.target.value))}
                className="mt-1"
              />
            </Label>

            <div className="md:col-span-5 flex items-center gap-2">
              <Button onClick={applyFilters} disabled={allLoading} ariaBusy={allLoading}>Apply filters</Button>
              <Button variant="ghost" onClick={() => { clearFilters(); loadAll(true); }}>Clear</Button>
            </div>
          </div>

          {allError ? <p className="mb-2 text-sm text-red-600">{allError}</p> : null}

          <div className="max-h-[60vh] overflow-auto rounded-md border border-violet-100">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-violet-800">
                <tr>
                  <Th onClick={() => toggleSort('started_at')} label="Date & time" active={allSort.column==='started_at'} dir={allSort.direction} />
                  <Th onClick={() => toggleSort('duration_seconds')} label="Duration (s)" active={allSort.column==='duration_seconds'} dir={allSort.direction} />
                  <Th onClick={() => toggleSort('intensity')} label="Intensity" active={allSort.column==='intensity'} dir={allSort.direction} />
                  <Th onClick={() => toggleSort('source')} label="Source" active={allSort.column==='source'} dir={allSort.direction} />
                  <th className="px-3 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-100">
                {allCons.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-violet-700" colSpan={5}>
                      No contractions logged yet.
                    </td>
                  </tr>
                ) : (
                  allCons.map((c) => (
                    <tr key={c.id} className="hover:bg-violet-50/40">
                      <td className="px-3 py-2 font-mono tabular-nums text-violet-900">{toLocalString(c.started_at)}</td>
                      <td className="px-3 py-2">{c.duration_seconds}</td>
                      <td className="px-3 py-2">{c.intensity == null ? '—' : c.intensity}</td>
                      <td className="px-3 py-2 capitalize">{c.source}</td>
                      <td className="px-3 py-2 text-violet-900/90">{c.notes == null ? '—' : c.notes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button onClick={() => loadAll(false)} disabled={!allHasMore || allLoading} ariaBusy={allLoading}>
              {allLoading ? 'Loading…' : allHasMore ? 'Load more' : 'All loaded'}
            </Button>
          </div>

          <p className="mt-2 text-xs text-violet-900/60">
            Educational only; not a medical device. If you're concerned, contact your clinician or go to L&amp;D.
          </p>
        </Card>
      </div>
    </div>
  );
}