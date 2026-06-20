import { ENV } from '../config/env.js';

const EMAIL_LINK_STYLE = 'color:#16477c;text-decoration:underline;font-weight:600;';

export function escapeHtmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function escapeHtmlText(value: string): string {
    return escapeHtmlAttr(value);
}

/** Absolute public site URL for email links (always includes http/https). */
export function emailPublicUrl(path = ''): string {
    const origin = ENV.FRONTEND_URL.replace(/\/$/, '');

    if (!path) {
        return origin;
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `${origin}${normalizedPath}`;
}

/**
 * Ensure email hrefs are absolute and include a protocol.
 * Email clients ignore or disable links like `localhost:3000/portal` (no scheme).
 */
export function resolveEmailHref(href: string): string {
    const trimmed = href.trim();

    if (!trimmed) {
        return emailPublicUrl('/portal');
    }

    if (/^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
        return trimmed;
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    if (trimmed.startsWith('/')) {
        return emailPublicUrl(trimmed);
    }

    if (/^localhost(?::\d+)?(\/|$)/i.test(trimmed) || /^127\.0\.0\.1(?::\d+)?(\/|$)/.test(trimmed)) {
        return `http://${trimmed}`;
    }

    return `https://${trimmed}`;
}

/** Styled anchor for HTML email clients (Gmail, Outlook, Apple Mail). */
export function emailAnchor(href: string, label: string): string {
    const url = resolveEmailHref(href);

    return `<a href="${escapeHtmlAttr(url)}" target="_blank" rel="noopener noreferrer" style="${EMAIL_LINK_STYLE}">${escapeHtmlText(label)}</a>`;
}

/** Primary CTA with a visible URL fallback when the anchor is stripped or blocked. */
export function emailLinkBlock(href: string, label: string): string {
    const url = resolveEmailHref(href);

    return `<p style="margin:16px 0;line-height:1.55;">${emailAnchor(url, label)}<br /><span style="font-size:13px;color:#64748b;word-break:break-all;">${escapeHtmlText(url)}</span></p>`;
}

/** Table-based button — more reliable than text links in Outlook and some mobile clients. */
export function emailButton(href: string, label: string): string {
    const url = resolveEmailHref(href);
    const safeUrl = escapeHtmlAttr(url);
    const safeLabel = escapeHtmlText(label);

    return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;">
  <tr>
    <td align="left" bgcolor="#16477c" style="border-radius:6px;">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${safeLabel}</a>
    </td>
  </tr>
</table>`;
}

/** Wrap fragment HTML in a minimal document so clients render links reliably. */
export function wrapEmailHtml(inner: string): string {
    const trimmed = inner.trim();

    if (/^<!DOCTYPE/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
        return trimmed;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Carib Newswire</title>
</head>
<body style="margin:0;padding:24px 16px;background:#f7f5f2;">
  ${trimmed}
</body>
</html>`;
}

/**
 * Plain-text part for multipart emails — keeps link URLs (naive tag stripping drops them).
 * Example: `<a href="https://x.com/portal">My portal</a>` → `My portal: https://x.com/portal`
 */
export function htmlToPlainTextEmail(html: string): string {
    let text = html.replace(
        /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_match, href: string, inner: string) => {
            const label = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            const url = resolveEmailHref(href);

            if (!label) {
                return url;
            }

            return `${label}: ${url}`;
        },
    );

    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, '\n');
    text = text.replace(/<[^>]*>/g, '');
    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'");

    return text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/ +/g, ' ')
        .trim();
}
