import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type SendSupportAnswerEmailParams = {
  to: string;
  tenantName: string;
  userName: string;
  reportTitle: string;
  answer: string;
  reportType: string;
};

const TYPE_LABELS: Record<string, string> = {
  bug: "erro",
  sugestao: "sugestão",
  duvida: "dúvida",
};

export async function sendSupportAnswerEmail({
  to,
  tenantName,
  userName,
  reportTitle,
  answer,
  reportType,
}: SendSupportAnswerEmailParams) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.meujudi.com.br";
  const helpUrl = `${baseUrl}/configuracoes/ajuda`;

  const typeLabel = TYPE_LABELS[reportType] ?? "report";

  const { error } = await resend.emails.send({
    from: "Meu Judi <no-reply@meujudi.com.br>",
    to,
    subject: `Sua ${typeLabel} foi respondida — Meu Judi`,
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
            <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px;">Sua ${typeLabel} foi respondida</h2>
            <p style="margin:0 0 8px;color:#555;font-size:14px;line-height:1.6;">
              Olá <strong>${userName}</strong>,
            </p>
            <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.6;">
              Sua mensagem <strong>"${reportTitle}"</strong> recebeu uma resposta:
            </p>
            <div style="background:#f8f6f3;border-left:3px solid #8b1a4a;padding:12px 16px;margin:0 0 24px;border-radius:0 8px 8px 0;">
              <p style="margin:0;color:#333;font-size:14px;line-height:1.6;white-space:pre-wrap;">${answer}</p>
            </div>
            <a href="${helpUrl}" style="display:inline-block;background:#8b1a4a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
              Ver na página de Ajuda
            </a>
            <p style="margin:24px 0 0;color:#999;font-size:12px;line-height:1.5;">
              Se o botão não funcionar, copie e cole este link no seu navegador:<br>
              <a href="${helpUrl}" style="color:#8b1a4a;">${helpUrl}</a>
            </p>
          </div>
          <div style="padding:16px 32px;background:#f8f6f3;border-top:1px solid #e8e4dd;">
            <p style="margin:0;color:#999;font-size:11px;">Meu Judi — ${tenantName}</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    console.error("[email] Failed to send support answer:", error.message);
  }
}
