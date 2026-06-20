const WORDS_PER_MINUTE = 200;

function stripTagsToPlainText(value: string | null | undefined): string {
    if (!value?.trim()) {
        return '';
    }

    let text = value.replace(/<[^>]*>/g, ' ');
    text = text.replace(/\u00a0/g, ' ');
    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'");

    return text.replace(/\s+/g, ' ').trim();
}

function countWords(value: string): number {
    return stripTagsToPlainText(value).split(/\s+/).filter(Boolean).length;
}

/** Estimated read time for a press release body (minimum 1 minute). */
export function pressReleaseReadingMinutes(content: string, summary = ''): number {
    const contentWords = countWords(content);
    const wordCount = contentWords > 0 ? contentWords : countWords(summary);

    return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}
