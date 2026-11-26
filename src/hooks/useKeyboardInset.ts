import { useEffect, useState } from "react";

// Abaixo disto a diferença entre a janela e a área visível é barra do navegador, não teclado.
const KEYBOARD_MIN_PX = 120;

/**
 * Altura (px) que o teclado virtual cobre da janela, ou 0. No iOS e no Android atual o teclado
 * cobre o layout sem redimensioná-lo, e um sheet fixo embaixo ficaria escondido atrás dele.
 * Sem visualViewport (desktop antigo, testes) devolve sempre 0.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(covered > KEYBOARD_MIN_PX ? Math.round(covered) : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
