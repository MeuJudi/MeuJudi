export type Gender = "masculine" | "feminine" | "neutral";

export function roleLabel(role: string, gender: Gender | string = "neutral") {
  const normalizedGender: Gender = gender === "masculine" || gender === "feminine" ? gender : "neutral";
  if (role === "owner") return normalizedGender === "masculine" ? "Sócio" : normalizedGender === "feminine" ? "Sócia" : "Sócio(a)";
  if (role === "lawyer") return normalizedGender === "masculine" ? "Advogado" : normalizedGender === "feminine" ? "Advogada" : "Advogado(a)";
  if (role === "intern") return normalizedGender === "masculine" ? "Estagiário" : normalizedGender === "feminine" ? "Estagiária" : "Estagiário(a)";
  if (role === "staff") return normalizedGender === "masculine" ? "Administrativo" : normalizedGender === "feminine" ? "Administrativa" : "Equipe administrativa";
  if (role === "super_admin") return "Super Admin";
  return role;
}
