// Tipos espejando schema.sql — mantenerlos sincronizados con la base.

export type TripStatus = 'planning' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';
export type BookingStatus = 'candidate' | 'booked' | 'cancelled';
export type ActivityCategory = 'sightseeing' | 'food' | 'transport' | 'lodging' | 'activity' | 'other';
export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Trip {
  id: string;
  ownerId: string;
  title: string;
  destination: string;
  destinationLat?: number;
  destinationLng?: number;
  startDate: string; // ISO date
  endDate: string;
  coverImageUrl?: string;
  status: TripStatus;
  currency: string;
}

export interface TripCollaborator {
  id: string;
  tripId: string;
  userId: string;
  role: CollaboratorRole;
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  dayDate: string;
  dayNumber: number;
  notes?: string;
  activities?: Activity[];
}

export interface Activity {
  id: string;
  itineraryDayId: string;
  title: string;
  description?: string;
  category: ActivityCategory;
  locationName?: string;
  lat?: number;
  lng?: number;
  startTime?: string;
  endTime?: string;
  orderIndex: number;
  estimatedCost?: number;
}

export interface BudgetCategory {
  id: string;
  tripId: string;
  name: string;
  plannedAmount: number;
}

export interface Expense {
  id: string;
  tripId: string;
  budgetCategoryId?: string;
  paidByUserId?: string;
  // Si este gasto se generó desde "Marcar como pagado" en un hotel/vuelo
  // guardado (tab Gastos), a lo sumo uno de los dos queda seteado.
  sourceHotelId?: string;
  sourceFlightId?: string;
  description: string;
  amount: number;
  currency: string;
  expenseDate: string;
}

export interface Hotel {
  id: string;
  tripId: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  checkInDate: string;
  checkOutDate: string;
  price?: number;
  currency: string;
  status: BookingStatus;
  bookingSource?: string;
  budgetCategoryId?: string;
}

export interface Flight {
  id: string;
  tripId: string;
  airline?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDatetime: string;
  arrivalDatetime: string;
  price?: number;
  currency: string;
  status: BookingStatus;
  budgetCategoryId?: string;
}

export interface SavedPlace {
  id: string;
  tripId: string;
  name: string;
  category: ActivityCategory;
  lat: number;
  lng: number;
  notes?: string;
}

export interface MapPin {
  id: string;
  type: 'activity' | 'hotel' | 'place';
  title: string;
  lat: number;
  lng: number;
}
