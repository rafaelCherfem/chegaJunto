import type { PassengerInvite } from "@/types/entities";
export function inviteStatus(invite: PassengerInvite, now = Date.now()) {
  if (invite.used) return "Usado";
  if (invite.revokedAt) return "Revogado";
  if (now >= Date.parse(invite.expiresAt)) return "Expirado";
  return "Pendente";
}
