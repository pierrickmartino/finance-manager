const NOON = 12;
const EVENING = 18;

/** "Good morning" and so on, by the hour of `date` in its own (the browser's) time zone. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < NOON) return 'Good morning';
  if (hour < EVENING) return 'Good afternoon';
  return 'Good evening';
}
