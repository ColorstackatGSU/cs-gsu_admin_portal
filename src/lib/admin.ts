export type Tier = { id: string; name: string; amountCents: number };
export type Sponsor = { id: string; name: string; slug: string; brandHex: string | null; tierId: string | null; tierName: string | null; websiteUrl: string | null; status: 'active' | 'prospective' | 'lapsed' };
export type Contact = { id: string; sponsorId: string; email: string; fullName: string | null; title: string | null; role: 'primary' | 'billing' | 'viewer'; activated: boolean };
export type SponsorDetail = { sponsor: Sponsor; contacts: Contact[] };
export type Invoice = { id: string; sponsorId: string; sponsorName: string; tierId: string | null; tierName: string | null; amountCents: number; title: string; zeffyInvoiceId: string | null; status: 'draft'|'issued'|'processing'|'paid'|'void'; issuedAt: string|null; dueAt: string|null; paidAt: string|null };
export type Unmatched = { id: string; zeffyPaymentId: string; amountCents: number; currency: string|null; buyerEmail: string|null; buyerCompany: string|null; receivedAt: string };
export function errorMessage(error: unknown): string { if (error && typeof error === 'object' && 'body' in error) { const body=(error as {body:unknown}).body; if(body&&typeof body==='object'&&'detail'in body)return String((body as {detail:unknown}).detail); } return error instanceof Error?error.message:'Something went wrong.'; }
