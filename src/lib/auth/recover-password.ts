import { createPasswordResetForEmail } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/auth/send-password-reset-email";
import { isSupabaseUnavailableError } from "@/lib/auth/supabase-errors";
import { createSupabaseClient, isSupabaseAuthConfigured } from "@/lib/supabase";

const GENERIC_OK_MESSAGE =
  "Se o email existir na plataforma, enviámos instruções de recuperação.";

export type RecoverPasswordResult =
  | { ok: true; provider: "supabase" | "legacy"; message: string; devResetLink?: string }
  | { ok: false; status: number; error: string };

export async function recoverPasswordForEmail(
  email: string,
  reqUrl: string,
): Promise<RecoverPasswordResult> {
  if (isSupabaseAuthConfigured()) {
    try {
      const supabase = createSupabaseClient();
      const redirectTo = new URL("/auth/callback?next=/redefinir-senha", reqUrl).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (!error) {
        return { ok: true, provider: "supabase", message: GENERIC_OK_MESSAGE };
      }
      if (!isSupabaseUnavailableError(error)) {
        return { ok: false, status: 400, error: error.message };
      }
      console.warn(
        "[auth/recover] Supabase indisponível; a usar recuperação local.",
        error.message,
      );
    } catch (error) {
      if (!isSupabaseUnavailableError(error)) {
        console.error(error);
        return {
          ok: false,
          status: 500,
          error: "Falha ao contactar Supabase Auth.",
        };
      }
      console.warn("[auth/recover] Supabase indisponível; a usar recuperação local.", error);
    }
  }

  const reset = await createPasswordResetForEmail(email);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(reqUrl).origin;

  if (!reset) {
    return { ok: true, provider: "legacy", message: GENERIC_OK_MESSAGE };
  }

  const resetUrl = `${baseUrl}/redefinir-senha?token=${reset.token}`;

  if (process.env.NODE_ENV !== "production") {
    return {
      ok: true,
      provider: "legacy",
      message: GENERIC_OK_MESSAGE,
      devResetLink: resetUrl,
    };
  }

  const sent = await sendPasswordResetEmail({ to: email, resetUrl });
  if (!sent.ok) {
    console.error("[auth/recover] Email não enviado:", sent.error);
    return {
      ok: false,
      status: 503,
      error:
        "Recuperação por email indisponível no momento. Contacte suporte@datageodigital.com.br.",
    };
  }

  return { ok: true, provider: "legacy", message: GENERIC_OK_MESSAGE };
}
