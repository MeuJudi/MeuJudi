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
          phone: profile.phone,
          oab_number: profile.oab_number,
          oab_uf: profile.oab_uf,
          role: profile.role,
          gender: profile.gender,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
        }}
      />
      <AparenciaSection />
    </div>
  );
}
