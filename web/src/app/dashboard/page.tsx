'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        router.replace('/login');
        return;
      }
      if (mounted) {
        setEmail(session.user.email ?? null);
        setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  if (checking) return <p style={{ padding: 16 }}>Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      <p className="text-gray-700">Welcome{email ? `, ${email}` : ''}.</p>

      <a
        href="#"
        onClick={async (e) => {
          e.preventDefault();
          await supabase.auth.signOut();
          router.replace('/login');
        }}
        className="underline text-sm"
      >
        Log out
      </a>

      <div className="rounded-xl border p-4 bg-white mt-4">
        <p className="text-sm text-gray-600">
          Coming soon: Start Session, Add Contraction, Insights, and AI Q&A.
        </p>
      </div>
    </div>
  );
}
