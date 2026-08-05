import { NextResponse } from "next/server";
import { consumePasswordResetToken } from "@/lib/auth/password-reset";
import { clientIpFromRequest, checkRateLimit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const limited = checkRateLimit(`reset:${ip}`, 10, 60 * 60 * 1000);
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

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || password.length < 8) {
    return NextResponse.json(
      { error: "Token e senha (mín. 8 caracteres) são obrigatórios." },
      { status: 400 },
    );
  }

  const result = await consumePasswordResetToken(token, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
