import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { z } from "zod";
import { AppShell } from "@/components/site/app-shell";
import { WizardStepper } from "@/components/site/wizard-stepper";
import { StickySelected } from "@/components/site/sticky-selected";
import { SharePanel } from "@/components/site/share-panel";
import { type Wallpaper, type Mockup } from "@/lib/wallpapers/data";
import resultPreview from "@/assets/result-preview.jpg";
import {
  Sparkles,
  Upload,
  X,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ZoomIn,
  ZoomOut,
  Plus,
  RotateCcw,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import { compositeWallpaper } from "@/utils/perspective";

const searchSchema = z.object({ wallpaper: z.string().optional() });

export const Route = createFileRoute("/_authenticated/tools/wallpaper-visualizer")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Visualizer — Murra" },
      {
        name: "description",
        content: "Preview a wallpaper on a staged mockup or your own room photo.",
      },
    ],
  }),
  component: Visualizer,
});

type Step =
  | "wallpaper"
  | "experience"
  | "mockup"
  | "upload"
  | "detecting"
  | "detect"
  | "manual"
  | "ai-style"
  | "ai-loading"
  | "uploading-result"
  | "result";

type ResultSource = "ready_mockup" | "uploaded_room" | "ai_generated";

type NormalizedPoint = { x: number; y: number };

interface AiStyle {
  id: string;
  name: string;
  image: string;
}

// ── Main Visualizer Component ─────────────────────────────────────────────────

function Visualizer() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const companyId = profile?.company_id;

  // ── Core selection state ────────────────────────────────────────────────
  const [wallpaper, setWallpaper] = useState<Wallpaper | null>(null);
  const [mockup, setMockup] = useState<Mockup | null>(null);
  const [step, setStep] = useState<Step>("wallpaper");
  const [aiStyle, setAiStyle] = useState<AiStyle | null>(null);
  const [resultSource, setResultSource] = useState<ResultSource>("ready_mockup");

  // ── Upload My Room state ────────────────────────────────────────────────
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedLocalUrl, setUploadedLocalUrl] = useState<string | null>(null); // local blob URL for preview
  const [uploadedRoomImageUrl, setUploadedRoomImageUrl] = useState<string | null>(null); // Supabase URL
  const [detectedPolygon, setDetectedPolygon] = useState<NormalizedPoint[]>([]);
  const [wallDetectionConfidence, setWallDetectionConfidence] = useState<number>(0);
  const [manualPolygon, setManualPolygon] = useState<NormalizedPoint[]>([]);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [maskThreshold, setMaskThreshold] = useState(105);

  // ── Result state ────────────────────────────────────────────────────────
  const [savingResult, setSavingResult] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string>("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  // ── Mockup per-wall coordinate overrides ────────────────────────────────
  const MOCKUP_COORDINATES: Record<string, [number, number][]> = {
    "b8ccbf7a-2ee5-4b08-b80c-e2f0d922bc30": [[0.24, 0.0], [0.96, 0.0], [0.96, 0.82], [0.24, 0.82]],
  };

  // ── Fetch data ──────────────────────────────────────────────────────────
  const { data: dbWallpapers = [], isLoading: wallpapersLoading } = useQuery({
    queryKey: ["wallpapers", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("wallpapers")
        .select("*")
        .eq("user_id", profile.id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  const { data: dbMockups = [], isLoading: mockupsLoading } = useQuery({
    queryKey: ["mockup_rooms_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mockup_rooms").select("*").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const wallpapersList: Wallpaper[] = dbWallpapers.map((w) => ({
    id: w.id,
    code: w.product_code,
    title: w.title,
    category: w.category,
    image: w.image_url,
    tint: "",
  }));

  const mockupsList: Mockup[] = dbMockups.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category || "General",
    image: m.image_url,
  }));

  const mockupCategories = [
    "All", "Bedroom", "Living Room", "Office", "Dining Room",
    "Cafe", "Restaurant", "Hotel", "Hallway", "Kids Room",
  ];

  // ── Load wallpaper from query param ──────────────────────────────────────
  useEffect(() => {
    if (search.wallpaper && wallpapersList.length > 0) {
      const selected = wallpapersList.find((w) => w.id === search.wallpaper);
      if (selected) {
        setWallpaper(selected);
        setStep("experience");
      }
    }
  }, [search.wallpaper, dbWallpapers]);

  // ── Auth helper ───────────────────────────────────────────────────────────
  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("No active session. Please log in.");
    return token;
  };

  // ── Utility ───────────────────────────────────────────────────────────────
  const helperDataURLtoFile = (dataurl: string, filename: string) => {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  };

  // ── Step: Upload room image to Supabase Storage ────────────────────────
  const handleUploadRoomFile = async (file: File) => {
    if (!companyId || !profile?.id) {
      toast.error("You must be logged in to upload a room image.");
      return;
    }

    // Show preview immediately using local blob URL
    const localUrl = URL.createObjectURL(file);
    setUploadedFile(file);
    setUploadedLocalUrl(localUrl);

    // Upload to Supabase
    toast.loading("Uploading room image…", { id: "room-upload" });
    try {
      const fileName = `${companyId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("uploaded-room-images")
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        // Bucket may not exist yet – fallback: use the local data URL
        console.warn("[UploadRoom] Storage upload failed:", uploadError.message);
        // Convert file to data URL as fallback
        const reader = new FileReader();
        reader.onload = (e) => {
          setUploadedRoomImageUrl(e.target?.result as string);
        };
        reader.readAsDataURL(file);
        toast.dismiss("room-upload");
        return;
      }

      const { data } = supabase.storage.from("uploaded-room-images").getPublicUrl(fileName);
      setUploadedRoomImageUrl(data.publicUrl);
      toast.success("Room image uploaded.", { id: "room-upload" });
    } catch (err: any) {
      console.error("[UploadRoom] Error:", err);
      // Fallback: convert to data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedRoomImageUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      toast.dismiss("room-upload");
    }
  };

  // ── Step: Wall Detection ──────────────────────────────────────────────────
  const runWallDetection = async (roomUrl: string) => {
    setStep("detecting");
    setDetectError(null);
    try {
      const token = await getToken();
      const response = await fetch("/api/ai/detect-wall", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uploadedRoomImageUrl: roomUrl }),
      });

      if (!response.ok) {
        let errMsg = "Unable to detect wall. Please adjust manually.";
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      const polygon: NormalizedPoint[] = data.polygon;
      const confidence: number = data.confidence;

      setDetectedPolygon(polygon);
      setManualPolygon(polygon); // Initialize manual polygon from detection
      setWallDetectionConfidence(confidence);
      setStep("detect");
    } catch (err: any) {
      console.error("[WallDetect] Error:", err.message);
      setDetectError(err.message);
      // Fall back to manual editor with a default polygon
      const defaultPolygon: NormalizedPoint[] = [
        { x: 0.15, y: 0.12 },
        { x: 0.85, y: 0.12 },
        { x: 0.82, y: 0.80 },
        { x: 0.18, y: 0.80 },
      ];
      setDetectedPolygon(defaultPolygon);
      setManualPolygon(defaultPolygon);
      setWallDetectionConfidence(0);
      setStep("manual");
      toast.error("Wall detection failed. Please adjust manually.");
    }
  };

  // ── Step: Apply wallpaper to uploaded room (client-side canvas compositing) ─
  // ── Step: Apply wallpaper to uploaded room (calls API, falls back to client-side) ─
  const applyWallpaperToUploadedRoom = async (
    polygon: NormalizedPoint[],
    confidence: number
  ) => {
    const roomSrc = uploadedLocalUrl || uploadedRoomImageUrl;
    if (!wallpaper || !roomSrc) {
      toast.error("Please upload a room image first.");
      return;
    }
    if (polygon.length < 4) {
      toast.error("Please select at least four wall points.");
      return;
    }
    if (!companyId || !profile?.id) {
      toast.error("You must be logged in.");
      return;
    }

    setStep("ai-loading");
    setAiError(null);
    setSavingResult(true);

    try {
      // 1. Generate client-side composited image (highly reliable preview & server fallback)
      const quadPoints: [number, number][] = polygon.map((p) => [p.x, p.y]);
      console.log("[UploadedRoom] Generating client-side composited image...");
      let base64 = "";
      try {
        base64 = await compositeWallpaper(roomSrc, wallpaper.image, quadPoints, maskThreshold);
      } catch (composeErr: any) {
        console.warn("[UploadedRoom] Client-side perspective mapping failed:", composeErr.message);
      }

      // 2. Call backend API endpoint to run server-side composite and database save
      const token = await getToken();
      
      // Make sure we have a valid public URL for the room
      const publicRoomUrl = (uploadedRoomImageUrl && uploadedRoomImageUrl.startsWith("http"))
        ? uploadedRoomImageUrl
        : wallpaper.image; // fallback to wallpaper image to satisfy startsWith("http") on server

      console.log("[UploadedRoom] Calling backend apply-wallpaper-to-uploaded-room API...");
      const response = await fetch("/api/ai/apply-wallpaper-to-uploaded-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          wallpaperId: wallpaper.id,
          uploadedRoomImageUrl: publicRoomUrl,
          polygon,
          wallDetectionConfidence: confidence,
          compositedImageBase64: base64 || null,
        }),
      });

      if (!response.ok) {
        let errMsg = "API generation failed. Falling back to local composition.";
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const visualization = await response.json();
      const resultUrl = visualization.result_image_url;

      setResultImageUrl(resultUrl);
      setResultSource("uploaded_room");
      setDebugInfo({
        wallpaper_url: wallpaper.image,
        mockup_url: uploadedRoomImageUrl || publicRoomUrl,
        result_url: resultUrl,
        payload_type: "polygon_composite",
        input_type: "polygon_mask",
        model_used: "Sharp Compositor (Server-Side)",
        prompt_version: "N/A",
      });
      setStep("result");

      queryClient.invalidateQueries({ queryKey: ["visualizations"] });
      queryClient.invalidateQueries({ queryKey: ["visualizations-count"] });

      toast.success("Wallpaper applied successfully!");
    } catch (err: any) {
      console.warn("[applyWallpaperToUploadedRoom] API path failed, attempting client-side direct save fallback...", err.message);
      
      // Fallback: Perform local client-side composite and direct Supabase insertion
      try {
        const quadPoints: [number, number][] = polygon.map((p) => [p.x, p.y]);
        const base64 = await compositeWallpaper(roomSrc, wallpaper.image, quadPoints, maskThreshold);

        const fileName = `${companyId}/${Date.now()}_uploaded_room_result.jpg`;
        const uploadFile = helperDataURLtoFile(base64, "uploaded_room_result.jpg");

        const { error: uploadError } = await supabase.storage
          .from("visualization-results")
          .upload(fileName, uploadFile, { contentType: uploadFile.type, upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("visualization-results")
          .getPublicUrl(fileName);
        const resultUrl = publicUrlData.publicUrl;

        const insertPayload: any = {
          company_id: companyId,
          user_id: profile.id,
          wallpaper_id: wallpaper.id,
          mockup_room_id: null,
          source_type: "uploaded_room",
          result_image_url: resultUrl,
          room_type: "Uploaded Room",
        };

        if (uploadedRoomImageUrl) {
          insertPayload.uploaded_room_image_url = uploadedRoomImageUrl;
        }
        insertPayload.wall_polygon = polygon;
        insertPayload.wall_detection_confidence = confidence;

        let insertResult: any = null;
        let insertError: any = null;

        try {
          const { data, error } = await supabase
            .from("visualizations")
            .insert(insertPayload)
            .select()
            .single();
          insertResult = data;
          insertError = error;
        } catch (e) {
          insertError = e;
        }

        if (insertError) {
          console.warn("[UploadedRoom] Insert with new columns failed, retrying with legacy schema:", insertError);
          const legacyPayload = {
            company_id: companyId,
            wallpaper_id: wallpaper.id,
            mockup_room_id: null,
            source_type: "uploaded_room",
            result_image_url: resultUrl,
            room_type: "Uploaded Room",
          };
          const { data, error } = await supabase
            .from("visualizations")
            .insert(legacyPayload)
            .select()
            .single();
          insertResult = data;
          insertError = error;
        }

        setResultImageUrl(resultUrl);
        setResultSource("uploaded_room");
        setDebugInfo({
          wallpaper_url: wallpaper.image,
          mockup_url: uploadedRoomImageUrl,
          result_url: resultUrl,
          payload_type: "polygon_composite",
          input_type: "polygon_mask",
          model_used: "Canvas Compositor (Client-Side Fallback)",
          prompt_version: "N/A",
        });
        setStep("result");

        queryClient.invalidateQueries({ queryKey: ["visualizations"] });
        queryClient.invalidateQueries({ queryKey: ["visualizations-count"] });
        toast.success("Wallpaper applied successfully!");
      } catch (fallbackErr: any) {
        console.error("[applyWallpaperToUploadedRoom] Fallback failed:", fallbackErr);
        const message = fallbackErr.message || "Unable to generate visualization. Please try again.";
        setAiError(message);
        toast.error(message);
      }
    } finally {
      setSavingResult(false);
    }
  };

  const [savingAdjustments, setSavingAdjustments] = useState(false);

  const handleThresholdChange = async (newVal: number) => {
    setMaskThreshold(newVal);
    const roomSrc = uploadedLocalUrl || uploadedRoomImageUrl;
    if (wallpaper && roomSrc && (resultSource === "uploaded_room")) {
      const poly = manualPolygon.length > 0 ? manualPolygon : detectedPolygon;
      const quadPoints: [number, number][] = poly.map((p) => [p.x, p.y]);
      try {
        const base64 = await compositeWallpaper(roomSrc, wallpaper.image, quadPoints, newVal);
        setResultImageUrl(base64);
      } catch (e) {
        console.error("Failed to update threshold preview:", e);
      }
    }
  };

  const saveAdjustedImage = async () => {
    if (!resultImageUrl || !wallpaper || !companyId || !profile?.id) return;
    setSavingAdjustments(true);
    try {
      const fileName = `${companyId}/${Date.now()}_uploaded_room_result_adj.jpg`;
      const uploadFile = helperDataURLtoFile(resultImageUrl, "uploaded_room_result_adj.jpg");

      // Upload new base64 to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("visualization-results")
        .upload(fileName, uploadFile, { contentType: uploadFile.type, upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("visualization-results")
        .getPublicUrl(fileName);
      const resultUrl = publicUrlData.publicUrl;

      // Call API to create DB record
      const token = await getToken();
      const publicRoomUrl = (uploadedRoomImageUrl && uploadedRoomImageUrl.startsWith("http"))
        ? uploadedRoomImageUrl
        : wallpaper.image;

      const poly = manualPolygon.length > 0 ? manualPolygon : detectedPolygon;
      const response = await fetch("/api/ai/apply-wallpaper-to-uploaded-room", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          wallpaperId: wallpaper.id,
          uploadedRoomImageUrl: publicRoomUrl,
          polygon: poly,
          wallDetectionConfidence: wallDetectionConfidence,
          compositedImageBase64: resultImageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save changes to the server.");
      }

      toast.success("Adjustments saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["visualizations"] });
    } catch (err: any) {
      console.error("[saveAdjustedImage] Error:", err);
      toast.error(err.message || "Failed to save adjustments.");
    } finally {
      setSavingAdjustments(false);
    }
  };

  // ── Step: Mockup (ready mockup flow) ──────────────────────────────────────
  const applyCanvasOverlay = async (selectedWallpaper: Wallpaper, selectedMockup: Mockup) => {
    if (!companyId || !profile?.id) {
      toast.error("You must be logged in to generate a visualization.");
      return;
    }
    setStep("ai-loading");
    setAiError(null);
    setSavingResult(true);
    try {
      const coords: [number, number][] | null = MOCKUP_COORDINATES[selectedMockup.id] ?? null;
      const base64 = await compositeWallpaper(selectedMockup.image, selectedWallpaper.image, coords);

      const fileName = `${companyId}/${Date.now()}_canvas_overlay.jpg`;
      const uploadFile = helperDataURLtoFile(base64, "canvas_overlay.jpg");

      const { error: uploadError } = await supabase.storage
        .from("visualization-results")
        .upload(fileName, uploadFile, { contentType: uploadFile.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("visualization-results").getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      const { error: insertError } = await supabase.from("visualizations").insert({
        company_id: companyId,
        user_id: profile.id,
        wallpaper_id: selectedWallpaper.id,
        mockup_room_id: selectedMockup.id,
        source_type: "ready_mockup",
        result_image_url: publicUrl,
        room_type: selectedMockup.category || "Room",
      });

      if (insertError) console.warn("[Visualizer] DB insert warning:", insertError);

      setResultImageUrl(publicUrl);
      setResultSource("ready_mockup");
      setDebugInfo({
        wallpaper_url: selectedWallpaper.image,
        mockup_url: selectedMockup.image,
        result_url: publicUrl,
        payload_type: "canvas_overlay",
        input_type: "canvas_composited",
        model_used: "Canvas Compositor (Client-Side)",
        prompt_version: "N/A",
      });
      setStep("result");

      queryClient.invalidateQueries({ queryKey: ["visualizations"] });
      queryClient.invalidateQueries({ queryKey: ["visualizations-count"] });
      toast.success("Wallpaper applied successfully!");
    } catch (err: any) {
      const message = err.message || "Failed to apply wallpaper. Please try again.";
      setAiError(message);
      toast.error("Failed to apply wallpaper: " + message);
    } finally {
      setSavingResult(false);
    }
  };

  const applyManualOverlay = async () => {
    if (!wallpaper || !mockup) return;
    await applyCanvasOverlay(wallpaper, mockup);
  };

  // ── AI mockup (Grok-based) ────────────────────────────────────────────────
  const generateAiMockup = async (
    selectedWallpaper: Wallpaper,
    selectedMockup: Mockup,
    isRetry = false
  ) => {
    setStep("ai-loading");
    setAiError(null);
    setSavingResult(true);
    if (!isRetry) setRetryCount(0);
    else setRetryCount((c) => c + 1);

    try {
      const token = await getToken();

      let compositedImageBase64 = "";
      try {
        const coords: [number, number][] | null = MOCKUP_COORDINATES[selectedMockup.id] ?? null;
        compositedImageBase64 = await compositeWallpaper(selectedMockup.image, selectedWallpaper.image, coords);
      } catch (composeErr) {
        console.warn("[Visualizer] Pre-compositing skipped:", composeErr);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch("/api/ai/apply-wallpaper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          wallpaperId: selectedWallpaper.id,
          mockupRoomId: selectedMockup.id,
          compositedImageBase64,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errMsg = "Unable to generate visualization. Please try again.";
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const visualization = await response.json();
      setResultImageUrl(visualization.result_image_url);
      setResultSource("ready_mockup");
      if (visualization.debug) setDebugInfo(visualization.debug);
      setStep("result");

      queryClient.invalidateQueries({ queryKey: ["visualizations"] });
      queryClient.invalidateQueries({ queryKey: ["visualizations-count"] });
      toast.success("Visualization generated successfully!");
    } catch (err: any) {
      let message = "Unable to generate visualization. Please try again.";
      if (err.name === "AbortError") message = "AI generation request timed out. Please try again.";
      else if (err.message) message = err.message;
      setAiError(message);
      toast.error(message);
    } finally {
      setSavingResult(false);
    }
  };

  // ── Wizard step number ────────────────────────────────────────────────────
  const wizardStep: 1 | 2 | 3 | 4 =
    step === "wallpaper"
      ? 1
      : step === "experience" || step === "mockup" || step === "upload" || step === "ai-style"
        ? 2
        : step === "detecting" || step === "detect" || step === "manual" || step === "ai-loading"
          ? 3
          : 4;

  const isLoadingData = wallpapersLoading || mockupsLoading;

  return (
    <AppShell contentClassName="pb-32">
      <div className="border-b border-brand-900/5 bg-card sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 flex items-center justify-between gap-6">
          <WizardStepper current={wizardStep} />
          <Link
            to="/wallpapers"
            className="hidden md:block text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent shrink-0"
          >
            ✕ Exit
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
        {isLoadingData ? (
          <p className="text-center font-serif text-2xl italic py-20">Loading Visualizer data...</p>
        ) : (
          <>
            {/* ── Step 1: Choose Wallpaper ── */}
            {step === "wallpaper" && (
              <SelectWallpaper wallpapers={wallpapersList} onPick={(w) => { setWallpaper(w); setStep("experience"); }} />
            )}

            {/* ── Step 2a: Experience Selection ── */}
            {step === "experience" && wallpaper && (
              <ExperienceSelect
                onMockup={() => setStep("mockup")}
                onUpload={() => setStep("upload")}
                onAi={() => setStep("ai-style")}
                onBack={() => setStep("wallpaper")}
              />
            )}

            {/* ── Step 2b: Ready Mockup Gallery ── */}
            {step === "mockup" && wallpaper && (
              <MockupGallery
                mockups={mockupsList}
                categories={mockupCategories}
                onPick={(m) => { setMockup(m); applyCanvasOverlay(wallpaper, m); }}
                onBack={() => setStep("experience")}
              />
            )}

            {/* ── Step 2c: Upload Room ── */}
            {step === "upload" && wallpaper && (
              <UploadRoom
                uploadedFile={uploadedFile}
                uploadedLocalUrl={uploadedLocalUrl}
                uploadedRoomImageUrl={uploadedRoomImageUrl}
                onFileSelect={handleUploadRoomFile}
                onClear={() => {
                  setUploadedFile(null);
                  setUploadedLocalUrl(null);
                  setUploadedRoomImageUrl(null);
                }}
                onContinue={() => {
                  if (uploadedRoomImageUrl) runWallDetection(uploadedRoomImageUrl);
                  else toast.error("Please upload a room image first.");
                }}
                onBack={() => setStep("experience")}
              />
            )}

            {/* ── Step 3a: Detecting (loading) ── */}
            {step === "detecting" && (
              <DetectingWall />
            )}

            {/* ── Step 3b: Wall Detected ── */}
            {step === "detect" && wallpaper && uploadedLocalUrl && (
              <WallDetect
                img={uploadedLocalUrl}
                polygon={detectedPolygon}
                confidence={wallDetectionConfidence}
                onGood={() => applyWallpaperToUploadedRoom(detectedPolygon, wallDetectionConfidence)}
                onAdjust={() => {
                  setManualPolygon([...detectedPolygon]);
                  setStep("manual");
                }}
                onBack={() => setStep("upload")}
              />
            )}

            {/* ── Step 3c: Manual Polygon Editor ── */}
            {step === "manual" && wallpaper && uploadedLocalUrl && (
              <ManualEditor
                img={uploadedLocalUrl}
                initialPolygon={detectedPolygon}
                polygon={manualPolygon}
                setPolygon={setManualPolygon}
                onApply={() => applyWallpaperToUploadedRoom(manualPolygon, wallDetectionConfidence)}
                onBack={() => setStep("detect")}
              />
            )}

            {/* ── Step 2d: AI Style Selection ── */}
            {step === "ai-style" && wallpaper && (
              <AiStyleSelect
                selected={aiStyle}
                onPick={(s) => setAiStyle(s)}
                onContinue={() => setStep("ai-loading")}
                onBack={() => setStep("experience")}
              />
            )}

            {/* ── Step 3 (AI/Upload): Loading ── */}
            {step === "ai-loading" && wallpaper && (
              <AiLoading
                isUploadedRoom={resultSource === "uploaded_room" || !mockup}
                onDone={aiStyle ? () => {
                  // AI style — this path uses the old createVisualization
                } : undefined}
                error={aiError}
                retryCount={retryCount}
                onRetry={() => {
                  if (wallpaper && mockup) generateAiMockup(wallpaper, mockup, true);
                }}
                onBack={() => {
                  setAiError(null);
                  setStep(aiStyle ? "ai-style" : mockup ? "mockup" : "detect");
                }}
              />
            )}

            {/* ── Step 4: Result ── */}
            {step === "result" && wallpaper && (
              <ResultView
                wallpaper={wallpaper}
                mockup={mockup}
                source={resultSource}
                aiStyle={aiStyle}
                resultImageUrl={resultImageUrl}
                uploadedLocalUrl={uploadedLocalUrl}
                currentPolygon={manualPolygon.length > 0 ? manualPolygon : detectedPolygon}
                wallDetectionConfidence={wallDetectionConfidence}
                onAnother={() => {
                  setWallpaper(null);
                  setMockup(null);
                  setUploadedFile(null);
                  setUploadedLocalUrl(null);
                  setUploadedRoomImageUrl(null);
                  setDetectedPolygon([]);
                  setManualPolygon([]);
                  setAiStyle(null);
                  setDebugInfo(null);
                  setStep("wallpaper");
                }}
                onAnotherAi={() => setStep("ai-loading")}
                onCreateVariation={() => {
                  if (resultSource === "uploaded_room") {
                    // Re-run with same image, wallpaper, polygon
                    const poly = manualPolygon.length > 0 ? manualPolygon : detectedPolygon;
                    applyWallpaperToUploadedRoom(poly, wallDetectionConfidence);
                  } else if (wallpaper && mockup) {
                    applyCanvasOverlay(wallpaper, mockup);
                  }
                }}
                onRecreate={() => {
                  if (wallpaper && mockup) applyCanvasOverlay(wallpaper, mockup);
                }}
                onUseManualOverlay={applyManualOverlay}
                debugInfo={debugInfo}
                savingResult={savingResult}
                maskThreshold={maskThreshold}
                onThresholdChange={handleThresholdChange}
                onSaveAdjustedImage={saveAdjustedImage}
                savingAdjustments={savingAdjustments}
              />
            )}
          </>
        )}
      </div>

      {wallpaper && step !== "wallpaper" && <StickySelected wallpaper={wallpaper} />}
    </AppShell>
  );
}

/* ────────── Step 1: Wallpaper ────────── */
interface SelectWallpaperProps {
  wallpapers: Wallpaper[];
  onPick: (w: Wallpaper) => void;
}

function SelectWallpaper({ wallpapers, onPick }: SelectWallpaperProps) {
  return (
    <section>
      <Eyebrow>Step One</Eyebrow>
      <Heading>Choose a wallpaper.</Heading>
      <p className="text-brand-900/60 max-w-md mb-12">
        Pick any pattern from your company catalog to begin the visualization journey.
      </p>
      {wallpapers.length === 0 ? (
        <div className="border border-dashed border-brand-900/15 bg-card py-16 px-8 text-center max-w-xl">
          <p className="text-brand-900/50 font-serif text-xl italic mb-4">
            No wallpapers available in catalog
          </p>
          <Link
            to="/wallpapers/new"
            className="inline-flex items-center gap-2 bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors"
          >
            Upload Wallpaper First
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {wallpapers.map((w) => (
            <button key={w.id} onClick={() => onPick(w)} className="group block text-left cursor-pointer">
              <div className="aspect-square overflow-hidden bg-brand-100">
                <img
                  src={w.image}
                  alt={w.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-brand-900/40">{w.code}</p>
              <p className="text-sm font-medium">{w.title}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ────────── Step 2a: Experience Selection ────────── */
function ExperienceSelect({
  onMockup, onUpload, onAi, onBack,
}: {
  onMockup: () => void;
  onUpload: () => void;
  onAi: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step Two</Eyebrow>
      <Heading>How would you like to preview this wallpaper?</Heading>
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <ExperienceCard
          letter="A"
          title="Ready Mockups"
          desc="Use professionally staged room scenes — living rooms, bedrooms, cafés and more."
          onClick={onMockup}
        />
        <ExperienceCard
          letter="B"
          title="Upload My Room"
          desc="Upload your own room photo and our AI will apply the wallpaper to the detected wall."
          onClick={onUpload}
        />
        <ExperienceCard
          letter="C"
          title="Generate With AI"
          desc="Generate a completely new room scene using AI and apply this wallpaper automatically."
          onClick={onAi}
          badge={<Sparkles className="size-4" />}
        />
      </div>
      <BackBtn onClick={onBack} className="mt-12" />
    </section>
  );
}

function ExperienceCard({
  letter, title, desc, onClick, badge,
}: {
  letter: string;
  title: string;
  desc: string;
  onClick: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left bg-card p-10 border border-brand-900/5 hover:border-accent transition-colors relative cursor-pointer"
    >
      {badge && (
        <span className="absolute top-5 right-5 inline-flex items-center gap-1 bg-accent/10 text-accent px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] rounded-full">
          {badge} New
        </span>
      )}
      <span className="font-serif text-6xl italic text-accent">{letter}</span>
      <h3 className="font-serif text-3xl italic mt-6 mb-3">{title}</h3>
      <p className="text-sm text-brand-900/60 leading-relaxed mb-8">{desc}</p>
      <span className="text-[11px] uppercase tracking-[0.2em] text-brand-900 group-hover:text-accent transition-colors">
        Continue →
      </span>
    </button>
  );
}

/* ────────── Step 2c: Upload Room ────────── */
function UploadRoom({
  uploadedFile,
  uploadedLocalUrl,
  uploadedRoomImageUrl,
  onFileSelect,
  onClear,
  onContinue,
  onBack,
}: {
  uploadedFile: File | null;
  uploadedLocalUrl: string | null;
  uploadedRoomImageUrl: string | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)/)) {
      toast.error("Please upload a JPG or PNG image.");
      return;
    }
    onFileSelect(file);
  }

  const isUploading = uploadedFile !== null && uploadedRoomImageUrl === null;
  const isReady = uploadedFile !== null && uploadedRoomImageUrl !== null;

  return (
    <section>
      <Eyebrow>Step Two</Eyebrow>
      <Heading>Upload your room.</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Pick a well-lit photograph of the room wall you want to visualize. We'll detect the wall automatically.
      </p>

      {!uploadedFile ? (
        <label
          id="room-upload-dropzone"
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={[
            "block border-2 border-dashed bg-card aspect-[16/9] flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300",
            isDragging ? "border-accent bg-accent/5 scale-[1.01]" : "border-brand-900/20 hover:border-accent",
          ].join(" ")}
        >
          <div className="flex flex-col items-center gap-5">
            <div className="size-16 rounded-full bg-brand-900/5 flex items-center justify-center">
              <Upload className="size-7 text-brand-900/40" />
            </div>
            <div>
              <p className="font-serif text-3xl italic text-brand-900/50">
                Drag &amp; drop your photo
              </p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-brand-900/30 mt-3">
                or click to browse · JPG · PNG · up to 20MB
              </p>
            </div>
          </div>
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      ) : (
        <div className="space-y-6">
          {/* Preview */}
          <div className="relative bg-brand-900/5 overflow-hidden">
            <img
              src={uploadedLocalUrl!}
              alt="Uploaded room"
              className="w-full max-h-[600px] object-contain"
            />
            {/* Status overlay */}
            {isUploading && (
              <div className="absolute inset-0 bg-brand-950/30 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-card px-6 py-4 flex items-center gap-3 shadow-xl">
                  <Loader2 className="size-5 animate-spin text-accent" />
                  <span className="text-[11px] uppercase tracking-[0.2em]">Uploading to cloud…</span>
                </div>
              </div>
            )}
            {isReady && (
              <div className="absolute top-4 right-4 bg-card/95 backdrop-blur-md px-4 py-2 flex items-center gap-2 shadow-lg">
                <Check className="size-4 text-green-600" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/70">Ready</span>
              </div>
            )}
          </div>

          {/* File info */}
          <div className="flex items-center gap-4 py-3 border-t border-brand-900/5">
            <ImagePlus className="size-4 text-brand-900/30 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
              <p className="text-[11px] text-brand-900/40">
                {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <button
              onClick={onClear}
              className="text-[11px] uppercase tracking-[0.2em] text-brand-900/40 hover:text-red-500 cursor-pointer shrink-0 transition-colors"
            >
              Replace
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              id="upload-room-continue-btn"
              onClick={onContinue}
              disabled={!isReady}
              className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {isUploading ? (
                <><Loader2 className="size-3.5 animate-spin" /> Uploading…</>
              ) : (
                "Continue → Detect Wall"
              )}
            </button>
          </div>
        </div>
      )}

      <BackBtn onClick={onBack} className="mt-12" />
    </section>
  );
}

/* ────────── Step 3a: Detecting Wall (Loading) ────────── */
function DetectingWall() {
  const messages = [
    "Analyzing room image",
    "Detecting wall boundaries",
    "Mapping wall geometry",
    "Computing polygon",
    "Finalizing detection",
  ];
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 4000;
    const tick = setInterval(() => {
      const p = Math.min(90, ((Date.now() - start) / duration) * 100);
      setProgress(p);
    }, 80);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const rot = setInterval(() => setMsgIdx((i) => (i + 1) % messages.length), 1200);
    return () => clearInterval(rot);
  }, []);

  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <div className="relative size-24 mb-10">
        <div className="absolute inset-0 rounded-full border border-brand-900/10" />
        <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <div className="absolute inset-0 grid place-items-center">
          <ImagePlus className="size-7 text-accent" />
        </div>
      </div>
      <Eyebrow>Detecting</Eyebrow>
      <h1 className="font-serif text-4xl md:text-5xl mt-3 mb-6 font-medium">Analyzing your room…</h1>
      <p className="font-serif text-xl italic text-brand-900/70 mb-10">{messages[msgIdx]}…</p>
      <div className="w-full max-w-md h-px bg-brand-900/10 overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );
}

/* ────────── Step 3b: Wall Detected ────────── */
function WallDetect({
  img,
  polygon,
  confidence,
  onGood,
  onAdjust,
  onBack,
}: {
  img: string;
  polygon: NormalizedPoint[];
  confidence: number;
  onGood: () => void;
  onAdjust: () => void;
  onBack: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });

  const updateSize = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    setImgSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, []);

  useEffect(() => {
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [updateSize]);

  // Convert normalized polygon to pixel coords for SVG overlay
  const svgPoints =
    imgSize.width > 0
      ? polygon.map((p) => `${(p.x * imgSize.width).toFixed(1)},${(p.y * imgSize.height).toFixed(1)}`).join(" ")
      : "";

  const confidencePct = Math.round(confidence * 100);

  return (
    <section>
      <Eyebrow>Step Three</Eyebrow>
      <Heading>Wall detected.</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Our AI identified the primary wall. Confirm or refine the boundaries manually.
      </p>

      <div className="relative bg-brand-900/5 overflow-hidden" style={{ lineHeight: 0 }}>
        <img
          ref={imgRef}
          src={img}
          alt="Detected room"
          className="w-full max-h-[600px] object-contain"
          onLoad={updateSize}
        />

        {/* SVG polygon overlay */}
        {imgSize.width > 0 && polygon.length > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={imgSize.width}
            height={imgSize.height}
            style={{ top: 0, left: 0 }}
          >
            {/* Dashed polygon border */}
            <polygon
              points={svgPoints}
              fill="rgba(197,160,89,0.15)"
              stroke="rgb(197,160,89)"
              strokeWidth="2"
              strokeDasharray="8,4"
            />
            {/* Corner handles */}
            {polygon.map((p, i) => (
              <circle
                key={i}
                cx={(p.x * imgSize.width).toFixed(1)}
                cy={(p.y * imgSize.height).toFixed(1)}
                r="7"
                fill="white"
                stroke="rgb(197,160,89)"
                strokeWidth="2.5"
              />
            ))}
          </svg>
        )}

        {/* Confidence badge */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-md shadow-xl border border-white/20 px-5 py-2.5 flex items-center gap-3">
          <span className="size-2 rounded-full bg-gilded" />
          <span className="text-[11px] uppercase tracking-[0.18em] font-medium">
            Primary Wall · {confidence > 0 ? `${confidencePct}% Confidence` : "Heuristic Detection"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-8">
        <button
          id="wall-detect-looks-good-btn"
          onClick={onGood}
          className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer inline-flex items-center gap-2"
        >
          <Check className="size-3.5" /> Looks Good
        </button>
        <button
          id="wall-detect-adjust-btn"
          onClick={onAdjust}
          className="border border-brand-900/15 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors cursor-pointer"
        >
          Adjust Manually
        </button>
      </div>
      <BackBtn onClick={onBack} className="mt-8" />
    </section>
  );
}

/* ────────── Step 3c: Manual Polygon Editor ────────── */
function ManualEditor({
  img,
  initialPolygon,
  polygon,
  setPolygon,
  onApply,
  onBack,
}: {
  img: string;
  initialPolygon: NormalizedPoint[];
  polygon: NormalizedPoint[];
  setPolygon: (p: NormalizedPoint[]) => void;
  onApply: () => void;
  onBack: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const MAX_POINTS = 8;
  const MIN_POINTS = 4;

  const updateSize = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    setImgSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, []);

  useEffect(() => {
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [updateSize]);

  // Convert normalized point to pixel (within current zoom/pan)
  const toPixel = (p: NormalizedPoint) => ({
    x: p.x * imgSize.width * zoom + panOffset.x,
    y: p.y * imgSize.height * zoom + panOffset.y,
  });

  // Convert pixel back to normalized
  const toNorm = (px: number, py: number): NormalizedPoint => ({
    x: Math.max(0, Math.min(1, (px - panOffset.x) / (imgSize.width * zoom))),
    y: Math.max(0, Math.min(1, (py - panOffset.y) / (imgSize.height * zoom))),
  });

  // SVG points string for the polygon
  const svgPoints = polygon
    .map((p) => {
      const px = toPixel(p);
      return `${px.x.toFixed(1)},${px.y.toFixed(1)}`;
    })
    .join(" ");

  const getSvgCoords = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(i);
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (dragging !== null) return;
    e.preventDefault();
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging !== null) {
      e.preventDefault();
      const coords = getSvgCoords(e);
      const norm = toNorm(coords.x, coords.y);
      const updated = [...polygon];
      updated[dragging] = norm;
      setPolygon(updated);
    } else if (isPanning && zoom > 1) {
      e.preventDefault();
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
    setIsPanning(false);
  };

  // Add point between nearest edge midpoint
  const addPoint = () => {
    if (polygon.length >= MAX_POINTS) {
      toast.error(`Maximum ${MAX_POINTS} points allowed.`);
      return;
    }
    // Find longest edge and insert midpoint there
    let maxDist = -1;
    let insertAfter = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist > maxDist) {
        maxDist = dist;
        insertAfter = i;
      }
    }
    const a = polygon[insertAfter];
    const b = polygon[(insertAfter + 1) % polygon.length];
    const mid: NormalizedPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const updated = [...polygon];
    updated.splice(insertAfter + 1, 0, mid);
    setPolygon(updated);
  };

  const removeLastPoint = () => {
    if (polygon.length <= MIN_POINTS) {
      toast.error(`Minimum ${MIN_POINTS} points required.`);
      return;
    }
    setPolygon(polygon.slice(0, -1));
  };

  return (
    <section>
      <Eyebrow>Step Three · Manual</Eyebrow>
      <Heading>Adjust wall boundaries.</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Drag the corner handles to refine the polygon. Use zoom for precision work.
      </p>

      <div className="grid lg:grid-cols-[1fr_260px] gap-6">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="relative bg-brand-900/5 overflow-hidden select-none"
          style={{ cursor: dragging !== null ? "grabbing" : isPanning ? "grabbing" : zoom > 1 ? "grab" : "default" }}
          onMouseDown={handleContainerMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Zoomed image */}
          <div
            style={{
              transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
              transformOrigin: "top left",
              transition: dragging !== null ? "none" : "transform 0.2s ease",
            }}
          >
            <img
              ref={imgRef}
              src={img}
              alt="Editor"
              className="w-full max-h-[600px] object-contain"
              onLoad={updateSize}
              draggable={false}
            />
          </div>

          {/* SVG overlay */}
          {imgSize.width > 0 && (
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ cursor: dragging !== null ? "grabbing" : "crosshair" }}
            >
              {/* Polygon fill */}
              <polygon
                points={svgPoints}
                fill="rgba(197,160,89,0.15)"
                stroke="rgb(197,160,89)"
                strokeWidth="2"
                strokeDasharray="6,3"
              />
              {/* Draggable handles */}
              {polygon.map((p, i) => {
                const px = toPixel(p);
                return (
                  <g key={i}>
                    {/* Larger hit area */}
                    <circle
                      cx={px.x}
                      cy={px.y}
                      r="16"
                      fill="transparent"
                      style={{ cursor: "grab" }}
                      onMouseDown={handleMouseDown(i)}
                    />
                    {/* Visible handle */}
                    <circle
                      cx={px.x}
                      cy={px.y}
                      r="8"
                      fill="white"
                      stroke={dragging === i ? "rgb(197,160,89)" : "rgb(40,40,40)"}
                      strokeWidth={dragging === i ? "3" : "2"}
                      style={{ cursor: "grab", pointerEvents: "none" }}
                    />
                    {/* Index label */}
                    <text
                      x={px.x}
                      y={px.y + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="8"
                      fill={dragging === i ? "rgb(197,160,89)" : "rgb(40,40,40)"}
                      fontWeight="bold"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Sidebar */}
        <aside className="bg-card p-6 border border-brand-900/5 self-start space-y-6">
          {/* Zoom Controls */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-3">Zoom</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                id="editor-zoom-in"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="border border-brand-900/10 py-2.5 text-[11px] uppercase tracking-[0.2em] hover:border-accent hover:text-accent transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ZoomIn className="size-3.5" /> Zoom In
              </button>
               <button
                id="editor-zoom-out"
                onClick={() => setZoom((z) => {
                  const nextZ = Math.max(1, z - 0.25);
                  if (nextZ === 1) setPanOffset({ x: 0, y: 0 });
                  return nextZ;
                })}
                className="border border-brand-900/10 py-2.5 text-[11px] uppercase tracking-[0.2em] hover:border-accent hover:text-accent transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ZoomOut className="size-3.5" /> Zoom Out
              </button>
            </div>
          </div>

          {/* Polygon Controls */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-3">Polygon</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                id="editor-add-point"
                onClick={addPoint}
                disabled={polygon.length >= MAX_POINTS}
                className="border border-brand-900/10 py-2.5 text-[11px] uppercase tracking-[0.2em] hover:border-accent hover:text-accent transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="size-3.5" /> Point
              </button>
              <button
                id="editor-reset"
                onClick={() => setPolygon([...initialPolygon])}
                className="border border-brand-900/10 py-2.5 text-[11px] uppercase tracking-[0.2em] hover:border-accent hover:text-accent transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="size-3.5" /> Reset
              </button>
            </div>
          </div>

          {/* Polygon info */}
          <div className="pt-2 border-t border-brand-900/5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-2">Status</p>
            <p className="text-sm font-medium">{polygon.length} corner points</p>
            <p className="text-[11px] text-brand-900/50 mt-1 leading-relaxed">
              Drag handles to refine. Add more points for irregular walls.
            </p>
          </div>

          {/* Coordinate readout */}
          <div className="border-t border-brand-900/5 pt-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mb-2">Points</p>
            <div className="space-y-1">
              {polygon.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-brand-900/60">
                  <span className="text-accent font-bold w-4">{i + 1}</span>
                  <span>x:{(p.x * 100).toFixed(0)}% y:{(p.y * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          id="editor-apply-boundaries"
          onClick={onApply}
          disabled={polygon.length < MIN_POINTS}
          className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="size-3.5" /> Apply Boundaries
        </button>
        <BackBtn onClick={onBack} />
      </div>
    </section>
  );
}

/* ────────── Step 2d: AI Style Selection ────────── */
const aiStyles: AiStyle[] = [
  { id: "modern-living", name: "Modern Living Room", image: "/src/assets/mockup-living.jpg" },
  { id: "luxury-living", name: "Luxury Living Room", image: "/src/assets/mockup-living.jpg" },
  { id: "scandi-living", name: "Scandinavian Living Room", image: "/src/assets/mockup-living.jpg" },
  { id: "min-bedroom", name: "Minimalist Bedroom", image: "/src/assets/mockup-bedroom.jpg" },
  { id: "lux-bedroom", name: "Luxury Bedroom", image: "/src/assets/mockup-bedroom.jpg" },
  { id: "office", name: "Home Office", image: "/src/assets/mockup-office.jpg" },
  { id: "cafe", name: "Cafe", image: "/src/assets/mockup-cafe.jpg" },
  { id: "restaurant", name: "Restaurant", image: "/src/assets/mockup-restaurant.jpg" },
  { id: "hotel", name: "Hotel Suite", image: "/src/assets/mockup-bedroom.jpg" },
];

function AiStyleSelect({
  selected, onPick, onContinue, onBack,
}: {
  selected: AiStyle | null;
  onPick: (s: AiStyle) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <section>
      <Eyebrow>Step Two · AI</Eyebrow>
      <Heading>Choose a Room Style</Heading>
      <p className="text-brand-900/60 max-w-md mb-10">
        Pick a setting and our AI will compose a fresh room scene with your wallpaper applied.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {aiStyles.map((s) => {
          const active = selected?.id === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className={
                "group text-left transition-all cursor-pointer " +
                (active ? "outline outline-2 outline-accent outline-offset-4" : "")
              }
            >
              <div className="aspect-[4/3] overflow-hidden bg-brand-100">
                <img src={s.image} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-base font-medium">{s.name}</p>
                {active && <span className="text-[10px] uppercase tracking-[0.2em] text-accent">Selected</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3 mt-10">
        <button
          onClick={onContinue}
          disabled={!selected}
          className="bg-brand-900 text-brand-50 px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-2"
        >
          <Sparkles className="size-3.5" /> Continue
        </button>
        <BackBtn onClick={onBack} className="self-center" />
      </div>
    </section>
  );
}

/* ────────── Step 3 (AI/Upload): Loading ────────── */
const MOCKUP_MESSAGES = [
  "Detecting main wall",
  "Applying wallpaper pattern",
  "Matching perspective",
  "Preserving room details",
  "Finalizing preview",
];

const UPLOAD_MESSAGES = [
  "Reading selected wall",
  "Preparing wallpaper pattern",
  "Matching wall boundaries",
  "Applying wallpaper",
  "Finalizing preview",
];

interface AiLoadingProps {
  isUploadedRoom?: boolean;
  onDone?: () => void;
  error?: string | null;
  retryCount?: number;
  onRetry?: () => void;
  onBack?: () => void;
}

function AiLoading({ isUploadedRoom = false, onDone, error, retryCount = 0, onRetry, onBack }: AiLoadingProps) {
  const [progress, setProgress] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const messages = isUploadedRoom ? UPLOAD_MESSAGES : MOCKUP_MESSAGES;

  useEffect(() => {
    if (error) return;
    if (onDone) {
      const start = Date.now();
      const duration = 5000;
      const tick = setInterval(() => {
        const p = Math.min(100, ((Date.now() - start) / duration) * 100);
        setProgress(p);
        if (p >= 100) { clearInterval(tick); setTimeout(onDone, 350); }
      }, 80);
      return () => clearInterval(tick);
    } else {
      const start = Date.now();
      const duration = 20000;
      const tick = setInterval(() => {
        const p = Math.min(95, ((Date.now() - start) / duration) * 100);
        setProgress(p);
      }, 100);
      return () => clearInterval(tick);
    }
  }, [onDone, error]);

  useEffect(() => {
    if (error) return;
    const rot = setInterval(() => setMsgIdx((i) => (i + 1) % messages.length), 2000);
    return () => clearInterval(rot);
  }, [error, messages.length]);

  if (error) {
    return (
      <section className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 max-w-xl mx-auto">
        <div className="relative size-20 mb-8 bg-red-500/10 text-red-500 rounded-full grid place-items-center">
          <X className="size-10" />
        </div>
        <Eyebrow>Generation Failed</Eyebrow>
        <h1 className="font-serif text-3xl md:text-4xl mt-3 mb-6 font-medium">Visualization Error</h1>
        <p className="text-brand-900/70 text-base mb-8 leading-relaxed">{error}</p>
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          {retryCount === 0 && onRetry && (
            <button
              onClick={onRetry}
              className="bg-brand-900 text-brand-50 px-8 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer w-full sm:w-auto font-medium"
            >
              Retry Generation
            </button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="border border-brand-900/15 px-8 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card transition-colors cursor-pointer w-full sm:w-auto font-medium"
            >
              Go Back
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <div className="relative size-24 mb-10">
        <div className="absolute inset-0 rounded-full border border-brand-900/10" />
        <div className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <div className="absolute inset-0 grid place-items-center">
          <Sparkles className="size-7 text-accent" />
        </div>
      </div>
      <Eyebrow>Generating</Eyebrow>
      <h1 className="font-serif text-5xl md:text-6xl mt-3 mb-6 font-medium">Generating Your Visualization</h1>
      <p className="font-serif text-2xl italic text-brand-900/70 mb-10 transition-opacity">
        {messages[msgIdx]}…
      </p>
      <div className="w-full max-w-md h-px bg-brand-900/10 overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-brand-900/40 mt-4">
        This may take 10–30 seconds.
      </p>
    </section>
  );
}

/* ────────── Step 2b: Mockup Gallery ────────── */
interface MockupGalleryProps {
  mockups: Mockup[];
  categories: string[];
  onPick: (m: Mockup) => void;
  onBack: () => void;
}

function MockupGallery({ mockups, categories, onPick, onBack }: MockupGalleryProps) {
  const [cat, setCat] = useState("All");
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const list = mockups.filter((m) => cat === "All" || m.category === cat);

  return (
    <section>
      <Eyebrow>Step Two</Eyebrow>
      <Heading>Pick a room.</Heading>

      <div className="flex gap-1 mt-10 mb-10 overflow-x-auto border-b border-brand-900/5 scrollbar-none">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={
              "px-4 py-3 text-[11px] uppercase tracking-[0.2em] border-b-2 -mb-px whitespace-nowrap transition-all duration-300 cursor-pointer " +
              (cat === c
                ? "border-brand-900 text-brand-900 font-semibold"
                : "border-transparent text-brand-900/40 hover:text-brand-900")
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {list.map((m) => (
          <div key={m.id} className="group flex flex-col text-left">
            <div className="relative aspect-[16/9] overflow-hidden bg-brand-100 border border-brand-900/5 shadow-sm">
              <img src={m.image} alt={m.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" />
              <div className="absolute inset-0 bg-brand-950/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3 z-10">
                <button type="button" onClick={() => setPreviewImg(m.image)} className="border border-brand-50/20 text-brand-50 hover:bg-brand-50 hover:text-brand-950 px-4 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold transition-all duration-300 cursor-pointer">
                  Preview
                </button>
                <button type="button" onClick={() => onPick(m)} className="bg-brand-50 text-brand-950 hover:bg-accent hover:text-brand-50 px-4 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold transition-all duration-300 cursor-pointer">
                  Select
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-col">
              <span className="text-[9px] uppercase tracking-[0.22em] text-accent/80 font-medium">{m.category}</span>
              <h4 className="font-serif text-lg text-brand-900/95 mt-1 font-medium italic">{m.name}</h4>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14"><BackBtn onClick={onBack} /></div>

      {previewImg && (
        <div
          className="fixed inset-0 z-50 bg-brand-950/70 backdrop-blur-md flex items-center justify-center p-4 md:p-10 transition-all animate-in fade-in duration-300"
          onClick={() => setPreviewImg(null)}
        >
          <button type="button" className="absolute top-6 right-6 text-brand-50 hover:text-accent text-[11px] uppercase tracking-[0.22em] z-50 cursor-pointer" onClick={() => setPreviewImg(null)}>
            ✕ Close Preview
          </button>
          <div className="relative max-w-5xl max-h-[80vh] w-full overflow-hidden bg-card border border-white/10 shadow-2xl flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img src={previewImg} alt="Room preview" className="w-full h-auto max-h-[80vh] object-contain" />
          </div>
        </div>
      )}
    </section>
  );
}

/* ────────── Download helper ────────── */
const downloadImage = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
};

/* ────────── Step 4: Result ────────── */
function ResultView({
  wallpaper,
  mockup,
  source,
  aiStyle,
  resultImageUrl,
  uploadedLocalUrl,
  currentPolygon,
  wallDetectionConfidence,
  onAnother,
  onAnotherAi,
  onCreateVariation,
  onRecreate,
  onUseManualOverlay,
  debugInfo,
  savingResult,
  maskThreshold = 105,
  onThresholdChange,
  onSaveAdjustedImage,
  savingAdjustments = false,
}: {
  wallpaper: Wallpaper;
  mockup: Mockup | null;
  source: ResultSource;
  aiStyle: AiStyle | null;
  resultImageUrl: string;
  uploadedLocalUrl: string | null;
  currentPolygon: NormalizedPoint[];
  wallDetectionConfidence: number;
  onAnother: () => void;
  onAnotherAi: () => void;
  onCreateVariation: () => void;
  onRecreate?: () => void;
  onUseManualOverlay: () => void;
  debugInfo: any;
  savingResult: boolean;
  maskThreshold?: number;
  onThresholdChange?: (val: number) => void;
  onSaveAdjustedImage?: () => void;
  savingAdjustments?: boolean;
}) {
  const sourceLabel =
    source === "ai_generated" && aiStyle
      ? `${aiStyle.name} · AI Generated`
      : source === "uploaded_room"
        ? "Uploaded Room"
        : mockup
          ? mockup.name
          : "Your Room";

  const isDebugMode = import.meta.env.DEV || localStorage.getItem("AI_DEBUG") === "true";

  return (
    <section>
      <div className="mb-10">
        <Eyebrow>Result</Eyebrow>
        <Heading>Your visualization.</Heading>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        <div className="relative">
          <img
            src={resultImageUrl || resultPreview}
            alt="Final visualization"
            className="w-full max-h-[75vh] object-cover shadow-2xl outline-1 -outline-offset-1 outline-black/10"
          />
          <div className="absolute bottom-6 left-6 bg-card/95 backdrop-blur-md p-4 shadow-xl border border-white/20 flex items-center gap-4 max-w-xs">
            <img src={wallpaper.image} alt="" className="size-14 object-cover" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Applied</p>
              <p className="text-sm font-semibold">{wallpaper.title}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40 mt-0.5">
                {wallpaper.code} · {sourceLabel}
              </p>
            </div>
          </div>

          {/* Uploaded Room badge */}
          {source === "uploaded_room" && (
            <div className="absolute top-4 right-4 bg-accent/90 backdrop-blur-md px-3 py-1.5 flex items-center gap-1.5 shadow-lg">
              <Upload className="size-3 text-brand-950" />
              <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-brand-950">
                Uploaded Room
              </span>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-32 space-y-5">
          <SharePanel title="Share Visualization" shareUrl={resultImageUrl || resultPreview} />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => downloadImage(resultImageUrl || resultPreview, `${wallpaper.code}_visualization.png`)}
              className="inline-flex items-center justify-center gap-2 border border-brand-900/15 px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] hover:bg-card cursor-pointer font-medium"
            >
              Download PNG
            </button>
            <button
              onClick={() => downloadImage(resultImageUrl || resultPreview, `${wallpaper.code}_visualization.jpg`)}
              className="inline-flex items-center justify-center gap-2 border border-brand-900/15 px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] hover:bg-card cursor-pointer font-medium"
            >
              Download JPG
            </button>
          </div>

          {/* Feedback panel for ready mockup */}
          {source === "ready_mockup" && mockup && (
            <div className="p-5 bg-brand-50 border border-brand-900/10 space-y-4">
              <h4 className="font-serif text-base font-semibold italic text-brand-950">Does this look right?</h4>
              <p className="text-xs text-brand-900/60 leading-relaxed">
                The wallpaper is applied using high-precision canvas compositing. If the result needs adjustment, you can reapply with updated wall coordinates.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => toast.success("Feedback submitted. Thank you!")}
                  className="bg-green-700 text-white hover:bg-green-800 px-4 py-2 text-[9px] uppercase tracking-[0.2em] font-semibold transition-all cursor-pointer"
                >
                  ✓ Looks Great
                </button>
                <button
                  type="button"
                  disabled={savingResult}
                  onClick={onRecreate}
                  className="border border-brand-900/20 bg-brand-900 text-brand-50 hover:bg-brand-800 px-4 py-2 text-[9px] uppercase tracking-[0.2em] font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  ↻ Reapply
                </button>
                <button
                  type="button"
                  disabled={savingResult}
                  onClick={onUseManualOverlay}
                  className="bg-accent text-brand-950 hover:bg-accent/80 hover:text-brand-900 px-4 py-2 text-[9px] uppercase tracking-[0.2em] font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  ↺ Recomposite
                </button>
              </div>
            </div>
          )}

          {/* Adjustment panel for uploaded room */}
          {source === "uploaded_room" && onThresholdChange && (
            <div className="p-5 bg-brand-50 border border-brand-900/10 space-y-4">
              <h4 className="font-serif text-base font-semibold italic text-brand-950">Fine-tune Coverage</h4>
              <p className="text-xs text-brand-900/60 leading-relaxed">
                If the wallpaper doesn't fully cover the wall, drag the slider to increase the tolerance. This expands coverage over shadows and textured areas of the wall.
              </p>
              
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase tracking-[0.1em] text-brand-900/60 font-medium">
                  <span>Wall Coverage Tolerance</span>
                  <span className="font-bold">{maskThreshold}</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="180"
                  value={maskThreshold}
                  onChange={(e) => onThresholdChange(Number(e.target.value))}
                  className="w-full h-1 bg-brand-900/10 accent-brand-900 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-brand-900/40">
                  <span>Less Coverage (Strict)</span>
                  <span>More Coverage (Tolerant)</span>
                </div>
              </div>

              {onSaveAdjustedImage && (
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={savingAdjustments}
                    onClick={onSaveAdjustedImage}
                    className="w-full bg-brand-900 text-brand-50 hover:bg-brand-800 disabled:opacity-50 py-3 text-[10px] uppercase tracking-[0.2em] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {savingAdjustments ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Saving Changes...
                      </>
                    ) : (
                      "✓ Save Adjustments"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CTA buttons */}
          <div className="flex flex-col gap-2">
            <button
              id="result-create-variation-btn"
              onClick={onCreateVariation}
              disabled={savingResult}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-900 text-brand-50 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer font-medium disabled:opacity-50"
            >
              <Sparkles className="size-3.5" /> Create Another Variation
            </button>
            <button
              onClick={onAnother}
              className="w-full border border-brand-900/15 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card cursor-pointer font-medium"
            >
              Select New Wallpaper
            </button>
            <Link
              to="/wallpapers"
              className="w-full text-center border border-brand-900/15 px-6 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-card font-medium"
            >
              Browse Collection
            </Link>
          </div>

          {/* AI Debug Panel */}
          {isDebugMode && debugInfo && (
            <div className="p-6 border border-dashed border-red-500/35 bg-card text-left space-y-4 rounded shadow-sm">
              <span className="text-[9px] uppercase tracking-[0.22em] text-red-500 font-bold">AI Debug</span>
              <div className="grid grid-cols-2 gap-4 text-[11px]">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Model</p>
                  <p className="font-mono break-all">{debugInfo.model_used || "N/A"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Payload Type</p>
                  <p className="font-mono">{debugInfo.payload_type || "N/A"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Input Mode</p>
                  <p className="font-mono">{debugInfo.input_type || "N/A"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Prompt Version</p>
                  <p className="font-mono">{debugInfo.prompt_version || "N/A"}</p>
                </div>
              </div>
              <div className="border-t border-brand-900/5 pt-4 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-brand-900/40">Reference Images</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <span className="text-[8px] text-brand-900/50 block truncate">Wallpaper</span>
                    <img src={debugInfo.wallpaper_url || wallpaper.image} className="aspect-square object-cover border border-brand-900/10 w-full" alt="Wallpaper Ref" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] text-brand-900/50 block truncate">Room</span>
                    <img src={debugInfo.mockup_url || uploadedLocalUrl || mockup?.image} className="aspect-square object-cover border border-brand-900/10 w-full" alt="Room Ref" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] text-brand-900/50 block truncate">Result</span>
                    <img src={resultImageUrl || resultPreview} className="aspect-square object-cover border border-brand-900/10 w-full" alt="Result" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ────────── Helpers ────────── */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
      {children}
    </span>
  );
}
function Heading({ children }: { children: React.ReactNode }) {
  return <h1 className="font-serif text-5xl md:text-6xl mt-3 mb-4">{children}</h1>;
}
function BackBtn({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={
        "text-[11px] uppercase tracking-[0.2em] text-brand-900/50 hover:text-accent cursor-pointer " +
        className
      }
    >
      ← Back
    </button>
  );
}
