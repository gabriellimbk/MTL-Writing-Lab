export function getSessionTimerRemainingMs(session: any, now = Date.now()) {
  if (!session || session.status !== 'active' || !session.timer_ends_at) return null;

  const endTime = new Date(session.timer_ends_at).getTime();
  if (!Number.isFinite(endTime)) return null;

  return Math.max(0, endTime - now);
}

export function formatTimerRemaining(milliseconds: number | null) {
  if (milliseconds === null) return '';

  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function isTimerLow(milliseconds: number | null) {
  return milliseconds !== null && milliseconds <= 5 * 60 * 1000;
}
