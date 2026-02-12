"use client";

import { useRequireAuth, useLogin } from "@/lib/auth-queries";
import { LoginDialog } from "./login-dialog";

export function AuthGuard() {
  const { showLogin } = useRequireAuth();
  const loginMutation = useLogin();
  
  const handleLogin = async (token: string) => {
    try {
      await loginMutation.mutateAsync(token);
      return true;
    } catch (e) {
      return false;
    }
  };

  if (!showLogin) return null;

  return (
    <LoginDialog 
      open={true} 
      onOpenChange={() => {}} 
      onLogin={handleLogin}
    />
  );
}
