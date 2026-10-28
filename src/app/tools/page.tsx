import { database } from '@/lib/session';
import { PageHeader } from '@/components/page-header';
import { Card, Table, Badge, Note } from '@/components/ui';
import { listTools } from '@/core/services/registry';
import { TOOL_CATEGORIES } from '@/core/data/tools';

export const metadata = { title: 'Free tool registry' };

export default async function ToolsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const tools = listTools(database(), category);

  return (
    <>
      <PageHeader
        title="Free marketing tool registry"
        lede="Tools that are genuinely free for the capability named, and freemium ones with the limit spelled out."
        actions={
          <nav className="flex flex-wrap gap-1.5">
            <a className={`btn ${!category ? 'btn-primary' : ''}`} href="/tools">all</a>
            {TOOL_CATEGORIES.map((c) => (
              <a key={c} className={`btn ${category === c ? 'btn-primary' : ''}`} href={`/tools?category=${c}`}>{c.replace(/_/g, ' ')}</a>
            ))}
          </nav>
        }
      />
      <Note warn>
        A freemium product is never described as free. Where the capability you need sits behind a paid tier, the limit
        is stated. Pricing changes, so these rows are seed data with no verification date until someone checks them.
      </Note>
      <div className="mt-4">
        <Card>
          <Table head={['Tool', 'Capability', 'Pricing', 'Free limits', 'Account', 'Privacy']}>
            {tools.map((t) => (
              <tr key={t.id}>
                <td><a className="link font-medium" href={t.url} target="_blank" rel="noreferrer noopener">{t.name}</a>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{t.category.replace(/_/g, ' ')}</p></td>
                <td className="max-w-[18rem]">{t.capability}</td>
                <td><Badge kind={t.pricing === 'free' || t.pricing === 'open_source' ? 'free' : t.pricing === 'paid' ? 'fail' : 'unknown'}>{t.pricing.replace(/_/g, ' ')}</Badge></td>
                <td className="max-w-[16rem] text-xs" style={{ color: 'var(--text-dim)' }}>{t.freeLimits ?? '—'}</td>
                <td className="text-xs">{t.accountRequired ? 'required' : 'none'}</td>
                <td className="max-w-[16rem] text-xs" style={{ color: 'var(--text-dim)' }}>{t.privacyNote ?? '—'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
