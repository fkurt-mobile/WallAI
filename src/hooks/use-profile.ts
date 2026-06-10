import { useQuery } from "@tanstack/react-query";
import { ProfileService } from "@/lib/services";

export function useProfile() {
  return useQuery({
    queryKey: ["user-profile"],
    queryFn: () => ProfileService.getCurrentProfile(),
  });
}
