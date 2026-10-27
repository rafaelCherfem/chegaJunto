import { Undo2 } from "lucide-react";

export function RefundChip() {
  return (
    <span className="charge-status charge-status--refund">
      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
      A devolver
    </span>
  );
}
