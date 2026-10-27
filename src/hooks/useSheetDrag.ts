import { useRef, type PointerEvent } from "react";

const DISMISS_RATIO = 0.25;
const DISMISS_VELOCITY = 0.6; // px/ms

function isDesktopLayout() {
  return typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;
}

/**
 * Arrastar a alça para baixo fecha o sheet. O movimento vai direto no estilo do
 * elemento (sem re-render a cada pixel). No layout largo o sheet é um painel
 * lateral e o arrasto fica desligado.
 */
export function useSheetDrag(onDismiss: () => void) {
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startTime: number; offset: number } | null>(null);

  function move(offset: number, animated: boolean) {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animated ? "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    el.style.transform = offset > 0 ? `translateY(${offset}px)` : "";
  }

  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (isDesktopLayout()) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = { startY: event.clientY, startTime: event.timeStamp, offset: 0 };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const state = drag.current;
      if (!state) return;
      state.offset = Math.max(event.clientY - state.startY, 0);
      move(state.offset, false);
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const state = drag.current;
      drag.current = null;
      if (!state) return;
      const height = contentRef.current?.offsetHeight ?? 0;
      const velocity = state.offset / Math.max(event.timeStamp - state.startTime, 1);
      if (state.offset > height * DISMISS_RATIO || velocity > DISMISS_VELOCITY) {
        onDismiss();
        return;
      }
      move(0, true);
    },
    onPointerCancel() {
      drag.current = null;
      move(0, true);
    },
  };

  return { contentRef, handleProps };
}
