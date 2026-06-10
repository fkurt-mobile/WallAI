import swatch1 from "@/assets/swatch-1.jpg";
import swatch2 from "@/assets/swatch-2.jpg";
import swatch3 from "@/assets/swatch-3.jpg";
import swatch4 from "@/assets/swatch-4.jpg";
import swatch5 from "@/assets/swatch-5.jpg";
import swatch6 from "@/assets/swatch-6.jpg";

import mockupLiving from "@/assets/mockup-living.jpg";
import mockupBedroom from "@/assets/mockup-bedroom.jpg";
import mockupOffice from "@/assets/mockup-office.jpg";
import mockupCafe from "@/assets/mockup-cafe.jpg";
import mockupRestaurant from "@/assets/mockup-restaurant.jpg";

export interface Wallpaper {
  id: string;
  code: string;
  title: string;
  category: string;
  image: string;
  tint: string;
}

export const wallpapers: Wallpaper[] = [
  {
    id: "ef-04",
    code: "EF-04-GRN",
    title: "Ethereal Flora",
    category: "Botanical",
    image: swatch1,
    tint: "#1f3a25",
  },
  {
    id: "tc-22",
    code: "TC-22-CLY",
    title: "Clay Hearth",
    category: "Plaster",
    image: swatch2,
    tint: "#c97a4c",
  },
  {
    id: "ln-11",
    code: "LN-11-SND",
    title: "Sand Drift",
    category: "Linen",
    image: swatch3,
    tint: "#efe3cd",
  },
  {
    id: "ad-08",
    code: "AD-08-MAR",
    title: "Marine Deco",
    category: "Geometric",
    image: swatch4,
    tint: "#7aabb5",
  },
  {
    id: "vs-03",
    code: "VS-03-CRM",
    title: "Ivory Line",
    category: "Stripe",
    image: swatch5,
    tint: "#f3ead8",
  },
  {
    id: "br-17",
    code: "BR-17-NOI",
    title: "Sumi Brush",
    category: "Abstract",
    image: swatch6,
    tint: "#2a2a2a",
  },
];

export const categories = [
  "All",
  "Botanical",
  "Plaster",
  "Linen",
  "Geometric",
  "Stripe",
  "Abstract",
];

export interface Mockup {
  id: string;
  name: string;
  category: string;
  image: string;
}

export const mockups: Mockup[] = [
  { id: "m1", name: "Sunlit Living", category: "Living Room", image: mockupLiving },
  { id: "m2", name: "Linen Bedroom", category: "Bedroom", image: mockupBedroom },
  { id: "m3", name: "Oak Studio", category: "Office", image: mockupOffice },
  { id: "m4", name: "Morning Cafe", category: "Cafe", image: mockupCafe },
  { id: "m5", name: "Banquette Room", category: "Restaurant", image: mockupRestaurant },
];

export const mockupCategories = ["All", "Living Room", "Bedroom", "Office", "Cafe", "Restaurant"];

export function getWallpaper(id: string): Wallpaper | undefined {
  return wallpapers.find((w) => w.id === id);
}

export interface Visualization {
  id: string;
  wallpaperId: string;
  wallpaperTitle: string;
  room: string;
  date: string;
  image: string;
}

import resultPreview from "@/assets/result-preview.jpg";

export const visualizations: Visualization[] = [
  {
    id: "v1",
    wallpaperId: "ef-04",
    wallpaperTitle: "Ethereal Flora",
    room: "Living Room",
    date: "04 Jun 2026",
    image: resultPreview,
  },
  {
    id: "v2",
    wallpaperId: "tc-22",
    wallpaperTitle: "Clay Hearth",
    room: "Bedroom",
    date: "02 Jun 2026",
    image: mockupBedroom,
  },
  {
    id: "v3",
    wallpaperId: "ad-08",
    wallpaperTitle: "Marine Deco",
    room: "Cafe",
    date: "29 May 2026",
    image: mockupCafe,
  },
  {
    id: "v4",
    wallpaperId: "ln-11",
    wallpaperTitle: "Sand Drift",
    room: "Office",
    date: "21 May 2026",
    image: mockupOffice,
  },
  {
    id: "v5",
    wallpaperId: "vs-03",
    wallpaperTitle: "Ivory Line",
    room: "Restaurant",
    date: "17 May 2026",
    image: mockupRestaurant,
  },
  {
    id: "v6",
    wallpaperId: "br-17",
    wallpaperTitle: "Sumi Brush",
    room: "Living Room",
    date: "11 May 2026",
    image: mockupLiving,
  },
  {
    id: "v7",
    wallpaperId: "ef-04",
    wallpaperTitle: "Ethereal Flora",
    room: "Bedroom",
    date: "08 May 2026",
    image: mockupBedroom,
  },
  {
    id: "v8",
    wallpaperId: "tc-22",
    wallpaperTitle: "Clay Hearth",
    room: "Office",
    date: "02 May 2026",
    image: mockupOffice,
  },
];
