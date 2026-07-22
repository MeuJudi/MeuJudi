"use server";

import { checkOabApiHealth } from "@/lib/oab-service";

export type HealthStatus = {
  healthy: boolean;
  configured: boolean;
  latencyMs: number;
  checkedAt: string;
};

let lastHealth: HealthStatus | null = null;
let lastCheck = 0;
const CACHE_TTL = 60_000; // 1 minuto

/**
 * Verifica saúde da API da OAB com cache em memória (1 min).
 * Evita múltiplos pings simultâneos.
 */
export async function getOabApiHealth(): Promise<HealthStatus> {
  const now = Date.now();
  if (lastHealth && now - lastCheck < CACHE_TTL) {
    return lastHealth;
  }
  lastHealth = await checkOabApiHealth();
  lastCheck = now;
  return lastHealth;
}
