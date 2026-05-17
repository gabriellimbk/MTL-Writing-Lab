import app from "./app.ts";

export const config = {
  maxDuration: 30,
};

export default async function handler(req: any, res: any) {
  try {
    return app(req, res);
  } catch (error: any) {
    console.error("API handler failed to load", error);
    return res.status(500).json({
      error: "API handler failed to load",
      message: error?.message || String(error),
      stack: process.env.NODE_ENV === "production" ? undefined : error?.stack,
    });
  }
}
