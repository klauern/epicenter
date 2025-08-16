import type { MaybePromise, WhisperingError } from '$lib/result';
import { createTaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';

const { ClipboardServiceError, ClipboardServiceErr } = createTaggedError(
	'ClipboardServiceError',
);
type ClipboardServiceError = ReturnType<typeof ClipboardServiceError>;
export { ClipboardServiceErr, ClipboardServiceError };

export type ClipboardService = {
	/**
	 * Copies text to the system clipboard.
	 * @param text The text to copy to the clipboard.
	 */
	copyToClipboard: (
		text: string,
	) => Promise<Result<void, ClipboardServiceError>>;

	/**
	 * Writes the provided text at the current cursor position.
	 * Uses the clipboard sandwich technique to preserve the user's existing clipboard content.
	 * 
	 * This method:
	 * 1. Saves the current clipboard
	 * 2. Writes the text to clipboard
	 * 3. Simulates paste (Cmd+V on macOS, Ctrl+V elsewhere)
	 * 4. Restores the original clipboard
	 * 
	 * @param text The text to write at the cursor position.
	 */
	writeText: (
		text: string,
	) => MaybePromise<Result<void, ClipboardServiceError | WhisperingError>>;
};
