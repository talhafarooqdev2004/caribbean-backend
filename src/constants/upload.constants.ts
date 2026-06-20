export const COVER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export function formatBytesLimit(bytes: number): string {
    const megabytes = bytes / (1024 * 1024);

    if (megabytes >= 1) {
        return `${Math.round(megabytes)}MB`;
    }

    return `${Math.round(bytes / 1024)}KB`;
}
