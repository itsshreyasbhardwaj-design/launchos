'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import type { ActionState } from '@/app/actions';

function Pending({ label, variant }: { label: string; variant: 'primary' | 'ghost' | 'plain' }) {
  const { pending } = useFormStatus();
  const cls = variant === 'primary' ? 'btn btn-primary' : variant === 'ghost' ? 'btn btn-ghost' : 'btn';
  return (
    <button type="submit" className={cls} disabled={pending} aria-busy={pending}>
      {pending ? 'Working…' : label}
    </button>
  );
}

/**
 * Wraps a server action so every control reports what actually happened.
 *
 * Refusals from the core are surfaced verbatim: when an approval gate blocks a
 * listing, the operator sees the reason rather than a generic error.
 */
export function ActionForm({
  action, submitLabel, children, variant = 'primary', className = '', resetOnSuccess = false,
}: {
  action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: ReactNode;
  variant?: 'primary' | 'ghost' | 'plain';
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={`flex flex-col gap-3 ${className}`}
      key={resetOnSuccess && state?.ok ? String(state.message) : 'form'}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Pending label={submitLabel} variant={variant} />
        {state && (
          <output
            className="text-[0.8125rem] leading-snug"
            style={{ color: state.ok ? 'var(--accent)' : '#e11d48' }}
          >
            <span className="font-semibold">{state.ok ? '✓' : '✕'}</span>{' '}
            <span className="break-words">{state.message}</span>
          </output>
        )}
      </div>
      {state?.detail && (
        <p className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>{state.detail}</p>
      )}
    </form>
  );
}

/** A one-click action with no inputs. */
export function ActionButton({
  action, label, variant = 'primary',
}: { action: (prev: ActionState | null, formData: FormData) => Promise<ActionState>; label: string; variant?: 'primary' | 'ghost' | 'plain' }) {
  return <ActionForm action={action} submitLabel={label} variant={variant} />;
}
