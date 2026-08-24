/**
 * Chapter details that appear in the sidebar and the auth footer. One place,
 * mirroring cs-gsu_sponsor_portal/src/data/org.ts so the two apps never drift
 * on the address a sponsor is told to write to.
 */
export const ORG = {
  legalName: 'ColorStack at Georgia State University',
  displayName: 'ColorStack at GSU',
  email: 'official@colorstackatgsu.com',
  billingEmail: 'official@colorstackatgsu.com',
  site: 'https://colorstackatgsu.com',
  /** Where the people using this portal go when the portal itself is wrong. */
  sponsorPortal: 'https://sponsors.colorstackatgsu.com',
} as const;
