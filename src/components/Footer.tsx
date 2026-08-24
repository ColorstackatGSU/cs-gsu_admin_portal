import { ORG } from '../data/org';

/**
 * Only used on auth pages. Signed-in pages carry identity and sign-out in the
 * sidebar, so a page footer there would be redundant chrome.
 */
export default function Footer() {
  return (
    <footer className="auth-foot">
      {ORG.legalName} &middot;{' '}
      <a href={`mailto:${ORG.billingEmail}`}>{ORG.billingEmail}</a>
    </footer>
  );
}
