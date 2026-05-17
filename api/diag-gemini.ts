import { GoogleGenAI } from "@google/genai";

export default function handler(_req: any, res: any) {
  res.status(200).json({
    status: "ok",
    dependency: "gemini",
    type: typeof GoogleGenAI,
  });
}
