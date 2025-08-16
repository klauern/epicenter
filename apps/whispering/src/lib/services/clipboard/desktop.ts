import { WhisperingWarningErr } from '$lib/result';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { type } from '@tauri-apps/plugin-os';
import { Err, Ok, tryAsync } from 'wellcrafted/result';
import type { ClipboardService } from '.';
import { ClipboardServiceErr } from './types';

export function createClipboardServiceDesktop(): ClipboardService {
	return {
		copyToClipboard: (text) =>
			tryAsync({
				try: () => writeText(text),
				mapErr: (error) =>
					ClipboardServiceErr({
						message:
							'There was an error copying to the clipboard using the Tauri Clipboard Manager API. Please try again.',
						context: { text },
						cause: error,
					}),
			}),

		writeText: async (text) => {
			// Try to write text using the clipboard sandwich technique
			const { error: pasteError } = await tryAsync({
				try: () => invoke<void>('write_text', { text }),
				mapErr: (error) =>
					ClipboardServiceErr({
						message:
							'There was an error writing the text. Please try pasting manually with Cmd/Ctrl+V.',
						context: { text },
						cause: error,
					}),
			});

			// If write succeeded, we're done
			if (!pasteError) return Ok(undefined);

			// On macOS, check accessibility permissions when write fails
			const isMacos = type() === 'macos';
			if (!isMacos) return Err(pasteError);

			// On macOS, check accessibility permissions
			const {
				data: isAccessibilityEnabled,
				error: isAccessibilityEnabledError,
			} = await tryAsync({
				try: () =>
					invoke<boolean>('is_macos_accessibility_enabled', {
						askIfNotAllowed: false,
					}),
				mapErr: (error) =>
					ClipboardServiceErr({
						message:
							'There was an error checking if accessibility is enabled. Please try again.',
						cause: error,
					}),
			});

			if (isAccessibilityEnabledError) return Err(isAccessibilityEnabledError);

			// If accessibility is not enabled, return WhisperingWarning
			if (!isAccessibilityEnabled) {
				return WhisperingWarningErr({
					title:
						'Please enable or re-enable accessibility to write transcriptions!',
					description:
						'Accessibility must be enabled or re-enabled for Whispering after install or update. Follow the link below for instructions.',
					action: {
						type: 'link',
						label: 'Open Directions',
						href: '/macos-enable-accessibility',
					},
				});
			}

			// If accessibility is enabled but write still failed, propagate original error
			return Err(pasteError);
		},
	};
}
