/**
 * The confirmation step for an action that cannot be taken back.
 *
 * In the page, not window.confirm. The native dialog is one run-on line of grey system text
 * with an OK button: it cannot show a list, cannot say which of two things is about to
 * happen, and looks the same whether an officer is dismissing a payment or emailing two
 * hundred members. The consequences are the part worth reading, so they are set as a list in
 * the page's own type, next to the thing being acted on.
 *
 * Deliberately not a modal. A modal needs a portal, focus trapping and an escape key to be
 * anything but worse than what it replaced, and nothing here needs to interrupt the page:
 * the officer pressed a button and the answer appears under it.
 *
 * @param question  What is about to happen, as a question. "Void invoice 41?"
 * @param points    One consequence each, in the order somebody would ask them. Keep them
 *                  concrete: who gets emailed, what stops working, what cannot be undone.
 * @param confirmLabel  The verb, matching the question. Never "OK".
 */
export default function Confirm({
  question,
  points,
  confirmLabel,
  busy = false,
  busyLabel = 'Working…',
  danger = false,
  problem = null,
  onConfirm,
  onCancel,
  style,
}: {
  question: string;
  points: React.ReactNode[];
  confirmLabel: string;
  busy?: boolean;
  busyLabel?: string;
  /** Red confirm button, for the ones that destroy something rather than send something. */
  danger?: boolean;
  /** Shown above the buttons when the action failed, so the officer can read it and retry. */
  problem?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="note note-warn" style={{ maxWidth: 480, ...style }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{question}</p>
      {points.length > 0 && (
        <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
          {points.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      )}
      {problem && <div className="field-error" style={{ marginBottom: 8 }}>{problem}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={busy}
          autoFocus
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
