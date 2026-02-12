"use client";

import { ReactNode, useEffect } from "react";
import { useRequireAuth, useLogin, authKeys } from "@/lib/auth-queries";
import { LoginDialog } from "@/components/features/auth";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("auth");
  const queryClient = useQueryClient();
  const { showLogin, isLoading, authEnabled, error } = useRequireAuth();
  const loginMutation = useLogin();

  // Listen for 401 errors from API requests
  useEffect(() => {
    const handleUnauthorized = () => {
      // Invalidate auth state to trigger re-check
      queryClient.invalidateQueries({ queryKey: authKeys.state() });
    };

    window.addEventListener("api:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("api:unauthorized", handleUnauthorized);
  }, [queryClient]);

  // Also check when error changes
  useEffect(() => {
    if (error) {
      console.log("Auth state error:", error);
    }
  }, [error]);

  const handleLogin = async (token: string): Promise<boolean> => {
    try {
      await loginMutation.mutateAsync(token);
      return true;
    } catch (error) {
      toast.error(t("invalidToken"));
      return false;
    }
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <LoginDialog
        open={showLogin}
        onOpenChange={(open) => {
          // Prevent closing the dialog when auth is required
          if (!open && showLogin) {
            return;
          }
        }}
        onLogin={handleLogin}
      />
    </>
  );
}
