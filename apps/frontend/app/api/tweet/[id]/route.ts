import { getTweet, type Tweet } from "react-tweet/api";
const ID = "2061469961416032653";
let cached: { data: Tweet; until: number } | undefined;
let pending: Promise<Tweet | undefined> | undefined;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await params).id !== ID)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    if (!cached || cached.until <= Date.now()) {
      pending ??= getTweet(ID, { signal: AbortSignal.timeout(8000) }).finally(
        () => {
          pending = undefined;
        },
      );
      const data = await pending;
      if (
        !data ||
        data.id_str !== ID ||
        data.user.screen_name !== "VitalikButerin"
      )
        return Response.json({ data: null });
      cached = { data, until: Date.now() + 300000 };
    }
    return Response.json(
      { data: cached.data },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch {
    return Response.json({ data: null });
  }
}
