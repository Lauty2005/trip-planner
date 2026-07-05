import { apiClient } from './client';

export type ParticipantRole = 'owner' | 'editor' | 'viewer';

// Todos los que pueden participar de la división de gastos de un viaje
// (dueño + colaboradores, ver GET /trips/:tripId/participants en el
// backend) — a diferencia de Collaborator/getCollaborators, esto SÍ
// incluye al dueño, que no tiene fila propia en trip_collaborators.
export interface Participant {
  userId: string;
  name: string;
  email: string;
  role: ParticipantRole;
}

function mapParticipant(r: any): Participant {
  return { userId: r.user_id, name: r.name, email: r.email, role: r.role };
}

export async function getTripParticipants(tripId: string): Promise<Participant[]> {
  const { data } = await apiClient.get(`/trips/${tripId}/participants`);
  return (data ?? []).map(mapParticipant);
}

// Colaboradores del viaje (tab Colaboradores del dossier) — no incluye al
// dueño, ver getTripParticipants para la lista completa de participantes.
export interface Collaborator {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'editor' | 'viewer';
}

function mapCollaborator(r: any): Collaborator {
  return { id: r.id, userId: r.user_id, name: r.name, email: r.email, role: r.role };
}

export async function getCollaborators(tripId: string): Promise<Collaborator[]> {
  const { data } = await apiClient.get(`/trips/${tripId}/collaborators`);
  return (data ?? []).map(mapCollaborator);
}

// El POST del backend hace `INSERT ... RETURNING *` sobre trip_collaborators
// sola (sin join a users), así que la fila que devuelve no trae name/email
// — no alcanza para mapCollaborator. La pantalla recarga la lista completa
// (getCollaborators) después de agregar, así que acá no hace falta más que
// avisar si falló.
export async function addCollaborator(tripId: string, payload: { email: string; role?: 'editor' | 'viewer' }): Promise<void> {
  await apiClient.post(`/trips/${tripId}/collaborators`, payload);
}

export async function removeCollaborator(tripId: string, userId: string): Promise<void> {
  await apiClient.delete(`/trips/${tripId}/collaborators/${userId}`);
}
