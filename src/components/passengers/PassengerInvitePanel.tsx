import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useCreatePassengerInvite,
  usePassengerInvites,
  useRevokePassengerInvite,
} from "@/hooks/usePassengerInvites";
import { inviteStatus } from "@/utils/inviteStatus";

export function PassengerInvitePanel({ passengerId }: { passengerId: string }) {
  const { data: invites, isLoading, isError } = usePassengerInvites(passengerId, true);
  const createInvite = useCreatePassengerInvite();
  const revokeInvite = useRevokePassengerInvite();
  const [delivery, setDelivery] = useState<{ id: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const delivered = invites?.find((invite) => invite.id === delivery?.id);
  const canCopy = delivery && (!delivered || inviteStatus(delivered, now) === "Pendente");
  async function create() {
    setError(null);
    try {
      setDelivery(await createInvite.mutateAsync(passengerId));
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha temporária.");
    }
  }
  async function revoke(id: string) {
    setError(null);
    try {
      await revokeInvite.mutateAsync(id);
      if (delivery?.id === id) setDelivery(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha temporária.");
    }
  }
  async function copy() {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/convite#token=${delivery.token}`,
      );
      setCopied(true);
    } catch {
      setError("Não foi possível copiar o link. Tente novamente.");
    }
  }
  return (
    <div className="mt-3 border-t border-black/10 pt-3">
      <p className="mb-2 text-xs font-medium opacity-70">Acesso do passageiro</p>
      {isLoading && <p>Carregando...</p>}
      {isError && <p role="alert">Não foi possível carregar os convites.</p>}
      <p className="text-xs">
        O novo convite substitui o anterior. Copie o link agora; ele não será recuperável
        depois.
      </p>
      {canCopy && (
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? "Copiado!" : "Copiar link"}
        </Button>
      )}
      {invites?.map((invite) => (
        <div
          key={invite.id}
          className="mt-2 flex items-center justify-between gap-2 text-xs"
        >
          <span>
            {inviteStatus(invite, now)} · expira{" "}
            {new Date(invite.expiresAt).toLocaleString("pt-BR")}
          </span>
          {!invite.used && !invite.revokedAt && (
            <Button
              variant="outline"
              size="sm"
              disabled={revokeInvite.isPending}
              onClick={() => revoke(invite.id)}
            >
              Revogar
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={isLoading || isError || createInvite.isPending}
        onClick={create}
      >
        {createInvite.isPending ? "Gerando..." : "Gerar novo convite"}
      </Button>
    </div>
  );
}
