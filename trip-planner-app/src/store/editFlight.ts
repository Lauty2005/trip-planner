import { create } from 'zustand';
import type { SavedFlight } from '@/api/trips';

// Puente entre el dossier del viaje (donde está el botón "Editar" de un
// vuelo guardado) y la pantalla de Reservas (donde vive el form) — mismo
// patrón que useSelectedTripStore: se setea al tocar "Editar" y explore.tsx
// lo consume/limpia apenas precarga el form, para que no quede "pegado" si
// el usuario vuelve a entrar a Reservas para cargar un vuelo nuevo.
interface EditFlightState {
  editFlight: SavedFlight | null;
  setEditFlight: (flight: SavedFlight) => void;
  clearEditFlight: () => void;
}

export const useEditFlightStore = create<EditFlightState>((set) => ({
  editFlight: null,
  setEditFlight: (flight) => set({ editFlight: flight }),
  clearEditFlight: () => set({ editFlight: null }),
}));
