import './globals.css';
import Shell from '@/components/Shell';
import { getSession } from '@/lib/auth';

export const metadata = { title: 'MedGraph', description: 'Clinical records with semantic case search' };

export default async function RootLayout({ children }) {
  const s = await getSession();
  const user = s ? { id: s.sub, role: s.role, name: s.name } : null;
  return (
    <html lang="en">
      <body>
        <Shell user={user}>{children}</Shell>
      </body>
    </html>
  );
}
