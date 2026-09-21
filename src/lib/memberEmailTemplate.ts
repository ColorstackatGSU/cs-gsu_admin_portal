/**
 * The HTML every bulk member email is sent as.
 *
 * Lives apart from the composer that calls it because it is not UI: it is the
 * one artefact of this portal that gets rendered by somebody else's software,
 * under rules that have nothing to do with the rest of the app. Keeping it in
 * its own module also means it can be rendered and looked at without mounting
 * the page.
 */

/**
 * The chapter's identity in the template, in one place rather than inlined into
 * the markup three times over.
 */
const CHAPTER = {
  name: 'ColorStack at Georgia State University',
  short: 'ColorStack at GSU',
  site: 'https://colorstackatgsu.com',
  email: 'official@colorstackatgsu.com',
  logo: 'https://sponsors.colorstackatgsu.com/images/colorstack-gsu-logo.png',
};

/** GSU blue, and the two greys the rest of the portal already uses. */
const BRAND = '#0039A6';
const INK = '#091024';
const MUTED = '#5b6478';

/**
 * Gill Sans, as far as each client can get to it.
 *
 * No webfont, deliberately. Only Apple Mail honours @font-face, and Apple Mail is
 * the one client that already has the real thing: Gill Sans ships with macOS and
 * iOS. Loading a substitute over the top would replace a genuine Gill Sans with
 * an approximation for about half of all opens, to serve the clients that would
 * drop the @import anyway.
 *
 * So the stack is a ladder of what is already installed:
 *
 *   Gill Sans MT   Windows with Microsoft Office, which is most of them
 *   Gill Sans      macOS and iOS
 *   Calibri        Windows without Office. Humanist, so the closest relative
 *                  the machine already has
 *   Trebuchet MS   the oldest cross-platform humanist fallback
 *   Helvetica      macOS, if everything above somehow missed
 *   Arial          everywhere else, including Android, where the generic
 *                  sans-serif resolves to Roboto
 *
 * Every step is a humanist or neo-grotesque sans, so a reader who lands on the
 * fallback gets a different face at the same proportions rather than a serif
 * where a sans was drawn.
 */
const FONT =
  "'Gill Sans MT','Gill Sans',Calibri,'Trebuchet MS',Helvetica,Arial,sans-serif";

/**
 * Gives the officer's markup an explicit style for every tag the editor can
 * produce.
 *
 * This is the part that was actually broken. The body arrives from a
 * contenteditable, so it is bare p, h2, ul and a with no styling at all, and a
 * mail client renders bare tags at its own defaults. Those defaults disagree:
 * Outlook gives a paragraph a full blank line above and below, Apple Mail gives
 * it none, and a heading comes out anywhere between 18px and 28px depending on
 * who is reading. A message that looked right in the composer arrived with its
 * spacing collapsed or its headings the size of the header, and there was
 * nothing the officer could do about it from inside the editor.
 *
 * An inline style attribute is the only fix that holds everywhere. It beats the
 * client default, and it survives the clients that strip the style block.
 * mso-line-height-rule is there because Word's engine otherwise rounds
 * line-height up and leaves the text sitting low in its row.
 *
 * Tags the editor cannot produce are left alone rather than guessed at.
 */
function inlineBodyStyles(html: string): string {
  const base =
    'mso-line-height-rule:exactly;font-family:' + FONT + ';color:' + INK + ';font-size:16px;line-height:1.6;';
  const styles: Record<string, string> = {
    p: 'margin:0 0 16px;' + base,
    h2: 'margin:28px 0 12px;' + base + 'font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;',
    h3: 'margin:24px 0 10px;' + base + 'font-size:18px;line-height:1.35;font-weight:700;',
    ul: 'margin:0 0 16px;padding-left:22px;' + base,
    ol: 'margin:0 0 16px;padding-left:22px;' + base,
    li: 'margin:0 0 6px;' + base,
    // Underlined as well as coloured. A link told apart only by colour is
    // invisible to a reader who cannot see the difference, and it disappears
    // entirely in the clients that force their own link colour.
    a: 'color:' + BRAND + ';text-decoration:underline;',
    blockquote:
      'margin:0 0 16px;padding:2px 0 2px 16px;border-left:4px solid ' + BRAND + ';' + base + 'color:' + MUTED + ';',
  };

  let out = html;
  for (const [tag, style] of Object.entries(styles)) {
    out = out.replace(new RegExp('<' + tag + '(\\s[^>]*)?>', 'gi'), (_match, attrs?: string) => {
      const rest = attrs ?? '';
      // A style the officer set in the editor, by picking a font size, has to
      // win. Ours goes in first so theirs overrides it.
      const existing = /style\s*=\s*"([^"]*)"/i.exec(rest);
      if (existing) {
        return '<' + tag + rest.replace(existing[0], 'style="' + style + existing[1] + '"') + '>';
      }
      return '<' + tag + rest + ' style="' + style + '">';
    });
  }
  return out;
}

/**
 * Wraps the officer's body in the chapter's header and footer.
 *
 * Table layout and inline styles, which is not nostalgia: Outlook on Windows
 * still renders HTML through Word, which has no support for max-width,
 * border-radius, box-shadow or flexbox, and several clients strip the style
 * block before the message is shown. Nested tables with inline styles are the
 * only thing that renders the same everywhere.
 *
 * What this rewrite added:
 *
 *   - An MSO conditional wrapper. Without it the Word engine ignored the 600px
 *     max-width and stretched the card across a maximised window, so every line
 *     ran the full width of the screen.
 *   - Dark mode. Gmail and Outlook both invert a light email on their own, and
 *     the header was white on blue before the inversion and unreadable after
 *     it. The color-scheme meta opts into the clients that honour it, and the
 *     media block handles the ones that read the style block.
 *   - A mobile breakpoint. The 40px side padding on a 320px screen left about
 *     240px of text column.
 *   - Preheader padding. Without the trailing joiners the inbox preview filled
 *     the rest of the line from the footer, so every message previewed as
 *     "... You are getting this because you signed up".
 *   - A footer that says how to stop. Not a List-Unsubscribe header, which
 *     needs list management this does not have, but a real address and a
 *     sentence telling a member what to do. A bulk send with no way out is one
 *     of the strongest spam signals a young domain can give off.
 */
export function wrapTemplate(bodyHtml: string, subject: string): string {
  const body = inlineBodyStyles(bodyHtml);

  // The line the inbox shows next to the subject. The trailing joiners push the
  // client's own filler past the end of the preview so the footer never shows.
  const preheader =
    escapeHtml(bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)) +
    '&#847;&zwnj;&nbsp;'.repeat(60);

  const safeSubject = escapeHtml(subject || CHAPTER.short);
  const host = CHAPTER.site.replace(/^https?:\/\//, '');

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${safeSubject}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>td,div,p,a,h2,h3,li{font-family:'Gill Sans MT',Calibri,Arial,sans-serif !important;}</style>
<![endif]-->
<style>
  /* Progressive enhancement only. Everything that matters is also inline, so a
     client that drops this block still gets a correct message. */
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  @media screen and (max-width:620px) {
    .sh-pad { padding-left:22px !important; padding-right:22px !important; }
    .sh-top { padding-top:26px !important; padding-bottom:22px !important; }
    .sh-card, .sh-top, .sh-foot { border-radius:0 !important; }
    .sh-outer { padding:0 !important; }
  }
  @media (prefers-color-scheme: dark) {
    .sh-bg { background:#0e1116 !important; }
    .sh-card { background:#171b22 !important; }
    .sh-body, .sh-body p, .sh-body li, .sh-body h2, .sh-body h3 { color:#e8eaed !important; }
    .sh-body blockquote { color:#b9c2d0 !important; }
    .sh-foot { background:#12161c !important; border-top-color:#2a2f38 !important; }
    .sh-foot-name { color:#e8eaed !important; }
    .sh-muted { color:#9aa3b2 !important; }
    .sh-body a, .sh-foot a { color:#8ab4ff !important; }
  }
</style>
</head>
<body class="sh-bg" style="margin:0;padding:0;background-color:#f4f4f7;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;color:#f4f4f7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

<table role="presentation" class="sh-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;">
<tr>
<td align="center" class="sh-outer" style="padding:32px 12px;">

<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="sh-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">

<tr>
<td class="sh-top sh-pad" style="padding:20px 32px;background:${BRAND};border-radius:12px 12px 0 0;">
<!-- A lockup, not a billboard: logo and wordmark on one line, left aligned, so
     the first sentence of the message is above the fold on a phone. The old
     stacked header was 150px of branding before a word of content. -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr>
<td width="44" style="width:44px;padding:0 12px 0 0;vertical-align:middle;">
<img src="${CHAPTER.logo}"
     alt=""
     width="44" height="44"
     style="display:block;width:44px;height:44px;border:0;border-radius:50%;background:#ffffff;">
</td>
<td style="vertical-align:middle;">
<span style="color:#ffffff;font-size:19px;font-weight:600;letter-spacing:0.01em;font-family:${FONT};white-space:nowrap;">${CHAPTER.short}</span>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td class="sh-body sh-pad" style="padding:36px 40px 28px;color:${INK};font-size:16px;line-height:1.6;font-family:${FONT};mso-line-height-rule:exactly;">
${body}
</td>
</tr>

<tr>
<td class="sh-foot sh-pad" style="padding:24px 40px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;color:${MUTED};font-size:13px;line-height:1.6;text-align:center;font-family:${FONT};">
<p class="sh-foot-name" style="margin:0 0 6px;font-weight:600;color:${INK};font-size:13px;">${CHAPTER.name}</p>
<p style="margin:0;font-size:13px;color:${MUTED};">
<a href="${CHAPTER.site}" style="color:${BRAND};text-decoration:underline;">${host}</a>
&nbsp;&middot;&nbsp;
<a href="mailto:${CHAPTER.email}" style="color:${BRAND};text-decoration:underline;">${CHAPTER.email}</a>
</p>
<p class="sh-muted" style="margin:14px 0 0;font-size:12px;line-height:1.55;color:#9ca3af;">
You are getting this because you are on the ${CHAPTER.short} member roster.
<br>
Reply to this email and we will take you off the list.
</p>
</td>
</tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->

</td>
</tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
