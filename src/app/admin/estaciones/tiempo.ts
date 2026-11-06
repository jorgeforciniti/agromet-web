/** "12 min", "3 h 5 min", "2 d" a partir de minutos ("—" si no hay). */
export function hace(minutos: number | null): string {
  if (minutos === null) return '—';
  const m = Math.max(minutos, 0);
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`;
}
