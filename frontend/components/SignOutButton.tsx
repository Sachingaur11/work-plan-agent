"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  const router = useRouter();
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }
  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition"
    >
      <LogOut className="w-4 h-4" />
      Sign out
    </button>
  );
}
