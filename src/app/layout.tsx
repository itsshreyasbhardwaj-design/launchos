import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Shell } from '@/components/shell';
import { activeProject, allProjects } from '@/lib/session';
import { presetOf } from '@/core/presets';

export const metadata: Metadata = {
  title: { default: 'LaunchOS', template: '%s — LaunchOS' },
  description: 'Free, open-source post-launch growth, SEO, GEO and distribution operating system. Build it. Launch it. Get discovered.',
  applicationName: 'LaunchOS',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const projects = await allProjects();
  const active = await activeProject();
  const modules = active ? presetOf(active.preset).modules : [];

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before paint so the page never flashes. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('launchos-theme');if(t&&t!=='system')document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Shell
          modules={modules}
          projects={projects.map((p) => ({ id: p.id, name: p.name, preset: p.preset }))}
          activeId={active?.id ?? null}
          activeName={active?.name ?? null}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
