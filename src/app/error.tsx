'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const noProject = error.message === 'NO_PROJECT';
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6">
      <h1 className="text-lg font-semibold">{noProject ? 'No project selected' : 'Something went wrong'}</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
        {noProject
          ? 'LaunchOS works per project. Create one, then come back to this page.'
          : error.message}
      </p>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" onClick={reset}>Try again</button>
        <a className="btn" href={noProject ? '/projects/new' : '/'}>{noProject ? 'Create a project' : 'Command Center'}</a>
      </div>
    </div>
  );
}
