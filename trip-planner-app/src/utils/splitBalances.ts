import type { Expense } from '@/types';
import type { Participant } from '@/api/collaborators';

// Cálculo de saldos para la tab Balances del dossier (división de gastos
// entre participantes de un viaje, 2026-07 a pedido de Lautaro) — todo
// client-side, a partir de expenses (con paidByUserId + splits, ver
// GET /trips/:tripId/expenses) y participants (dueño + colaboradores, ver
// GET /trips/:tripId/participants). No hay conversión de moneda: asume
// que todos los gastos divididos están en la moneda del viaje, igual que
// el resto de los totales de Presupuesto/Gastos.

export interface Balance {
  userId: string;
  name: string;
  // positivo = le deben (pagó de más), negativo = debe (le tocaba pagar más
  // de lo que puso).
  net: number;
}

export interface SettleUp {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Balance neto de cada participante: lo que pagó menos lo que le toca de
// cada gasto en el que está incluido en la división (partes iguales entre
// quienes aparecen en `splits`). Gastos sin división cargada (splits
// vacío) no afectan a nadie — no dividido, no entra en el balance.
export function computeBalances(expenses: Expense[], participants: Participant[]): Balance[] {
  const net = new Map<string, number>(participants.map((p) => [p.userId, 0]));

  for (const exp of expenses) {
    if (exp.splits.length === 0) continue;
    if (exp.paidByUserId && net.has(exp.paidByUserId)) {
      net.set(exp.paidByUserId, (net.get(exp.paidByUserId) ?? 0) + exp.amount);
    }
    const share = exp.amount / exp.splits.length;
    for (const s of exp.splits) {
      if (!net.has(s.userId)) continue;
      net.set(s.userId, (net.get(s.userId) ?? 0) - share);
    }
  }

  return participants.map((p) => ({ userId: p.userId, name: p.name, net: round2(net.get(p.userId) ?? 0) }));
}

// Reduce las deudas cruzadas a la menor cantidad de pagos posible —
// algoritmo greedy: en cada paso empareja al mayor deudor con el mayor
// acreedor (mismo enfoque que usan apps tipo Splitwise para "saldar
// todo"). No es necesariamente ÚNICO, pero sí minimiza bastante bien la
// cantidad de transacciones sin ser exponencial.
export function simplifyDebts(balances: Balance[]): SettleUp[] {
  const EPSILON = 0.01;
  const creditors = balances
    .filter((b) => b.net > EPSILON)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net - a.net);
  const debtors = balances
    .filter((b) => b.net < -EPSILON)
    .map((b) => ({ ...b, net: -b.net }))
    .sort((a, b) => b.net - a.net);

  const result: SettleUp[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.net, creditor.net);
    if (amount > EPSILON) {
      result.push({
        fromUserId: debtor.userId,
        fromName: debtor.name,
        toUserId: creditor.userId,
        toName: creditor.name,
        amount: round2(amount),
      });
    }
    debtor.net -= amount;
    creditor.net -= amount;
    if (debtor.net <= EPSILON) i++;
    if (creditor.net <= EPSILON) j++;
  }
  return result;
}
