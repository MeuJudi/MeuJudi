/**
 * useTimeAgo — formata diferença de tempo em texto legível (pt-BR).
 */

import { useState, useEffect } from 'react';

export function useTimeAgo(date: Date | string | null | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!date) return '—';
  const target = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diff = target - now;

  if (diff <= 0) return 'expirado';
  const totalMin = Math.floor(diff / 60_000);
  const totalHours = Math.floor(totalMin / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays > 0) return `em ${totalDays}d ${totalHours % 24}h`;
  if (totalHours > 0) return `em ${totalHours}h ${totalMin % 60}m`;
  if (totalMin > 0) return `em ${totalMin} min`;
  return 'em segundos';
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
