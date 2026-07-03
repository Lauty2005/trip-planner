import { create } from 'zustand';
import type { Trip } from '@/types';

// Estado global mínimo: qué trip está "activo" para las tabs de Mapa y
// Presupuesto, que no reciben el tripId por la URL (a diferencia de
// app/trip/[tripId]). Se setea al tocar un trip en "Mis viajes".
interface SelectedTripState {
  selectedTrip: Trip | null;
  setSelectedTrip: (trip: Trip) => void;
  clearSelectedTrip: () => void;
}

export const useSelectedTripStore = create<SelectedTripState>((set) => ({
  selectedTrip: null,
  setSelectedTrip: (trip) => set({ selectedTrip: trip }),
  clearSelectedTrip: () => set({ selectedTrip: null }),
}));
