import { Check } from "lucide-react";
import type { ReactNode } from "react";

/** Selo de "tudo feito": o mesmo check e o mesmo verde em Diárias e Cobranças. */
export function CompleteMark({ children }: { children: ReactNode }) {
  return (
    <p className="complete-mark">
      <span className="complete-mark__icon" aria-hidden="true">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      {children}
    </p>
  );
}
