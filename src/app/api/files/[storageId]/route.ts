import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const dynamic = "force-dynamic";

const convex = new ConvexHttpClient(
  process.env.NEXT_PUBLIC_DB_URL || process.env.NEXT_PUBLIC_CONVEX_URL!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { storageId: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storageId = params.storageId;
  if (!storageId) {
    return NextResponse.json({ error: "Missing storageId" }, { status: 400 });
  }

  const url = await convex.query(api.files.getUrl, {
    storageId: storageId as Id<"_storage">,
  });
  if (!url) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  const filename = req.nextUrl.searchParams.get("name") || "download";
  const safeName = filename.replace(/[^a-zA-Z0-9._\- ]/g, "_");
  const contentType = upstream.headers.get("content-type") || "application/octet-stream";

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
