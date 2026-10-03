import { Outlet } from "react-router-dom";
import { useAccountAccess } from "@/hooks/useAccountAccess";
import { PassengerPortalPage } from "@/pages/PassengerPortalPage";
import { signOut } from "@/services/auth.service";

export function RoleRouter() {
  const { data: access, isLoading, isError, refetch } = useAccountAccess();
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p>Carregando acesso...</p>
      </div>
    );
  }
  if (isError || !access) {
    return (
      <div
        className="flex min-h-svh flex-col items-center justify-center gap-4"
        role="alert"
      >
        <p>Não foi possível verificar o acesso da conta.</p>
        <button onClick={() => void refetch()}>Tentar novamente</button>
        <button onClick={() => void signOut()}>Sair</button>
      </div>
    );
  }
  if (access.role === "responsible") return <Outlet />;
  if (access.role === "passenger")
    return <PassengerPortalPage passengerId={access.passengerId} />;
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4">
      <p>Sua conta ainda não possui acesso associado.</p>
      <p>Use o link de convite enviado pelo responsável.</p>
      <button onClick={() => void signOut()}>Sair</button>
    </div>
  );
}
