/**
 * "Verified on Discord", wherever a member's Discord handle is shown.
 *
 * The distinction it draws is the one that matters: `discordUsername` is what the member
 * typed into a form, and anybody can type anything. `discordVerifiedAt` is set only when
 * somebody clicked Verify from that Discord account and it matched — which is the whole
 * point of the button. A handle with no badge next to it is a claim, not a fact.
 *
 * Never colour alone: the badge always carries the word, so it survives colour blindness
 * and a greyscale print.
 */
export default function VerifiedBadge({ verifiedAt }: { verifiedAt: string | null }) {
  if (!verifiedAt) return null;
  return (
    <span
      className="verified-badge"
      title={`Verified on Discord ${new Date(verifiedAt).toLocaleString()}`}
    >
      <CheckMark />
      Verified
    </span>
  );
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12.5l5.5 5.5L20 6" />
    </svg>
  );
}
