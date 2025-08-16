import { IS_MACOS } from '$lib/constants/platform';
import * as services from '$lib/services';
import { toast } from 'svelte-sonner';

let accessibilityToastId: string | number | undefined;

export function registerAccessibilityPermission() {
	// Only run on macOS desktop
	if (!IS_MACOS) return;

	// Check accessibility permission every second
	const intervalId = setInterval(async () => {
		const { data: isAccessibilityGranted, error } =
			await services.permissions.accessibility.check();

		if (error) {
			console.error('Failed to check accessibility permissions:', error);
			return;
		}

		if (!isAccessibilityGranted) {
			// Toast if permission not granted and toast not already showing
			accessibilityToastId ??= toast.info('Accessibility Permission Required', {
				description:
					'Whispering needs accessibility permissions to capture system audio and simulate keyboard shortcuts',
				duration: Number.POSITIVE_INFINITY,
				action: {
					label: 'Enable Permission',
					onClick: async () => {
						const { error: requestError } =
							await services.permissions.accessibility.request();

						if (requestError) {
							toast.error('Failed to open accessibility settings', {
								description:
									'Please open System Settings > Privacy & Security > Accessibility manually',
							});
						}
					},
				},
			});
		} else {
			// Dismiss toast if permission granted
			toast.dismiss(accessibilityToastId);

			// Stop checking once permission is granted
			clearInterval(intervalId);
		}
	}, 1000);

	// Return cleanup function
	return () => {
		clearInterval(intervalId);
		if (accessibilityToastId) {
			toast.dismiss(accessibilityToastId);
		}
	};
}

let microphoneToastId: string | number | undefined;

export function registerMicrophonePermission() {
	// Only run on macOS desktop
	if (!IS_MACOS) return;

	// Check microphone permission every second
	const intervalId = setInterval(async () => {
		const { data: isMicrophoneGranted, error } =
			await services.permissions.microphone.check();

		if (error) {
			console.error('Failed to check microphone permissions:', error);
			return;
		}

		if (!isMicrophoneGranted) {
			// Toast if permission not granted and toast not already showing
			microphoneToastId ??= toast.info('Microphone Permission Required', {
				description: 'Whispering needs microphone access to record audio',
				duration: Number.POSITIVE_INFINITY,
				action: {
					label: 'Enable Permission',
					onClick: async () => {
						const { error: requestError } =
							await services.permissions.microphone.request();

						if (requestError) {
							toast.error('Failed to request microphone permission', {
								description: 'Please check your system settings',
							});
						}
					},
				},
			});
		} else {
			// Dismiss toast if permission granted
			toast.dismiss(microphoneToastId);

			// Stop checking once permission is granted
			clearInterval(intervalId);
		}
	}, 1000);

	// Return cleanup function
	return () => {
		clearInterval(intervalId);
		if (microphoneToastId) {
			toast.dismiss(microphoneToastId);
		}
	};
}
