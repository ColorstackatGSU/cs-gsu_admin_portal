import { useId, type ReactNode } from 'react';

/**
 * The form primitives every admin page shares. These used to be exported from
 * pages/Sponsors.tsx, which meant the invoice form imported the sponsor page to
 * draw a text box. They live here now.
 *
 * Three things every field here does that the old ones did not:
 *
 *   1. Says whether it is required or optional in the label, as a word. The
 *      backend rejects a missing sponsorId or tierId with a 400 that names a
 *      Java field, so the form has to be honest up front about what it needs.
 *   2. Wires label, input, hint and error together with ids and
 *      aria-describedby, so a screen reader reads the requirement and the
 *      failure, not just the label.
 *   3. Shows its own error inline, next to the field that caused it, instead of
 *      pushing everything into one banner at the top of the page.
 */

interface BaseProps {
  label: string;
  /** Shown under the field in muted text. Say what the value is for. */
  hint?: string;
  /** Set when the value is wrong. Turns the field red and prints the reason. */
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  /** Spans both columns of a .form-grid. For long values like a title. */
  wide?: boolean;
}

interface FieldProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  /** Monospace, for IDs, slugs and hex codes that get compared by eye. */
  mono?: boolean;
  maxLength?: number;
  min?: string;
  autoComplete?: string;
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  error,
  required = false,
  disabled = false,
  wide = false,
  placeholder,
  mono = false,
  maxLength,
  min,
  autoComplete,
}: FieldProps) {
  const id = useId();
  const described = [hint ? `${id}-hint` : null, error ? `${id}-err` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wide ? 'field field-wide' : 'field'}>
      <label className="label" htmlFor={id}>
        {label}
        {required ? <span className="label-req">Required</span> : <span className="label-opt">Optional</span>}
      </label>
      <input
        id={id}
        className={`input${mono ? ' input-mono' : ''}${error ? ' input-bad' : ''}`}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        min={min}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
      />
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}

export function Select({
  label,
  value,
  onChange,
  children,
  hint,
  error,
  required = false,
  disabled = false,
  wide = false,
}: SelectProps) {
  const id = useId();
  const described = [hint ? `${id}-hint` : null, error ? `${id}-err` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wide ? 'field field-wide' : 'field'}>
      <label className="label" htmlFor={id}>
        {label}
        {required ? <span className="label-req">Required</span> : <span className="label-opt">Optional</span>}
      </label>
      <select
        id={id}
        className={`input${error ? ' input-bad' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
      >
        {children}
      </select>
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A page-level error. Always role="alert" so it is announced when it appears:
 * these are almost always the result of an action the officer just took, and
 * silently rendering the reason above the fold is not enough.
 */
export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="note note-error" style={{ marginBottom: 22 }} role="alert">
      {message}
    </div>
  );
}

/** Confirmation of something that just worked. Fades nothing, waits for the
 *  next action to clear it. */
export function OkNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="note note-ok" style={{ marginBottom: 22 }} role="status">
      {message}
    </div>
  );
}

/** The standard "nothing here yet" block, with the action that changes that. */
export function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      <p className="empty-body">{body}</p>
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}

/** One consistent loading line, so every page waits the same way. */
export function Loading({ what }: { what: string }) {
  return (
    <div className="card-pad">
      <p className="page-sub" style={{ marginTop: 0 }} role="status">
        Loading {what}…
      </p>
    </div>
  );
}
