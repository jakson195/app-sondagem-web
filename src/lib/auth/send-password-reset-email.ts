type SendPasswordResetEmailInput = {
  to: string;
  resetUrl: string;
};

function passwordResetHtml(resetUrl: string): string {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2>Recuperar palavra-passe</h2>
      <p>Recebemos um pedido para redefinir a palavra-passe da sua conta DataGeo Digital.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px">Redefinir palavra-passe</a></p>
      <p>Ou copie este link no browser:</p>
      <p style="word-break:break-all"><a href="${resetUrl}">${resetUrl}</a></p>
      <p style="color:#666;font-size:13px">Se não fez este pedido, ignore este email. O link expira em 1 hora.</p>
    </div>
  `.trim();
}

export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY não configurado." };
  }

  const from =
    process.env.EMAIL_FROM?.trim() ||
    "DataGeo Digital <noreply@datageodigital.com.br>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: "Recuperar palavra-passe — DataGeo Digital",
        html: passwordResetHtml(input.resetUrl),
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      return {
        ok: false,
        error: body?.message ?? `Resend HTTP ${response.status}`,
      };
    }

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao enviar email.";
    return { ok: false, error: message };
  }
}
