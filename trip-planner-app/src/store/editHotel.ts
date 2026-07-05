import { create } from 'zustand';
import type { SavedHotel } from '@/api/trips';

// Puente entre el dossier del viaje (donde está el botón "Editar" de un
// hotel guardado) y la pantalla de Reservas (donde vive el form) — mismo
// patrón que useEditFlightStore: se setea al tocar "Editar" y explore.tsx
// lo consume/limpia apenas precarga el form, para que no quede "pegado" si
// el usuario vuelve a entrar a Reservas para cargar un hotel nuevo.
interface EditHotelState {
  editHotel: SavedHotel | null;
  setEditHotel: (hotel: SavedHotel) => void;
  clearEditHotel: () => void;
}

export const useEditHotelStore = create<EditHotelState>((set) => ({
  editHotel: null,
  setEditHotel: (hotel) => set({ editHotel: hotel }),
  clearEditHotel: () => set({ editHotel: null }),
}));
