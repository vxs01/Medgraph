'use client';
import { createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';

const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

const LINKS = [
  { href: '/', label: 'Dashboard', roles: ['DOCTOR', 'ADMIN'] },
  { href: '/patients', label: 'Patients', roles: ['DOCTOR', 'ADMIN'] },
  { href: '/admissions', label: 'Admissions', roles: ['DOCTOR', 'ADMIN'] },
  { href: '/notes', label: 'Clinical notes', roles: ['DOCTOR'] },
  { href: '/search', label: 'Similar cases', roles: ['DOCTOR'] },
  { href: '/prescriptions', label: 'Prescriptions', roles: ['DOCTOR'] },
  { href: '/medications', label: 'Medications', roles: ['DOCTOR', 'ADMIN'] },
  { href: '/audit', label: 'Audit log', roles: ['ADMIN'] },
];

export default function Shell({ user, children }) {
  const pathname = usePathname();
  if (!user || pathname === '/login') return <UserContext.Provider value={user}>{children}</UserContext.Provider>;

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }
  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <UserContext.Provider value={user}>
      <div className="app">
        <aside className="side">
          <div className="brand">MedGraph</div>
          <nav aria-label="Main">
            {LINKS.filter((l) => l.roles.includes(user.role)).map((l) => (
              <Link key={l.href} href={l.href} className={isActive(l.href) ? 'active' : ''}>{l.label}</Link>
            ))}
          </nav>
          <div className="who">
            <div className="who-name">{user.name}</div>
            <div className="who-role">{user.role === 'ADMIN' ? 'Administrator' : 'Doctor'}</div>
            <button className="btn ghost" onClick={signOut}>Sign out</button>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </UserContext.Provider>
  );
}
