import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
        That page or record does not exist.
      </p>
      <Link className="btn btn-primary mt-4" href="/">Back to the Command Center</Link>
    </div>
  );
}
