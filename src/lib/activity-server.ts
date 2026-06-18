import {
  buildActivityTitle,
  type ActivityEntityType,
  type ActivityEventType,
  type ActivityMetadata,
} from "@/lib/activity";

interface ActivityLogClient {
  from: (table: "activity_events") => {
    insert: (value: {
      workspace_id: string;
      user_id?: string | null;
      event_type: ActivityEventType;
      entity_type: ActivityEntityType;
      entity_id?: string | null;
      title: string;
      metadata: ActivityMetadata;
    }) => Promise<{ error: { message?: string } | null }>;
  };
}

export async function createActivityEvent(
  supabase: unknown,
  input: {
    workspaceId: string;
    userId?: string | null;
    eventType: ActivityEventType;
    entityType: ActivityEntityType;
    entityId?: string | null;
    metadata?: ActivityMetadata;
    title?: string | null;
  },
) {
  try {
    const client = supabase as ActivityLogClient;
    const metadata = input.metadata || {};
    const title = input.title?.trim() || buildActivityTitle(input.eventType, metadata);

    const { error } = await client.from("activity_events").insert({
      workspace_id: input.workspaceId,
      user_id: input.userId ?? null,
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      title,
      metadata,
    });

    if (error) {
      console.warn("[Activity] Failed to insert event:", error.message);
    }
  } catch (error) {
    console.warn("[Activity] Failed to insert event:", error);
  }
}
