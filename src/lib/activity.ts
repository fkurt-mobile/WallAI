export const ACTIVITY_EVENT_TYPES = [
  "wallpaper_uploaded",
  "visualization_created",
  "visualization_shared",
  "visualization_downloaded",
  "wallpaper_updated",
  "wallpaper_deleted",
  "variation_created",
] as const;

export const ACTIVITY_ENTITY_TYPES = ["wallpaper", "visualization", "ai_generation"] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export interface ActivityMetadata {
  wallpaper_id?: string | null;
  wallpaper_name?: string | null;
  visualization_id?: string | null;
  room_type?: string | null;
  format?: string | null;
  thumbnail_url?: string | null;
  variation_count?: number | null;
}

export interface ActivityEventRecord {
  id: string;
  event_type: ActivityEventType | string;
  entity_type: ActivityEntityType | string;
  entity_id: string | null;
  title: string | null;
  metadata: ActivityMetadata | null;
  created_at: string;
}

export interface ActivityFeedItem {
  id: string;
  type: ActivityEventType;
  title: string;
  created_at: string;
  thumbnail_url: string | null;
  href: string | null;
}

export interface CreateActivityEventInput {
  eventType: ActivityEventType;
  entityType: ActivityEntityType;
  entityId?: string | null;
  metadata?: ActivityMetadata;
  title?: string | null;
}

function normalizeCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

export function buildActivityTitle(
  eventType: ActivityEventType,
  metadata: ActivityMetadata | null | undefined,
) {
  const roomType = metadata?.room_type?.trim() || "Visualization";
  const wallpaperName = metadata?.wallpaper_name?.trim() || "wallpaper";
  const format = metadata?.format?.trim()?.toUpperCase() || "PNG";
  const variationCount = normalizeCount(metadata?.variation_count);

  switch (eventType) {
    case "wallpaper_uploaded":
      return `Uploaded wallpaper ${wallpaperName}`;
    case "wallpaper_updated":
      return `Updated wallpaper details for ${wallpaperName}`;
    case "wallpaper_deleted":
      return `Deleted wallpaper ${wallpaperName}`;
    case "visualization_shared":
      return `Shared ${roomType} design`;
    case "visualization_downloaded":
      return `Downloaded ${roomType} as ${format}`;
    case "variation_created":
      return variationCount > 1
        ? `Generated ${variationCount} new variations from ${roomType}`
        : `Generated new variation from ${roomType}`;
    case "visualization_created":
      return variationCount > 1
        ? `Generated ${variationCount} new room designs using ${wallpaperName}`
        : `Generated ${roomType} visualization using ${wallpaperName}`;
    default:
      return "Activity recorded";
  }
}

export function getActivityHref(event: {
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  metadata?: ActivityMetadata | null;
}) {
  if (event.event_type === "wallpaper_deleted") return null;

  if (event.entity_type === "wallpaper" && event.entity_id) {
    return `/wallpapers/${event.entity_id}`;
  }

  const visualizationId =
    event.entity_type === "visualization"
      ? event.metadata?.visualization_id || event.entity_id
      : event.metadata?.visualization_id;

  if ((event.entity_type === "visualization" || event.entity_type === "ai_generation") && visualizationId) {
    return `/visualizations/${visualizationId}`;
  }

  return null;
}

export function normalizeActivityFeedItem(row: ActivityEventRecord): ActivityFeedItem | null {
  if (!ACTIVITY_EVENT_TYPES.includes(row.event_type as ActivityEventType)) return null;

  const type = row.event_type as ActivityEventType;
  const metadata = row.metadata || null;

  return {
    id: row.id,
    type,
    title: row.title?.trim() || buildActivityTitle(type, metadata),
    created_at: row.created_at,
    thumbnail_url: metadata?.thumbnail_url || null,
    href: getActivityHref({
      event_type: row.event_type,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      metadata,
    }),
  };
}
