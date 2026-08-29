// Placeholder intentionally left small: the actual backup-snapshot extraction is kept out of the hot path.
// Recovery from encrypted system backups will only be wired after the native copy/delete flow is restored.
export {};
