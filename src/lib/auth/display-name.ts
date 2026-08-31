import type { Gender } from "./labels";

export type DisplayUser = {
  name: string | null | undefined;
  nickname?: string | null;
  oab_number?: string | null;
  oab_uf?: string | null;
  gender?: Gender | string | null;
};

/**
 * Tratamento (Dr./Dra.) só é aplicado quando o gênero é informado como
 * masculino ou feminino — "prefiro não informar"/personalizado (`neutral`)
 * nunca recebe tratamento automático, por decisão do Caio (31/08/2026):
 * feminino → Dra., masculino → Dr., neutral/não informado → sem prefixo.
 */
export function displayUserName(user: DisplayUser) {
  const name = (user.nickname?.trim() || user.name?.trim() || "Usuário");
  const hasOab = Boolean(user.oab_number && user.oab_uf);
  if (!hasOab) return name;
  if (user.gender === "feminine") return `Dra. ${name}`;
  if (user.gender === "masculine") return `Dr. ${name}`;
  return name;
}
