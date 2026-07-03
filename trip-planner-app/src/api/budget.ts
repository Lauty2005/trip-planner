import { apiClient } from './client';
import type { BudgetCategory, Expense } from '@/types';

export interface BudgetSummary {
  categories: Array<{
    category_id: string;
    name: string;
    planned_amount: string | number;
    spent_amount: string | number;
  }>;
  totalPlanned: number;
  totalSpent: number;
}

// El backend devuelve los gastos crudos de la base (snake_case, vía
// SELECT *) — igual que trips.ts con actividades/hoteles/vuelos, mapeamos
// acá a camelCase (Expense, en src/types) para el resto de la app.
function mapExpense(r: any): Expense {
  return {
    id: r.id,
    tripId: r.trip_id,
    budgetCategoryId: r.budget_category_id ?? undefined,
    paidByUserId: r.paid_by_user_id ?? undefined,
    description: r.description,
    amount: Number(r.amount),
    currency: r.currency,
    expenseDate: typeof r.expense_date === 'string' ? r.expense_date.slice(0, 10) : r.expense_date,
  };
}

export async function getBudgetSummary(tripId: string): Promise<BudgetSummary> {
  const { data } = await apiClient.get(`/trips/${tripId}/budget/summary`);
  return data;
}

export async function createBudgetCategory(
  tripId: string,
  payload: { name: string; plannedAmount: number }
): Promise<BudgetCategory> {
  const { data } = await apiClient.post(`/trips/${tripId}/budget-categories`, payload);
  return data;
}

export async function createExpense(
  tripId: string,
  payload: { description: string; amount: number; expenseDate: string; budgetCategoryId?: string; currency?: string }
): Promise<Expense> {
  // `currency` es opcional acá pero SIEMPRE se manda desde las pantallas
  // (budget.tsx / dossier) con la moneda del viaje — antes no se mandaba
  // nada y el backend caía en su default fijo 'USD' sin importar en qué
  // moneda estuviera el trip (bug reportado por Lautaro).
  const { data } = await apiClient.post(`/trips/${tripId}/expenses`, payload);
  return mapExpense(data);
}

// Lista de gastos individuales — antes solo se veía el agregado por
// categoría (getBudgetSummary), sin forma de ver/editar/borrar un gasto
// puntual. El backend ya soportaba filtros por categoría/rango de fechas
// (GET /trips/:tripId/expenses?category=&from=&to=), sin usar desde el
// cliente.
export async function getExpenses(
  tripId: string,
  filters?: { category?: string; from?: string; to?: string }
): Promise<Expense[]> {
  const { data } = await apiClient.get(`/trips/${tripId}/expenses`, { params: filters });
  return (data ?? []).map(mapExpense);
}

export async function updateExpense(
  expenseId: string,
  // budgetCategoryId acepta `null` explícito para "sacar" la categoría del
  // gasto (a diferencia de `undefined`, que significa "no tocar este
  // campo") — ver el fix en expenses.routes.ts (PATCH /expenses/:id).
  payload: { description?: string; amount?: number; expenseDate?: string; budgetCategoryId?: string | null }
): Promise<Expense> {
  const { data } = await apiClient.patch(`/expenses/${expenseId}`, payload);
  return mapExpense(data);
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await apiClient.delete(`/expenses/${expenseId}`);
}

// Borrado de categoría de presupuesto — botón "Eliminar" en la tab
// Presupuesto (global y la embebida en el dossier). El backend borra la
// categoría con ON DELETE SET NULL en expenses.budget_category_id (ver
// schema.sql): los gastos ya cargados con esa categoría NO se borran,
// solo quedan sin categoría asignada.
export async function deleteBudgetCategory(categoryId: string): Promise<void> {
  await apiClient.delete(`/budget-categories/${categoryId}`);
}
