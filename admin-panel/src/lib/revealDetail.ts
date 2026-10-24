/**
 * En pantallas angostas la lista y el detalle (`.gg-split`) quedan apilados, así que al elegir un
 * elemento de la lista el detalle aparece más abajo. Esto lo lleva a la vista. En escritorio, donde
 * los dos paneles se ven a la vez, no hace nada.
 */
export function revealDetailOnNarrowScreens(): void {
  if (!window.matchMedia('(max-width: 900px)').matches) return;
  requestAnimationFrame(() => {
    document.querySelector('.gg-split__detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
