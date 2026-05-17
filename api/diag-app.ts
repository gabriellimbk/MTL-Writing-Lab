export default async function handler(_req: any, res: any) {
  try {
    const mod = await import("../app");
    res.status(200).json({
      status: "ok",
      dependency: "app",
      type: typeof mod.default,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "failed",
      dependency: "app",
      message: error?.message || String(error),
    });
  }
}
