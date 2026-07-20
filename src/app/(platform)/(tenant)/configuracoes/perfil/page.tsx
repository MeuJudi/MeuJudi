import { requireAppUser } from "@/lib/auth/guards";
import { PerfilForm, AparenciaSection } from "./perfil-form";

export default async function PerfilPage() {
  const { profile } = await requireAppUser();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">Meu perfil</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Gerencie suas informações pessoais.
        </p>
      </div>
      <PerfilForm
        profile={{
          id: profile.id,
          name: profile.name,
          email: profile.email,
          phone: (profile as Record<string, unknown>).phone as string | null,
          oab_number: (profile as Record<string, unknown>).oab_number as string | null,
          oab_uf: (profile as Record<string, unknown>).oab_uf as string | null,
          role: profile.role,
          gender: profile.gender,
          avatar_url: (profile as Record<string, unknown>).avatar_url as string | null,
          created_at: (profile as Record<string, unknown>).created_at as string,
        }}
      />
      <AparenciaSection />
    </div>
  );
}
