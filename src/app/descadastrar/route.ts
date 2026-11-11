import { descadastroHtml } from "@/lib/agentes-dgeo/motor";

/** Link de descadastro do rodapé dos e-mails comerciais: /descadastrar?t=<token>. Público, sem login. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await descadastroHtml(new URL(req.url).searchParams.get("t"));
  return new Response(r.html, {
    status: r.status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
