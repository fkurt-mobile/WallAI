import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { useProfile } from "@/hooks/use-profile";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ProfileService, CompanyService, AuthService } from "@/lib/services";
import {
  User,
  Building,
  Shield,
  BarChart3,
  CreditCard,
  Save,
  RefreshCw,
  Camera,
  Calendar,
  Check,
  AlertCircle,
  Clock,
  Images,
  Sparkles,
  Home,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import Cropper from "react-easy-crop";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Settings — Murra" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const [activeTab, setActiveTab] = useState<
    "profile" | "company" | "security" | "billing"
  >("profile");

  // Crop states
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropImageFile, setCropImageFile] = useState<File | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Sync data to state
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      if (profile.companies) {
        setCompanyName(profile.companies.name || "");
        setCompanySlug(profile.companies.slug || "");
      }
    }
  }, [profile]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: () => ProfileService.updateProfile(fullName),
    onSuccess: () => {
      toast.success("Profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
    onError: (err: any) => {
      toast.error("Failed to update profile: " + err.message);
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: () => {
      if (!profile?.company_id) throw new Error("No company linked to profile");
      return CompanyService.updateCompany(profile.company_id, companyName, companySlug);
    },
    onSuccess: () => {
      toast.success("Company updated successfully");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
    onError: (err: any) => {
      toast.error("Failed to update company: " + err.message);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.email) throw new Error("No email found");

      // Re-authenticate user to confirm current password
      const { error: signInError } = await supabaseAuthSignIn(profile.email, currentPassword);
      if (signInError) {
        throw new Error("Incorrect current password. Please try again.");
      }

      return AuthService.changePassword(newPassword);
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to change password");
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!profile?.id) throw new Error("No profile");
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { supabase } = await import("@/integrations/supabase/client");

      // We upload to wallpaper-images bucket as a general public bucket
      const bucket = "wallpaper-images"; 

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;
      
      return data.publicUrl;
    },
    onSuccess: () => {
      toast.success("Profile photo updated");
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    },
    onError: (err: any) => {
      toast.error("Failed to upload photo: " + err.message);
    }
  });

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCropImageFile(file);
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setCropImageSrc(reader.result as string);
        setIsCropOpen(true);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
      });
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleSaveCroppedImage = async () => {
    if (!cropImageSrc || !croppedAreaPixels || !cropImageFile) return;

    try {
      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      const fileExt = cropImageFile.name.split('.').pop() || 'jpg';
      const croppedFile = new File([croppedBlob], `cropped-avatar.${fileExt}`, {
        type: croppedBlob.type || "image/jpeg",
      });

      uploadAvatarMutation.mutate(croppedFile);
      setIsCropOpen(false);
      setCropImageSrc(null);
      setCropImageFile(null);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to crop image: " + e.message);
    }
  };

  if (profileLoading) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
          <p className="text-center font-serif text-2xl italic py-20 text-brand-900/40">
            Loading settings...
          </p>
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-14">
          <div className="text-center py-20">
            <p className="font-serif text-2xl italic text-destructive mb-4">Not authenticated</p>
            <p className="text-sm text-brand-900/60">Please sign in to access settings.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // Helper helper to handle password auth in client side
  async function supabaseAuthSignIn(email: string, pass: string) {
    const { supabase } = await import("@/integrations/supabase/client");
    return supabase.auth.signInWithPassword({ email, password: pass });
  }

  const isCompanyAdmin = profile.role === "company_admin" || profile.role === "platform_admin";
  const avatarLetter = (
    fullName.trim() ? fullName.trim()[0] : profile.email ? profile.email[0] : "U"
  ).toUpperCase();
  const roleDisplay =
    profile.role === "platform_admin"
      ? "Platform Admin"
      : profile.role === "company_admin"
        ? "Company Admin"
        : "Company User";

  const memberSinceStr = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "June 2026";

  const companyCreatedStr = profile.companies?.created_at
    ? new Date(profile.companies.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "N/A";

  const handleResetProfile = () => {
    setFullName(profile.full_name || "");
    toast.info("Profile form reset");
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full Name cannot be empty.");
      return;
    }
    updateProfileMutation.mutate();
  };

  const handleCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error("Company Name cannot be empty.");
      return;
    }
    if (!companySlug.trim()) {
      toast.error("Company Slug cannot be empty.");
      return;
    }
    updateCompanyMutation.mutate();
  };

  const handleSecuritySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Current Password is required.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirm password do not match.");
      return;
    }
    changePasswordMutation.mutate();
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-14">
        {/* Page Header */}
        <div className="mb-14">
          <span className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium">
            Workspace
          </span>
          <h1 className="font-serif text-5xl md:text-6xl mt-3">Settings.</h1>
        </div>

        {/* Profile Page Header Card */}
        <div className="bg-card border border-brand-900/8 p-8 flex flex-col sm:flex-row items-center gap-6 mb-12 shadow-sm">
          <div 
            onClick={handleAvatarClick}
            className="size-20 relative group rounded-none bg-gilded text-brand-50 flex items-center justify-center font-serif text-3xl shrink-0 outline outline-1 outline-offset-4 outline-brand-900/10 cursor-pointer overflow-hidden"
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              avatarLetter
            )}
            <div className="absolute inset-0 bg-brand-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
               {uploadAvatarMutation.isPending ? <RefreshCw className="size-6 animate-spin text-white" /> : <Camera className="size-6 text-white" />}
            </div>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleAvatarChange} 
            accept="image/*" 
            className="hidden" 
          />
          <div className="text-center sm:text-left flex-1 min-w-0">
            <h2 className="font-serif text-3xl text-brand-900 leading-tight">
              {fullName || profile.email}
            </h2>
            <p className="text-sm text-brand-900/50 mt-1 truncate">{profile.email}</p>
            <p className="text-xs text-brand-900/40 mt-1 uppercase tracking-widest">
              {profile.companies?.name || "No Company Account"}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-center sm:items-end gap-2">
            <span className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] bg-brand-900 text-brand-50">
              {roleDisplay}
            </span>
            <span className="text-[10px] text-brand-900/40 tracking-[0.05em]">
              Joined {memberSinceStr}
            </span>
          </div>
        </div>

        {/* Tab Navigation Layout */}
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          {/* Navigation Sidebar */}
          <nav className="lg:col-span-3 flex lg:flex-col gap-1 overflow-x-auto border-b lg:border-b-0 lg:border-r border-brand-900/5 pb-4 lg:pb-0">
            <TabButton
              active={activeTab === "profile"}
              onClick={() => setActiveTab("profile")}
              label="Profile Information"
              icon={User}
            />
            <TabButton
              active={activeTab === "company"}
              onClick={() => setActiveTab("company")}
              label="Company Details"
              icon={Building}
            />
            <TabButton
              active={activeTab === "security"}
              onClick={() => setActiveTab("security")}
              label="Security"
              icon={Shield}
            />

            <TabButton
              active={activeTab === "billing"}
              onClick={() => setActiveTab("billing")}
              label="Billing"
              icon={CreditCard}
            />
          </nav>

          {/* Settings Tab Contents */}
          <div className="lg:col-span-9 bg-card border border-brand-900/8 p-8 min-h-[400px] shadow-sm">
            {/* PROFILE TAB */}
            {activeTab === "profile" && (
              <form onSubmit={handleProfileSubmit} className="space-y-8">
                <div>
                  <h3 className="font-serif text-3xl italic text-brand-900 mb-2">
                    Profile Information
                  </h3>
                  <p className="text-xs text-brand-900/55">
                    Manage your personal account details and display name.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/50 mb-2 block">
                      Full Name
                    </span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-transparent border-b border-brand-900/15 py-2.5 text-base focus:outline-none focus:border-accent transition-colors font-sans"
                      placeholder="Jane Doe"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/35 mb-2 block select-none">
                      Email Address
                    </span>
                    <input
                      type="email"
                      value={profile.email || ""}
                      readOnly
                      disabled
                      className="w-full bg-transparent border-b border-brand-900/5 py-2.5 text-base text-brand-900/40 cursor-not-allowed select-none font-sans outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/35 mb-2 block select-none">
                      Workspace Role
                    </span>
                    <input
                      type="text"
                      value={roleDisplay}
                      readOnly
                      disabled
                      className="w-full bg-transparent border-b border-brand-900/5 py-2.5 text-base text-brand-900/40 cursor-not-allowed select-none font-sans outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/35 mb-2 block select-none">
                      Member Since
                    </span>
                    <input
                      type="text"
                      value={memberSinceStr}
                      readOnly
                      disabled
                      className="w-full bg-transparent border-b border-brand-900/5 py-2.5 text-base text-brand-900/40 cursor-not-allowed select-none font-sans outline-none"
                    />
                  </label>
                </div>

                <div className="flex gap-3 pt-4 border-t border-brand-900/5">
                  <button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    className="bg-brand-900 text-brand-50 px-6 py-3 text-[10px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {updateProfileMutation.isPending ? (
                      <>
                        <RefreshCw className="size-3 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Save className="size-3" /> Save Changes
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetProfile}
                    className="border border-brand-900/15 bg-transparent px-6 py-3 text-[10px] uppercase tracking-[0.2em] hover:bg-brand-900/5 transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </form>
            )}

            {/* COMPANY TAB */}
            {activeTab === "company" && (
              <form onSubmit={handleCompanySubmit} className="space-y-8">
                <div>
                  <h3 className="font-serif text-3xl italic text-brand-900 mb-2">
                    Company Information
                  </h3>
                  <p className="text-xs text-brand-900/55">
                    {isCompanyAdmin
                      ? "Manage wallpaper company credentials, routing slug, and workspace plan."
                      : "View company profile settings. Modifications are restricted to Company Admins."}
                  </p>
                </div>

                {!isCompanyAdmin && (
                  <div className="bg-brand-900/5 border border-brand-900/10 p-4 flex gap-3 text-brand-900/70 text-xs items-center">
                    <AlertCircle className="size-4 text-accent shrink-0" />
                    <span>
                      You are logged in as a <strong>Company User</strong>. Contact your
                      administrator to change company details.
                    </span>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/50 mb-2 block">
                      Company Name
                    </span>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={!isCompanyAdmin}
                      className={
                        "w-full bg-transparent border-b py-2.5 text-base focus:outline-none focus:border-accent transition-colors font-sans " +
                        (isCompanyAdmin
                          ? "border-brand-900/15 text-brand-900"
                          : "border-brand-900/5 text-brand-900/40 cursor-not-allowed")
                      }
                      placeholder="Heim Studio"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/50 mb-2 block">
                      Company Slug (URL Identifier)
                    </span>
                    <input
                      type="text"
                      value={companySlug}
                      onChange={(e) =>
                        setCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                      }
                      disabled={!isCompanyAdmin}
                      className={
                        "w-full bg-transparent border-b py-2.5 text-base focus:outline-none focus:border-accent transition-colors font-sans " +
                        (isCompanyAdmin
                          ? "border-brand-900/15 text-brand-900"
                          : "border-brand-900/5 text-brand-900/40 cursor-not-allowed")
                      }
                      placeholder="heim-studio"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/35 mb-2 block select-none">
                      Created Date
                    </span>
                    <input
                      type="text"
                      value={companyCreatedStr}
                      readOnly
                      disabled
                      className="w-full bg-transparent border-b border-brand-900/5 py-2.5 text-base text-brand-900/40 cursor-not-allowed select-none font-sans outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/35 mb-2 block select-none">
                      Subscription Plan
                    </span>
                    <input
                      type="text"
                      value={(profile.companies?.subscription_plan || "Starter").toUpperCase()}
                      readOnly
                      disabled
                      className="w-full bg-transparent border-b border-brand-900/5 py-2.5 text-base text-brand-900/40 cursor-not-allowed select-none font-sans uppercase outline-none"
                    />
                  </label>
                </div>

                {isCompanyAdmin && (
                  <div className="flex gap-3 pt-4 border-t border-brand-900/5">
                    <button
                      type="submit"
                      disabled={updateCompanyMutation.isPending}
                      className="bg-brand-900 text-brand-50 px-6 py-3 text-[10px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                    >
                      {updateCompanyMutation.isPending ? (
                        <>
                          <RefreshCw className="size-3 animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <Save className="size-3" /> Save Company
                        </>
                      )}
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* SECURITY TAB */}
            {activeTab === "security" && (
              <form onSubmit={handleSecuritySubmit} className="space-y-8">
                <div>
                  <h3 className="font-serif text-3xl italic text-brand-900 mb-2">Security</h3>
                  <p className="text-xs text-brand-900/55">
                    Update your password to keep your account secure.
                  </p>
                </div>

                <div className="grid gap-6 max-w-md">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/50 mb-2 block">
                      Current Password
                    </span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-transparent border-b border-brand-900/15 py-2.5 text-base focus:outline-none focus:border-accent transition-colors font-sans"
                      placeholder="••••••••"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/50 mb-2 block">
                      New Password
                    </span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-transparent border-b border-brand-900/15 py-2.5 text-base focus:outline-none focus:border-accent transition-colors font-sans"
                      placeholder="••••••••"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/50 mb-2 block">
                      Confirm New Password
                    </span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-transparent border-b border-brand-900/15 py-2.5 text-base focus:outline-none focus:border-accent transition-colors font-sans"
                      placeholder="••••••••"
                      required
                    />
                  </label>
                </div>

                <div className="flex gap-3 pt-4 border-t border-brand-900/5">
                  <button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    className="bg-brand-900 text-brand-50 px-6 py-3 text-[10px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {changePasswordMutation.isPending ? (
                      <>
                        <RefreshCw className="size-3 animate-spin" /> Updating...
                      </>
                    ) : (
                      <>
                        <Shield className="size-3" /> Change Password
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}



            {/* BILLING TAB */}
            {activeTab === "billing" && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-serif text-3xl italic text-brand-900 mb-2">
                    Billing & Subscription
                  </h3>
                  <p className="text-xs text-brand-900/55">
                    View your current subscription plan and billing cycles.
                  </p>
                </div>

                <div className="border border-brand-900/8 bg-brand-50/10 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <span className="text-[9px] uppercase tracking-[0.2em] text-brand-900/40">
                      Current Plan
                    </span>
                    <p className="font-serif text-3xl italic mt-1 text-brand-900">Starter Plan</p>
                    <p className="text-xs text-brand-900/50 mt-1">
                      Free tier for independent designers.
                    </p>
                  </div>
                  <span className="px-3.5 py-1.5 text-[10px] uppercase tracking-[0.2em] border border-brand-900/15 text-brand-900 font-semibold bg-card select-none">
                    Active
                  </span>
                </div>

                <div className="bg-brand-900/5 border border-brand-900/8 p-6 flex gap-4 items-start">
                  <AlertCircle className="size-5 text-accent shrink-0 mt-0.5" />
                  <div className="text-xs text-brand-900/70">
                    <p className="font-semibold text-brand-900">Billing Coming Soon</p>
                    <p className="mt-1.5 leading-relaxed">
                      Billing management, commercial licensing options, and stripe integrations will
                      be available in a future release.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isCropOpen} onOpenChange={(open) => {
        setIsCropOpen(open);
        if (!open) {
          setCropImageSrc(null);
          setCropImageFile(null);
        }
      }}>
        <DialogContent className="sm:max-w-[450px] bg-card border border-brand-900/10">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-brand-900">Crop Profile Photo</DialogTitle>
            <DialogDescription className="text-xs text-brand-900/60">
              Drag to reposition and use the slider to zoom.
            </DialogDescription>
          </DialogHeader>
          <div className="relative w-full h-[300px] bg-brand-950/20 overflow-hidden">
            {cropImageSrc && (
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            )}
          </div>
          <div className="space-y-2 py-4">
            <span className="text-[10px] uppercase tracking-[0.2em] text-brand-900/50 block">Zoom</span>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={(value) => setZoom(value[0])}
              className="w-full"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setIsCropOpen(false)}
              className="border border-brand-900/15 bg-transparent px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] hover:bg-brand-900/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCroppedImage}
              disabled={uploadAvatarMutation.isPending}
              className="bg-brand-900 text-brand-50 px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] hover:bg-brand-800 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {uploadAvatarMutation.isPending ? (
                <>
                  <RefreshCw className="size-3 animate-spin" /> Saving...
                </>
              ) : (
                "Apply Crop"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// Helper to crop image
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  image.crossOrigin = "anonymous";

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No 2d context");
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas is empty"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.95);
  });
}

// Helper Tab Button Component
function TabButton({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "settings-tab w-full text-xs uppercase tracking-[0.16em] transition-all duration-300 font-medium whitespace-nowrap cursor-pointer " +
        (active
          ? "active font-semibold"
          : "text-brand-900/50 hover:text-brand-900 hover:bg-brand-50")
      }
    >
      <Icon className={"size-4 shrink-0 " + (active ? "text-accent" : "text-brand-900/40")} />
      <span>{label}</span>
    </button>
  );
}

// Recharts Custom line chart component
const CustomChart = ({ data }: { data: { date: string; count: number }[] }) => {
  return (
    <div className="h-60 w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="oklch(0.165 0.005 60 / 5%)"
          />
          <XAxis
            dataKey="date"
            stroke="oklch(0.165 0.005 60 / 40%)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            stroke="oklch(0.165 0.005 60 / 40%)"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            dx={-5}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid oklch(0.165 0.005 60 / 10%)",
              fontSize: "11px",
              fontFamily: "Inter, sans-serif",
            }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="oklch(0.745 0.085 75)"
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: "oklch(0.745 0.085 75)" }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
