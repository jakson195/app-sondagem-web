import { NextRequest, NextResponse } from "next/server";

const UPSTREAM = (process.env.TALUDES_API_URL ?? "http://localhost:8010").replace(
  /\/$/,
  "",
);

async function proxy(req: NextRequest, pathSegs: string[]) {
  const path = pathSegs.join("/");
  const url = new URL(`${UPSTREAM}/${path}`);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.arrayBuffer();
    if (body.byteLength) init.body = body;
  }

  try {
    const res = await fetch(url.toString(), init);
    const resCt = res.headers.get("content-type") ?? "application/json";
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: res.status,
      headers: { "content-type": resCt },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "API Taludes indisponível. Inicie noutro terminal: cd app-web && npm run taludes:api",
        detail:
          e instanceof Error
            ? e.message
            : "upstream unreachable",
      },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
