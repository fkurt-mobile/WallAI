import { supabase } from "@/integrations/supabase/client";
import type { CreateActivityEventInput } from "@/lib/activity";

export async function logActivityEvent(input: CreateActivityEventInput) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) return;

    await fetch("/api/activity-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
  } catch {
    // Activity logging should not interrupt the primary user action.
  }
}
