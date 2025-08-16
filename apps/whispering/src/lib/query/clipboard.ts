import * as services from '$lib/services';
import { defineMutation } from './_client';

export const clipboard = {
	copyToClipboard: defineMutation({
		mutationKey: ['clipboard', 'copyToClipboard'],
		resultMutationFn: ({ text }: { text: string }) =>
			services.clipboard.copyToClipboard(text),
	}),
	writeText: defineMutation({
		mutationKey: ['clipboard', 'writeText'],
		resultMutationFn: async ({ text }: { text: string }) => {
			// writeText handles everything internally:
			// 1. Saves current clipboard
			// 2. Writes text to clipboard
			// 3. Simulates paste
			// 4. Restores original clipboard
			return await services.clipboard.writeText(text);
		},
	}),
};
