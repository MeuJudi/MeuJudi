import { BarChart3, ShieldCheck, UsersRound } from "lucide-react";
import { MeuJudiLogo } from "@/components/tenant/meujudi-logo";

export function AuthShell({ children, variant = "meujudi" }: { children: React.ReactNode; variant?: "meujudi" | "admin" }) {
  const isAdmin = variant === "admin";

  return (
    <main className={isAdmin ? "auth-page auth-page-admin" : "auth-page auth-page-meujudi"}>
      <aside className="auth-aside">
        <div className="auth-brand">
          {isAdmin ? (
            <div className="auth-admin-brand-lockup" aria-label="Super Admin">
              <ShieldCheck className="auth-admin-brand-icon" />
              <span>Super <strong>Admin</strong></span>
            </div>
          ) : (
            <div className="auth-logo-plate">
              <MeuJudiLogo className="h-auto w-52" />
              <span className="auth-logo-caption">GESTAO JURIDICA</span>
            </div>
          )}
        </div>
        <div className="auth-aside-copy">
          <p className="auth-kicker">{isAdmin ? "CONTROLE DA PLATAFORMA" : "GESTÃO JURÍDICA"}</p>
          <h1>
            {isAdmin ? "Administre com clareza." : <>Seu escritório,<br />em <span className="auth-accent-word">ordem.</span></>}
          </h1>
          <p>{isAdmin ? "Acesso reservado para administrar tenants, segurança e operações globais." : "Organize processos, controle prazos e gerencie sua equipe com eficiência e segurança."}</p>
          {isAdmin ? (
            <div className="auth-admin-feature-list">
              <div className="auth-admin-feature">
                <UsersRound />
                <div><strong>Gestão de Tenants</strong><span>Crie, configure e monitore todos os tenants.</span></div>
              </div>
              <div className="auth-admin-feature">
                <ShieldCheck />
                <div><strong>Segurança e Permissões</strong><span>Controle acessos e garanta conformidade.</span></div>
              </div>
              <div className="auth-admin-feature">
                <BarChart3 />
                <div><strong>Operações Globais</strong><span>Monitore uso, saúde e logs em tempo real.</span></div>
              </div>
            </div>
          ) : null}
        </div>
        {isAdmin ? (
          <p className="auth-aside-footer">Ambiente administrativo separado</p>
        ) : (
          <div className="auth-brand-footer">
            <ShieldCheck />
            <span>Segurança e privacidade<br />de dados em primeiro lugar.</span>
          </div>
        )}
      </aside>
      <section className="auth-content">
        <div className="auth-content-inner">{children}</div>
      </section>
    </main>
  );
}
