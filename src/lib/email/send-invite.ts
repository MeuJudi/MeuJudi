import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type SendInviteEmailParams = {
  to: string;
  inviterName: string;
  tenantName: string;
  role: string;
  inviteId: string;
};

export async function sendInviteEmail({
  to,
  inviterName,
  tenantName,
  role,
  inviteId,
}: SendInviteEmailParams) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.meujudi.com.br";
  const registerUrl = `${baseUrl}/register?invite=${inviteId}`;

  const roleLabels: Record<string, string> = {
    owner: "Sócio(a) / Responsável",
    lawyer: "Advogado(a)",
    intern: "Estagiário(a)",
    staff: "Equipe administrativa",
  };

  const { error } = await resend.emails.send({
    from: "Meu Judi <no-reply@meujudi.com.br>",
    to,
    subject: `Convite para entrar no ${tenantName} no MeuJudi`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background-color:#f8f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:12px;border:1px solid #e8e4dd;overflow:hidden;">
          <div style="background:#8b1a4a;padding:24px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Meu Judi</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px;">Você foi convidado(a) para a equipe</h2>
            <p style="margin:0 0 8px;color:#555;font-size:14px;line-height:1.6;">
              <strong>${inviterName}</strong> convidou você para integrar o escritório
              <strong>${tenantName}</strong> no Meu Judi como <strong>${roleLabels[role] ?? role}</strong>.
            </p>
            <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6;">
              Clique no botão abaixo para criar sua senha e completar seu cadastro:
            </p>
            <a href="${registerUrl}" style="display:inline-block;background:#8b1a4a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
              Criar minha conta
            </a>
            <p style="margin:24px 0 0;color:#999;font-size:12px;line-height:1.5;">
              Se o botão não funcionar, copie e cole este link no seu navegador:<br>
              <a href="${registerUrl}" style="color:#8b1a4a;">${registerUrl}</a>
            </p>
          </div>
          <div style="padding:16px 32px;background:#f8f6f3;border-top:1px solid #e8e4dd;">
            <p style="margin:0;color:#999;font-size:11px;">Este convite expira em 14 dias.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    console.error("[email] Failed to send invite:", error.message);
    throw new Error("Falha ao enviar email de convite");
  }
}
