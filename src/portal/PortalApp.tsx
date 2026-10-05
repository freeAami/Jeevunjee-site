import { useEffect, useMemo, useState } from 'react';
import { supabaseConfigured } from '../lib/supabase';
import { createLiveApi, friendlyError, type PortalApi, type Session } from './api';
import { createDemoApi, resetDemo } from './demo';
import { Applications, ApplicationView } from './admin/Applications';
import { OverviewPage } from './admin/Overview';
import { StudentFile } from './admin/StudentFile';
import { StudentsPage } from './admin/Students';
import { Login, SetNewPassword } from './Login';
import { Button, Loading, PortalContext, navigateTo } from './ui';
import type { Profile } from './types';
import './portal.css';

export default function PortalApp({ route }: { route: string }) {
  const api = useMemo<PortalApi>(() => (supabaseConfigured ? createLiveApi() : createDemoApi()), []);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const s = await api.getSession();
        const p = s ? await api.getProfile() : null;
        if (!live) return;
        setSession(s);
        setProfile(p);
        setError('');
      } catch (e) {
        if (live) {
          setError(friendlyError(e));
          setSession(null);
        }
      }
    };
    load();
    const off = api.onAuthChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) load();
    });
    return () => {
      live = false;
      off();
    };
  }, [api]);

  useEffect(() => {
    document.title = 'Trustee portal · Jeevunjee';
    return () => {
      document.title = 'Jeevunjee Family Scholarship';
    };
  }, []);

  const banner = api.mode === 'demo' && (
    <div className="pdemo" role="note">
      <strong>Preview mode</strong> — fictional sample data, saved only in this browser. The real portal switches on once
      Supabase is connected.
      <button type="button" onClick={() => { resetDemo(); location.reload(); }}>Reset sample data</button>
    </div>
  );

  if (session === undefined) return <div className="portal">{banner}<Loading /></div>;

  if (recovering && session) {
    return (
      <div className="portal">
        <SetNewPassword api={api} onDone={() => setRecovering(false)} />
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="portal">
        {banner}
        <Login api={api} signedInWithoutProfile={!!session && !profile} startupError={error} />
      </div>
    );
  }

  const ctx = { api, profile, email: session.email, navigate: navigateTo };
  const parts = route.split('?')[0].split('/').filter(Boolean); // e.g. ['students', '<id>']
  const isAdmin = profile.role === 'admin';

  let page;
  if (!isAdmin) {
    page = profile.student_id ? <StudentFile studentId={profile.student_id} /> : <p>Your login isn’t linked to a student file yet.</p>;
  } else if (parts[0] === 'students' && parts[1]) page = <StudentFile studentId={parts[1]} key={parts[1]} />;
  else if (parts[0] === 'students') page = <StudentsPage />;
  else if (parts[0] === 'applications' && parts[1]) page = <ApplicationView id={parts[1]} key={parts[1]} />;
  else if (parts[0] === 'applications') page = <Applications />;
  else page = <OverviewPage />;

  const nav = isAdmin
    ? [
        { href: '#/portal', label: 'Overview', active: !parts[0] },
        { href: '#/portal/students', label: 'Students', active: parts[0] === 'students' },
        { href: '#/portal/applications', label: 'Applications', active: parts[0] === 'applications' },
      ]
    : [{ href: '#/portal', label: 'My file', active: true }];

  return (
    <PortalContext.Provider value={ctx}>
      <div className="portal">
        {banner}
        <div className="pshell">
          <aside className="pside">
            <a className="pbrand" href="#/portal">
              Jeevunjee<span>{isAdmin ? 'Trustees' : 'Student portal'}</span>
            </a>
            <nav aria-label="Portal">
              {nav.map((n) => (
                <a key={n.href} href={n.href} aria-current={n.active ? 'page' : undefined}>{n.label}</a>
              ))}
            </nav>
            <div className="pside-foot">
              <span className="pwho" title={session.email}>{profile.full_name || session.email}</span>
              <Button small variant="quiet" onClick={() => api.signOut()}>Sign out</Button>
              <a href="#top" className="back">← Public site</a>
            </div>
          </aside>
          <main className="pmain" id="main">{page}</main>
        </div>
      </div>
    </PortalContext.Provider>
  );
}
