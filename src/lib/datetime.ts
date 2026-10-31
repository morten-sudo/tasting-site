// Date and time of a tasting as two fields (calendar picker + time picker), in the browser's local time.
const field = (prefix: string, name: string) => document.getElementById(`${prefix}-${name}`) as HTMLInputElement;
const pad = (n: number) => String(n).padStart(2, '0');

/** Picking a date with no time suggests 19:00, which the host can change. */
export function initWhen(prefix: string) {
  field(prefix, 'date').addEventListener('change', () => {
    if (field(prefix, 'date').value && !field(prefix, 'time').value) field(prefix, 'time').value = '19:00';
  });
}

export function writeWhen(prefix: string, iso: unknown) {
  const d = typeof iso === 'string' && iso ? new Date(iso) : null;
  field(prefix, 'date').value = d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
  field(prefix, 'time').value = d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}

/** ISO timestamp, or null without a date. A date without a time counts as 19:00. */
export function readWhen(prefix: string): string | null {
  const date = field(prefix, 'date').value;
  if (!date) return null;
  const time = field(prefix, 'time').value || '19:00';
  return new Date(`${date}T${time}`).toISOString();
}
