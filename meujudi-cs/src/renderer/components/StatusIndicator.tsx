/**
 * StatusIndicator — bolinha colorida com label do status de conexão.
 */

import type { PJeStatus } from '@shared/types';

interface StatusIndicatorProps {
  status: PJeStatus;
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_CONFIG: Record<PJeStatus['state'], { color: string; label: string; icon: string; pulse: boolean }> = {
  disconnected: { color: 'bg-status-disconnected', label: 'Desconectado', icon: '⚪', pulse: false },
  connecting:   { color: 'bg-status-connecting',   label: 'Conectando...', icon: '🟡', pulse: true },
  connected:    { color: 'bg-status-connected',    label: 'Conectado',     icon: '🟢', pulse: false },
  error:        { color: 'bg-status-error',        label: 'Erro',          icon: '🔴', pulse: false },
};

const SIZE_CONFIG = {
  sm: { dot: 'w-2 h-2', text: 'text-xs' },
  md: { dot: 'w-3 h-3', text: 'text-sm' },
  lg: { dot: 'w-4 h-4', text: 'text-base' },
};

export function StatusIndicator({ status, size = 'md' }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status.state];
  const sizing = SIZE_CONFIG[size];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block rounded-full ${sizing.dot} ${config.color} ${config.pulse ? 'animate-pulse-slow' : ''}`}
        aria-label={config.label}
        title={config.label}
      />
      <span className={`${sizing.text} font-medium text-gray-700`}>
        {config.icon} {config.label}
      </span>
    </div>
  );
}
