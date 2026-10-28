import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Field, Note, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { generateReportAction } from '@/app/actions';
import { buildReport, reportToMarkdown, listReports } from '@/core/services/reports';

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const { period } = await searchParams;
  const p = (period === 'daily' || period === 'monthly' ? period : 'weekly') as 'weekly';
  const report = buildReport(d, project.id, p);
  const saved = listReports(d, project.id);

  return (
    <>
      <PageHeader
        title="Growth reports"
        lede="Assembled from stored rows only. Missing data is reported as missing, never rendered as a zero."
        actions={
          <nav className="flex gap-2">
            {(['daily', 'weekly', 'monthly'] as const).map((x) => (
              <a key={x} href={`/reports?period=${x}`} className={`btn ${x === p ? 'btn-primary' : ''}`}>{x}</a>
            ))}
          </nav>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title={`${p} report`} subtitle={report.ok ? `Generated ${report.value.generatedAt.slice(0, 16).replace('T', ' ')} UTC` : undefined}>
          {report.ok
            ? <pre className="code max-h-[36rem] overflow-y-auto whitespace-pre-wrap">{reportToMarkdown(report.value)}</pre>
            : <p className="text-sm">{report.error}</p>}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Save a copy">
            <ActionForm action={generateReportAction} submitLabel="Generate and save">
              <Field label="Period">
                <select className="select" name="period" defaultValue={p}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
            </ActionForm>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
              Markdown, CSV, JSON and PDF export are all available from the CLI:
              <code className="ml-1">launchos report --format pdf --out report.pdf</code>
            </p>
          </Card>

          <Card title={`Saved reports (${saved.length})`}>
            {saved.length ? (
              <Table head={['Generated', 'Period', 'Format']}>
                {saved.map((s) => (
                  <tr key={String(s.id)}>
                    <td className="whitespace-nowrap text-xs">{String(s.generated_at).slice(0, 16).replace('T', ' ')}</td>
                    <td>{String(s.period)}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{String(s.format)}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty title="None saved" body="Generate one to keep a dated snapshot." />}
          </Card>

          {report.ok && (
            <Card title="What this report does not claim">
              <ul className="flex flex-col gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                {report.value.unverified.map((u) => <li key={u}>• {u}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
