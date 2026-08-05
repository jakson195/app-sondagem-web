import { NextResponse } from "next/server";
import { recoverPasswordForEmail } from "@/lib/auth/recover-password";
import { clientIpFromRequest, checkRateLimit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const limited = checkRateLimit(`recover:${ip}`, 5, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Muitas tentativas. Aguarde ${limited.retryAfterSec}s.` },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email é obrigatório." }, { status: 400 });
  }

  const result = await recoverPasswordForEmail(email, req.url);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    message: result.message,
    ...(result.devResetLink ? { devResetLink: result.devResetLink } : {}),
  });
}
