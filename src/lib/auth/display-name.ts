export type DisplayUser = {
  name: string | null | undefined;
  nickname?: string | null;
  oab_number?: string | null;
  oab_uf?: string | null;
};

export function displayUserName(user: DisplayUser) {
  const name = (user.nickname?.trim() || user.name?.trim() || "Usuário");
  const hasOab = Boolean(user.oab_number && user.oab_uf);
  return hasOab ? `Dr. ${name}` : name;
}
