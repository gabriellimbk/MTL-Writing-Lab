import { createClient } from "@supabase/supabase-js";

export default function handler(_req: any, res: any) {
  res.status(200).json({
    status: "ok",
    dependency: "supabase",
    type: typeof createClient,
  });
}
