import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createContext, useContext, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { cn } from "@/lib/utils";

const SheetContext = createContext<{ close: () => void }>({ close: () => {} });

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/** Embaixo no celular (arrasta para fechar), painel lateral em telas largas. */
export function Sheet({ open, onOpenChange, children }: SheetProps) {
  return (
    <SheetContext.Provider value={{ close: () => onOpenChange(false) }}>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </SheetContext.Provider>
  );
}

export function SheetContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  const { close } = useContext(SheetContext);
  const { contentRef, handleProps } = useSheetDrag(close);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="sheet__overlay" />
      <DialogPrimitive.Content ref={contentRef} className={cn("sheet", className)} {...props}>
        <div className="sheet__grip" aria-hidden="true" {...handleProps}>
          <span className="sheet__handle" />
        </div>
        {children}
        <DialogPrimitive.Close className="sheet__close" aria-label="Fechar">
          <X className="h-5 w-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
