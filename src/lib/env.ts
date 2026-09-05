/**
 * On Vercel the filesystem is read-only apart from /tmp, which is not shared
 * between lambdas or preserved across cold starts. The app still works — a warm
 * instance behaves normally — but threads, predictions and the §10.5 calibration
 * rows are throwaway. Say so in the UI rather than let it look broken.
 */
export const EPHEMERAL_STORAGE = !process.env.LEARN_DB_PATH && !!process.env.VERCEL;
