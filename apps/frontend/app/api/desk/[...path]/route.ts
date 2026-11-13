import { bridge } from "../../../../lib/desk-bridge";
export const dynamic = "force-dynamic";
async function handle(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return bridge(req, (await params).path.join("/"));
}
export { handle as GET, handle as POST };
