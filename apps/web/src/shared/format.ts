export function formatForm(form: readonly string[]): string {
  return form.length > 0 ? form.join(' ') : '—';
}

export function formatKickoff(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(
    'es-ES',
    sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
  ).format(date);
}

export function metricWidth(value: number, max: number): string {
  if (max <= 0) return '0%';
  return `${Math.max(8, Math.round((value / max) * 100))}%`;
}
