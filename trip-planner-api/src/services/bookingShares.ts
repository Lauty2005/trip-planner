import type { PoolClient } from 'pg';

// Reemplaza el reparto completo de un hotel/vuelo por la lista nueva —
// mismo criterio que replaceExpenseSplits (expenses.routes.ts): reemplazo
// entero en vez de un diff. A diferencia de ese caso, acá SÍ importa no
// perder plata ya registrada: un share con expense_id (ya pagado) nunca se
// borra ni se le pisa el monto, aunque se lo saque de la lista nueva o se
// mande un monto distinto para esa persona.
export async function replaceBookingShares(
  client: PoolClient,
  parent: { hotelId?: string; flightId?: string },
  shares: { userId: string; amount: number }[]
): Promise<void> {
  const column = parent.hotelId ? 'hotel_id' : 'flight_id';
  const parentId = (parent.hotelId ?? parent.flightId)!;
  const userIds = shares.map((s) => s.userId);

  // `!= ALL(arr)` con arr vacío da TRUE para cualquier fila (no hay nada
  // que la excluya) — no hace falta un caso aparte para "lista vacía", esto
  // borra todos los repartos sin pagar del hotel/vuelo.
  await client.query(
    `DELETE FROM booking_shares WHERE ${column} = $1 AND expense_id IS NULL AND user_id != ALL($2::uuid[])`,
    [parentId, userIds]
  );

  // ON CONFLICT apunta al índice único parcial (idx_booking_shares_hotel_user
  // / idx_booking_shares_flight_user, ver schema.sql) — el predicado tiene
  // que repetirse acá tal cual para que Postgres lo reconozca como target.
  // El WHERE del DO UPDATE hace que, si la fila en conflicto YA está pagada
  // (expense_id no nulo), la actualización no tenga efecto (equivale a
  // DO NOTHING para esa fila puntual) sin tirar error.
  const conflictTarget =
    column === 'hotel_id'
      ? '(hotel_id, user_id) WHERE hotel_id IS NOT NULL'
      : '(flight_id, user_id) WHERE flight_id IS NOT NULL';

  for (const s of shares) {
    await client.query(
      `INSERT INTO booking_shares (${column}, user_id, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT ${conflictTarget}
       DO UPDATE SET amount = EXCLUDED.amount WHERE booking_shares.expense_id IS NULL`,
      [parentId, s.userId, s.amount]
    );
  }
}
