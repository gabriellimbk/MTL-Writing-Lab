import express from "express";

export default function handler(_req: any, res: any) {
  const app = express();
  res.status(200).json({ status: "ok", dependency: "express", type: typeof app });
}
