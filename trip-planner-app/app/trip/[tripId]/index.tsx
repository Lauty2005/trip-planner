import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  TextInput,
  Pressable,
  Share,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router, Stack } from 'expo-router';
import {
  getTrip,
  getTripDays,
  getTripHotels,
  getTripFlights,
  getTripMapPins,
  createDay,
  createActivity,
  deleteTrip,
  deleteActivity,
  deleteHotel,
  deleteFlight,
  updateHotelShares,
  updateFlightShares,
  payBookingShare,
  type SavedHotel,
  type SavedFlight,
  type FlightLegType,
  type BookingShare,
} from '@/api/trips';
import {
  getBudgetSummary,
  createBudgetCategory,
  deleteBudgetCategory,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  type BudgetSummary,
} from '@/api/budget';
import {
  getTripParticipants,
  addCollaborator,
  removeCollaborator,
  type Participant,
} from '@/api/collaborators';
import { getMe } from '@/api/auth';
import { computeBalances, simplifyDebts } from '@/utils/splitBalances';
// 2026-07-02: antes esto se importaba desde '../../(tabs)/budget' (ruta
// relativa porque el alias @/* solo cubre src/*, ver tsconfig.json) — al
// mover TODA la gestión de presupuesto (categorías, gráfico, "Agregar
// categoría") acá al dossier y eliminar la pantalla global /(tabs)/budget,
// estos helpers pasaron a un módulo neutral (src/utils/budgetDisplay.ts)
// que no depende de ninguna pantalla en particular.
import { CATEGORY_COLORS, categoryGlyph } from '@/utils/budgetDisplay';
import { formatShort } from '@/utils/date';
import { useSelectedTripStore } from '@/store/selectedTrip';
import { useEditFlightStore } from '@/store/editFlight';
import { useEditHotelStore } from '@/store/editHotel';
import type { Trip, ItineraryDay, Activity, ActivityCategory, TripStatus, MapPin, Expense } from '@/types';
import { DatePickerField } from '@/components/DatePickerField';
import { TimePickerField } from '@/components/TimePickerField';
import { PriceField } from '@/components/PriceField';
import { SelectField } from '@/components/SelectField';
import { TripMapPreview } from '@/components/TripMapPreview';
import { AppHeader } from '@/components/AppHeader';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';

// Tipo de entidad borrable con confirmación — actividades, hoteles, vuelos
// y categorías de presupuesto comparten el mismo modal (ConfirmDeleteModal)
// en vez de uno por tipo, así que solo hace falta un state genérico acá.
type DeleteTarget = {
  type: 'activity' | 'hotel' | 'flight' | 'category' | 'expense' | 'collaborator';
  id: string;
  name: string;
};

const DELETE_COPY: Record<DeleteTarget['type'], { title: string; noun: string; extra?: string }> = {
  activity: { title: '¿Eliminar esta actividad?', noun: 'la actividad' },
  hotel: { title: '¿Eliminar este hotel?', noun: 'el hotel' },
  flight: { title: '¿Eliminar este vuelo?', noun: 'el vuelo' },
  category: {
    title: '¿Eliminar esta categoría?',
    noun: 'la categoría',
    extra: ' Los gastos que ya cargaste con esta categoría no se borran, quedan sin categoría asignada.',
  },
  expense: { title: '¿Eliminar este gasto?', noun: 'el gasto' },
  collaborator: {
    title: '¿Sacar a este colaborador?',
    noun: 'a este colaborador',
    extra: ' Deja de tener acceso al viaje. Los gastos ya divididos con esta persona no se borran.',
  },
};

// Dossier de viaje — rediseño 2026-07-01 "idéntico" al boceto de
// referencia que pasó Lautaro: header propio con navegación (en vez del
// header nativo con solo el back), hero con tarjeta de embarque, y un
// selector de pestañas (01 Itinerario / 02 Presupuesto / 03 Hoteles /
// 04 Vuelos / 05 Mapa) debajo del boleto que muestra la información
// COMPLETA de cada sección — antes todo (itinerario + vuelos + hoteles)
// estaba apilado en una sola pantalla sin pestañas, y presupuesto/mapa no
// aparecían acá para nada (vivían solo en las tabs globales, atadas al
// store selectedTrip).

const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  sightseeing: 'Excursión',
  food: 'Comida',
  transport: 'Transporte',
  // 'lodging' ya no es seleccionable en el form (ver ACTIVITY_CATEGORY_OPTIONS
  // más abajo — hay una pestaña de Hoteles dedicada), pero se deja la
  // etiqueta acá por si alguna actividad vieja quedó guardada con esta
  // categoría, para no romper su render.
  lodging: 'Alojamiento',
  activity: 'Actividad',
  other: 'Otro',
};

const CATEGORY_GLYPH: Record<ActivityCategory, string> = {
  sightseeing: '🗺️',
  food: '🍽️',
  transport: '🚆',
  lodging: '🏨',
  activity: '🎟️',
  other: '📌',
};

const LEG_TYPE_LABEL: Record<FlightLegType, string> = { departure: 'Ida', return: 'Vuelta', one_way: 'Interno' };

// Fecha de "hoy" en formato AAAA-MM-DD, hora local — usada como
// expense_date al marcar un hotel/vuelo pendiente como pagado (representa
// el día en que efectivamente se paga, no el check-in/salida del vuelo).
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Hotel/vuelo con precio cargado que todavía no se pasó a un gasto real
// (tab Gastos, sección "Pendientes de pago") — ver pendingPayments más
// abajo y source_hotel_id/source_flight_id en expenses. Si `shares` no está
// vacío, el hotel/vuelo es COMPARTIDO con reparto armado (ver tabs Hoteles/
// Vuelos): la fila se muestra desglosada por persona en vez del botón
// único "Marcar pagado".
interface PendingPayment {
  id: string;
  type: 'hotel' | 'flight';
  title: string;
  price: number;
  currency: string;
  budgetCategoryId?: string;
  shares: BookingShare[];
}

function minutesToHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

const STATUS_LABEL: Record<TripStatus, string> = {
  planning: 'Planificando',
  confirmed: 'Confirmado',
  ongoing: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

// 'lodging' se saca de las opciones del form: ese tipo de dato ya tiene su
// propia pestaña dedicada (Hoteles), no hace falta cargarlo también como
// actividad.
const ACTIVITY_CATEGORY_OPTIONS: ActivityCategory[] = ['activity', 'sightseeing', 'food', 'transport', 'other'];

// 'expenses' (pestaña "Gastos") estuvo condicionada a Confirmado/En curso
// hasta el 2026-07-02; ahora está disponible en cualquier estado del viaje,
// para poder ir cargando gastos de la previa desde que arranca la
// planificación. La numeración ("01", "02"...) se calcula en el componente
// (ver `tabs` más abajo) en vez de quedar hardcodeada acá, por si en algún
// momento vuelve a haber alguna pestaña condicional.
const BASE_TABS = [
  { key: 'itin', label: 'Itinerario' },
  { key: 'budget', label: 'Presupuesto' },
  { key: 'expenses', label: 'Gastos' },
  { key: 'balances', label: 'Balances' },
  { key: 'hotels', label: 'Hoteles' },
  { key: 'flights', label: 'Vuelos' },
  { key: 'map', label: 'Mapa' },
  { key: 'collab', label: 'Colaboradores' },
] as const;
type TabKey = (typeof BASE_TABS)[number]['key'];

const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v));
const money = (v: number): string => Math.round(v).toLocaleString('es-AR');
const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

export default function TripDetailScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const setSelectedTrip = useSelectedTripStore((state) => state.setSelectedTrip);
  const setEditFlight = useEditFlightStore((state) => state.setEditFlight);
  const setEditHotel = useEditHotelStore((state) => state.setEditHotel);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);
  const [hotels, setHotels] = useState<SavedHotel[]>([]);
  const [flights, setFlights] = useState<SavedFlight[]>([]);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  // Dueño + colaboradores del viaje — quiénes pueden pagar/dividir un
  // gasto (tab Gastos/Balances) y a quiénes se les puede sacar acceso
  // (tab Colaboradores). currentUserId sirve para: default de "pagado
  // por" en un gasto nuevo, y para mostrar los controles de invitar/sacar
  // colaboradores solo si el usuario logueado es el dueño del viaje
  // (el backend ya lo exige, esto es solo para no mostrar botones que van
  // a tirar 403).
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('itin');

  // --- Eliminar viaje ---
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- Eliminar actividad/hotel/vuelo/categoría (un solo modal genérico) ---
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);
  const [deleteItemError, setDeleteItemError] = useState<string | null>(null);

  // --- Form: agregar día/actividad (tab Itinerario) ---
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [newDayDate, setNewDayDate] = useState('');
  const [addingDay, setAddingDay] = useState(false);
  const [savingDay, setSavingDay] = useState(false);
  const [activityTitle, setActivityTitle] = useState('');
  const [activityCategory, setActivityCategory] = useState<ActivityCategory>('activity');
  const [activityLocation, setActivityLocation] = useState('');
  const [activityTime, setActivityTime] = useState('');
  const [activityCost, setActivityCost] = useState<number | undefined>(undefined);
  const [savingActivity, setSavingActivity] = useState(false);
  const [itinFormError, setItinFormError] = useState<string | null>(null);

  // --- Form: agregar categoría de presupuesto (tab Presupuesto) ---
  const [categoryName, setCategoryName] = useState('');
  const [categoryPlanned, setCategoryPlanned] = useState<number | undefined>(undefined);
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // --- Form: registrar/editar gasto (tab Gastos) ---
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number | undefined>(undefined);
  const [expenseDate, setExpenseDate] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  // "Pagado por" (default: usuario logueado) y "dividir entre" (default:
  // todos los participantes) — división en partes iguales, ver
  // src/utils/splitBalances.ts. Vaciar splitParticipantIds = gasto no
  // dividido (no entra en Balances).
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [splitParticipantIds, setSplitParticipantIds] = useState<string[]>([]);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);

  // --- "Marcar como pagado" en un hotel/vuelo pendiente (tab Gastos) ---
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [pendingPaymentError, setPendingPaymentError] = useState<string | null>(null);

  // --- Reparto de hotel/vuelo compartido entre viajeros (tabs Hoteles/
  // Vuelos, 2026-07-06) — shareDrafts es el monto en edición por
  // participante (userId → string), sin guardar hasta "Guardar reparto".
  const [editingSharesFor, setEditingSharesFor] = useState<{ type: 'hotel' | 'flight'; id: string } | null>(null);
  const [shareDrafts, setShareDrafts] = useState<Record<string, string>>({});
  const [savingShares, setSavingShares] = useState(false);
  const [sharesError, setSharesError] = useState<string | null>(null);

  // --- Pago individual de un reparto (tab Gastos, Pendientes de pago) ---
  const [payingShareId, setPayingShareId] = useState<string | null>(null);
  const [shareDates, setShareDates] = useState<Record<string, string>>({});
  const [sharePayError, setSharePayError] = useState<string | null>(null);

  // --- Form: invitar colaborador (tab Colaboradores) ---
  const [collabEmail, setCollabEmail] = useState('');
  const [collabRole, setCollabRole] = useState<'editor' | 'viewer'>('editor');
  const [savingCollab, setSavingCollab] = useState(false);
  const [collabError, setCollabError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [tripData, daysData, hotelsData, flightsData, pinsData, budgetData, expensesData, participantsData, me] =
        await Promise.all([
          getTrip(tripId),
          getTripDays(tripId),
          getTripHotels(tripId),
          getTripFlights(tripId),
          getTripMapPins(tripId),
          getBudgetSummary(tripId),
          getExpenses(tripId),
          getTripParticipants(tripId),
          getMe(),
        ]);
      setTrip(tripData);
      setDays(daysData);
      setHotels(hotelsData);
      setFlights(flightsData);
      setPins(pinsData);
      setBudget(budgetData);
      setExpenses(expensesData);
      setParticipants(participantsData);
      setCurrentUserId(me.id);
      setError(null);
      setSelectedDayId((prev) =>
        prev && daysData.some((d) => d.id === prev) ? prev : (daysData[0]?.id ?? null)
      );
    } catch (err) {
      setError('No se pudo cargar el viaje. Revisá tu conexión con el backend.');
    }
  }, [tripId]);

  // useFocusEffect (no useEffect simple) para que al volver de "Editar
  // viaje", de guardar un hotel/vuelo en Explorar, o de cargar un gasto
  // desde la tab global de Presupuesto, este dossier se refresque solo.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      load().finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Precarga "pagado por"/"dividir entre" con sus defaults apenas
  // participants/currentUserId están disponibles (primera carga del
  // dossier) — sin esto, el form de "+ Registrar gasto" arrancaba con
  // ambos campos vacíos hasta la primera vez que se guardaba o cancelaba
  // algo (que es cuando resetExpenseForm los toca). No pisa nada si ya
  // hay una edición en curso o el usuario ya interactuó con el form.
  useEffect(() => {
    if (editingExpenseId) return;
    if (expensePaidBy || splitParticipantIds.length > 0) return;
    if (!currentUserId || participants.length === 0) return;
    setExpensePaidBy(currentUserId);
    setSplitParticipantIds(participants.map((p) => p.userId));
  }, [currentUserId, participants, editingExpenseId, expensePaidBy, splitParticipantIds.length]);

  async function handleShare() {
    if (!trip) return;
    try {
      await Share.share({
        message: `${trip.title} · ${trip.destination}\n${trip.startDate} → ${trip.endDate}\nOrganizado con ViajaYa.`,
      });
    } catch {
      // el usuario canceló el share sheet — no hace falta mostrar error
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTrip(tripId);
      setConfirmingDelete(false);
      // No queda ningún dato de este viaje que mostrar — volvemos a la
      // lista en vez de router.back() (que podría volver acá si se entró
      // desde el carrusel de Inicio, un dead-end sin el trip que ya no
      // existe).
      router.replace('/(tabs)/trips');
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo eliminar el viaje.';
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleConfirmDeleteItem() {
    if (!deleteTarget) return;
    setDeletingItem(true);
    setDeleteItemError(null);
    try {
      if (deleteTarget.type === 'activity') await deleteActivity(deleteTarget.id);
      else if (deleteTarget.type === 'hotel') await deleteHotel(deleteTarget.id);
      else if (deleteTarget.type === 'flight') await deleteFlight(deleteTarget.id);
      else if (deleteTarget.type === 'expense') {
        await deleteExpense(deleteTarget.id);
        if (editingExpenseId === deleteTarget.id) resetExpenseForm();
      } else if (deleteTarget.type === 'collaborator') {
        // deleteTarget.id guarda el userId acá (no hay un id de fila propio
        // que el front necesite — el backend borra por trip_id+user_id).
        await removeCollaborator(tripId, deleteTarget.id);
      } else await deleteBudgetCategory(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo eliminar.';
      setDeleteItemError(message);
    } finally {
      setDeletingItem(false);
    }
  }

  async function handleAddCategory() {
    if (!trip || !categoryName.trim() || categoryPlanned == null) return;
    setSavingCategory(true);
    setCategoryError(null);
    try {
      await createBudgetCategory(trip.id, { name: categoryName.trim(), plannedAmount: categoryPlanned });
      setCategoryName('');
      setCategoryPlanned(undefined);
      await load();
    } catch {
      setCategoryError('No se pudo crear la categoría.');
    } finally {
      setSavingCategory(false);
    }
  }

  function handleGoToExplore() {
    if (trip) setSelectedTrip(trip);
    router.push('/(tabs)/explore');
  }

  // Botón "Editar" en la tab Vuelos (2026-07-04, a pedido de Lautaro) —
  // reusa el mismo form de Reservas: deja el vuelo en useEditFlightStore
  // para que explore.tsx lo precargue apenas monta.
  function handleEditFlight(flight: SavedFlight) {
    if (trip) setSelectedTrip(trip);
    setEditFlight(flight);
    router.push('/(tabs)/explore');
  }

  // Botón "✎" en la tab Hoteles (2026-07-06, a pedido de Lautaro) — mismo
  // mecanismo que handleEditFlight: reusa el form de Reservas, dejando el
  // hotel en useEditHotelStore para que explore.tsx lo precargue apenas monta.
  function handleEditHotel(hotel: SavedHotel) {
    if (trip) setSelectedTrip(trip);
    setEditHotel(hotel);
    router.push('/(tabs)/explore');
  }

  async function handleAddDay() {
    if (!newDayDate) {
      setItinFormError('Elegí una fecha para el nuevo día.');
      return;
    }
    setSavingDay(true);
    setItinFormError(null);
    try {
      const created = await createDay(tripId, { dayDate: newDayDate, dayNumber: days.length + 1 });
      setNewDayDate('');
      setAddingDay(false);
      await load();
      setSelectedDayId(created.id);
    } catch {
      setItinFormError('No se pudo crear el día. Revisá tu conexión con el backend.');
    } finally {
      setSavingDay(false);
    }
  }

  async function handleAddActivity() {
    if (!selectedDayId) {
      setItinFormError('Primero creá o elegí un día para el itinerario.');
      return;
    }
    if (!activityTitle.trim()) {
      setItinFormError('Completá el título de la actividad.');
      return;
    }
    setSavingActivity(true);
    setItinFormError(null);
    try {
      await createActivity(selectedDayId, {
        title: activityTitle.trim(),
        category: activityCategory,
        locationName: activityLocation.trim() || undefined,
        startTime: activityTime.trim() || undefined,
        estimatedCost: activityCost,
      });
      setActivityTitle('');
      setActivityLocation('');
      setActivityTime('');
      setActivityCost(undefined);
      setActivityCategory('activity');
      await load();
    } catch {
      setItinFormError('No se pudo crear la actividad. Revisá tu conexión con el backend.');
    } finally {
      setSavingActivity(false);
    }
  }

  function resetExpenseForm() {
    setExpenseDescription('');
    setExpenseAmount(undefined);
    setExpenseDate('');
    setExpenseCategoryId('');
    // Default para un gasto nuevo: lo pagaste vos, dividido entre todos
    // los participantes actuales del viaje — lo más común en un viaje
    // grupal. Se puede destildar a mano si no corresponde dividirlo.
    setExpensePaidBy(currentUserId ?? '');
    setSplitParticipantIds(participants.map((p) => p.userId));
    setEditingExpenseId(null);
    setExpenseFormError(null);
  }

  function handleStartEditExpense(expense: Expense) {
    setEditingExpenseId(expense.id);
    setExpenseDescription(expense.description);
    setExpenseAmount(expense.amount);
    setExpenseDate(expense.expenseDate);
    setExpenseCategoryId(expense.budgetCategoryId ?? '');
    setExpensePaidBy(expense.paidByUserId ?? currentUserId ?? '');
    // Gasto viejo sin división cargada: se precargan todos los
    // participantes en vez de dejarlo vacío, para invitar a dividirlo
    // ahora en vez de tener que tildar a mano de cero.
    setSplitParticipantIds(
      expense.splits.length > 0 ? expense.splits.map((s) => s.userId) : participants.map((p) => p.userId)
    );
    setExpenseFormError(null);
  }

  function toggleSplitParticipant(userId: string) {
    setSplitParticipantIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleSubmitExpense() {
    if (!trip) return;
    if (!expenseDescription.trim() || expenseAmount == null || !expenseDate) {
      setExpenseFormError('Completá descripción, monto y fecha.');
      return;
    }
    setSavingExpense(true);
    setExpenseFormError(null);
    try {
      if (editingExpenseId) {
        await updateExpense(editingExpenseId, {
          description: expenseDescription.trim(),
          amount: expenseAmount,
          expenseDate,
          budgetCategoryId: expenseCategoryId || null,
          paidByUserId: expensePaidBy || undefined,
          splitUserIds: splitParticipantIds,
        });
      } else {
        await createExpense(trip.id, {
          description: expenseDescription.trim(),
          amount: expenseAmount,
          expenseDate,
          budgetCategoryId: expenseCategoryId || undefined,
          currency: trip.currency,
          paidByUserId: expensePaidBy || undefined,
          splitUserIds: splitParticipantIds,
        });
      }
      resetExpenseForm();
      await load();
    } catch {
      setExpenseFormError(editingExpenseId ? 'No se pudo actualizar el gasto.' : 'No se pudo registrar el gasto.');
    } finally {
      setSavingExpense(false);
    }
  }

  // Convierte un hotel/vuelo pendiente en un gasto real (source_hotel_id/
  // source_flight_id lo referencian de vuelta, ver schema.sql) — a partir
  // de ahí ya no aparece en "Pendientes de pago" y sí suma a "gastado".
  async function handleMarkAsPaid(item: PendingPayment) {
    if (!trip) return;
    setMarkingPaidId(item.id);
    setPendingPaymentError(null);
    try {
      await createExpense(trip.id, {
        description: item.title,
        amount: item.price,
        currency: item.currency,
        expenseDate: todayISO(),
        budgetCategoryId: item.budgetCategoryId,
        sourceHotelId: item.type === 'hotel' ? item.id : undefined,
        sourceFlightId: item.type === 'flight' ? item.id : undefined,
        // Default: lo pagó quien lo marca, dividido entre todos los
        // participantes — editable después desde "Editar gasto" si no
        // corresponde.
        paidByUserId: currentUserId ?? undefined,
        splitUserIds: participants.map((p) => p.userId),
      });
      await load();
    } catch {
      setPendingPaymentError('No se pudo registrar el pago.');
    } finally {
      setMarkingPaidId(null);
    }
  }

  // Invitar colaborador por email (tab Colaboradores) — el backend exige
  // que el usuario ya tenga cuenta creada (no hay invitación "pendiente"
  // por ahora, ver decisión con Lautaro 2026-07-04: solo colaboradores con
  // cuenta). Si el email no corresponde a ningún usuario, el backend
  // devuelve 404 y se muestra tal cual.
  async function handleAddCollaborator() {
    if (!trip || !collabEmail.trim()) return;
    setSavingCollab(true);
    setCollabError(null);
    try {
      await addCollaborator(trip.id, { email: collabEmail.trim(), role: collabRole });
      setCollabEmail('');
      setCollabRole('editor');
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo agregar al colaborador.';
      setCollabError(message);
    } finally {
      setSavingCollab(false);
    }
  }

  // Reparto de un hotel/vuelo compartido entre viajeros (tabs Hoteles/
  // Vuelos) — abre el editor precargado con el reparto existente, o con
  // partes iguales del precio total si todavía no se armó ninguno.
  function openShareEditor(type: 'hotel' | 'flight', item: SavedHotel | SavedFlight) {
    setEditingSharesFor({ type, id: item.id });
    setSharesError(null);
    const draft: Record<string, string> = {};
    if (item.shares.length > 0) {
      for (const s of item.shares) draft[s.userId] = String(s.amount);
    } else if (item.price != null && participants.length > 0) {
      const each = Math.round((item.price / participants.length) * 100) / 100;
      for (const p of participants) draft[p.userId] = String(each);
    }
    setShareDrafts(draft);
  }

  function cancelShareEditor() {
    setEditingSharesFor(null);
    setShareDrafts({});
    setSharesError(null);
  }

  function setShareDraftAmount(userId: string, value: string) {
    setShareDrafts((prev) => ({ ...prev, [userId]: value }));
  }

  // Guarda el reparto — solo entran los participantes con un monto > 0
  // cargado (dejar un campo vacío o en 0 equivale a "no viaja en esta
  // reserva"). El backend nunca toca una parte ya pagada, así que esto es
  // seguro de reintentar aunque alguno ya haya pagado la suya.
  async function handleSaveShares(type: 'hotel' | 'flight', itemId: string) {
    setSavingShares(true);
    setSharesError(null);
    try {
      const shares = participants
        .map((p) => ({ userId: p.userId, amount: Number(shareDrafts[p.userId]) }))
        .filter((s) => Number.isFinite(s.amount) && s.amount > 0);
      if (type === 'hotel') await updateHotelShares(itemId, shares);
      else await updateFlightShares(itemId, shares);
      setEditingSharesFor(null);
      setShareDrafts({});
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo guardar el reparto.';
      setSharesError(message);
    } finally {
      setSavingShares(false);
    }
  }

  // Marca la parte de un viajero puntual como pagada (fila individual en
  // Gastos → Pendientes de pago, ver más abajo) — a diferencia de
  // handleMarkAsPaid, esto no divide nada: crea un gasto a nombre de esa
  // persona sola por su propio monto.
  async function handlePayShare(share: BookingShare) {
    setPayingShareId(share.id);
    setSharePayError(null);
    try {
      // Siempre mandamos una fecha explícita (hoy si no se tocó el date
      // picker) en vez de dejar que el backend la calcule solo — evita
      // ambigüedad de timezone entre el server y quien está registrando el
      // pago (mismo criterio que handleMarkAsPaid con todayISO()).
      await payBookingShare(share.id, shareDates[share.id] || todayISO());
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'No se pudo registrar el pago.';
      setSharePayError(message);
    } finally {
      setPayingShareId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Viaje no encontrado'}</Text>
      </View>
    );
  }

  // Métrica real de "plan completo": promedio de si hay itinerario cargado
  // (con al menos una actividad por día), hoteles, vuelos y presupuesto.
  // No es un número inventado — se recalcula con los datos reales del trip.
  const itinScore = days.length === 0 ? 0 : days.filter((d) => (d.activities?.length ?? 0) > 0).length / days.length;
  const hotelsScore = hotels.length > 0 ? 1 : 0;
  const flightsScore = flights.length > 0 ? 1 : 0;
  const budgetScore = budget && budget.categories.length > 0 ? 1 : 0;
  const planPct = Math.round(((itinScore + hotelsScore + flightsScore + budgetScore) / 4) * 100);
  const daysCount = Math.max(
    1,
    Math.round((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86_400_000)
  );

  const totalSpent = budget ? num(budget.totalSpent) : 0;
  const totalPlanned = budget ? num(budget.totalPlanned) : 0;
  const utilized = pct(totalSpent, totalPlanned);
  const remaining = totalPlanned - totalSpent;
  const overBudget = totalSpent > totalPlanned && totalPlanned > 0;

  // La pestaña "Gastos" antes solo aparecía con el viaje Confirmado/En
  // curso; a pedido de Lautaro (2026-07-02) se habilitó para cualquier
  // estado, incluido Planificando — se puede ir cargando gastos de la
  // previa desde que arrancás a organizar el viaje.
  const tabs = BASE_TABS.map((t, i) => ({ ...t, num: String(i + 1).padStart(2, '0') }));

  const categoryOptions = (budget?.categories ?? []).map((c) => ({ value: c.category_id, label: c.name }));

  // Hoteles/vuelos con precio cargado que todavía no tienen un gasto real
  // que los referencie (source_hotel_id/source_flight_id) — "Pendientes de
  // pago" en la tab Gastos. Se recalcula acá mismo (no en el backend) para
  // no sumar un endpoint nuevo: ya tenemos hotels/flights/expenses cargados.
  const paidHotelIds = new Set(expenses.map((e) => e.sourceHotelId).filter((id): id is string => Boolean(id)));
  const paidFlightIds = new Set(expenses.map((e) => e.sourceFlightId).filter((id): id is string => Boolean(id)));
  // Con reparto armado (shares.length > 0), "pendiente" se decide por
  // persona (algún share sin pagar) en vez de por si YA existe algún gasto
  // con ese source_hotel_id/source_flight_id — con varios viajeros pagando
  // por separado, puede haber más de un gasto apuntando al mismo hotel/
  // vuelo sin que eso signifique que ya está resuelto del todo.
  const pendingPayments: PendingPayment[] = [
    ...hotels
      .filter((h) => h.price != null && (h.shares.length > 0 ? h.shares.some((s) => !s.paid) : !paidHotelIds.has(h.id)))
      .map((h) => ({
        id: h.id,
        type: 'hotel' as const,
        title: h.name,
        price: h.price!,
        currency: h.currency ?? trip.currency,
        budgetCategoryId: h.budgetCategoryId,
        shares: h.shares,
      })),
    ...flights
      .filter((f) => f.price != null && (f.shares.length > 0 ? f.shares.some((s) => !s.paid) : !paidFlightIds.has(f.id)))
      .map((f) => ({
        id: f.id,
        type: 'flight' as const,
        title: f.flightNumber
          ? `Vuelo ${f.flightNumber}`
          : `${f.departureAirport ?? '???'} → ${f.arrivalAirport ?? '???'}`,
        price: f.price!,
        currency: f.currency ?? trip.currency,
        budgetCategoryId: f.budgetCategoryId,
        shares: f.shares,
      })),
  ];

  // Gráfico "Gasto por categoría" (tab Presupuesto) — barra apilada
  // horizontal con flex: spent por segmento, sin react-native-svg (no está
  // instalado). Misma lógica que tenía la pantalla global /(tabs)/budget
  // antes de eliminarse.
  const chartSegments = (() => {
    if (!budget) return [];
    const categorized = budget.categories
      .map((c, i) => ({ id: c.category_id, name: c.name, spent: num(c.spent_amount), color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))
      .filter((c) => c.spent > 0);
    const categorizedTotal = categorized.reduce((sum, c) => sum + c.spent, 0);
    const uncategorized = Math.max(0, totalSpent - categorizedTotal);
    return uncategorized > 0.01
      ? [...categorized, { id: '__none__', name: 'Sin categoría', spent: uncategorized, color: colors.line }]
      : categorized;
  })();

  // "Gastos de la previa" vs. "durante el viaje": no hay un campo en el
  // modelo de datos para esto (ver expenses.expense_date nomás), así que se
  // deriva acá comparando contra trip.startDate. Todo lo anterior al primer
  // día es "previa"; desde el primer día en adelante (incluye el regreso)
  // cuenta como "durante".
  const sortedExpenses = [...expenses].sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : a.expenseDate > b.expenseDate ? -1 : 0));
  const preTripExpenses = sortedExpenses.filter((e) => e.expenseDate < trip.startDate);
  const duringTripExpenses = sortedExpenses.filter((e) => e.expenseDate >= trip.startDate);
  const preTripTotal = preTripExpenses.reduce((sum, e) => sum + num(e.amount), 0);
  const duringTripTotal = duringTripExpenses.reduce((sum, e) => sum + num(e.amount), 0);

  // Tab Balances (2026-07 split-expenses): saldo neto por participante +
  // simplificación de deudas, todo client-side a partir de expenses (con
  // splits) y participants — ver src/utils/splitBalances.ts.
  const balances = computeBalances(expenses, participants);
  const settleUps = simplifyDebts(balances);
  const isOwner = !!trip && currentUserId === trip.ownerId;

  function renderExpenseRow(exp: Expense) {
    const cat = budget?.categories.find((c) => c.category_id === exp.budgetCategoryId);
    return (
      <View key={exp.id} style={styles.expenseRow}>
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseDescription}>{exp.description}</Text>
          <Text style={styles.expenseMeta}>
            {exp.expenseDate} · {cat ? `${categoryGlyph(cat.name)} ${cat.name}` : 'Sin categoría'}
            {exp.paidByName ? ` · Pagó ${exp.paidByName}` : ''}
          </Text>
          {exp.splits.length > 0 ? (
            <Text style={styles.expenseSplitMeta}>
              🔀 Dividido entre {exp.splits.length}: {exp.splits.map((s) => s.name).join(', ')}
            </Text>
          ) : null}
        </View>
        <Text style={styles.expenseAmount}>
          {money(exp.amount)} <Text style={styles.expenseCurrency}>{exp.currency}</Text>
        </Text>
        <View style={styles.expenseActions}>
          <Pressable hitSlop={8} onPress={() => handleStartEditExpense(exp)}>
            <Text style={styles.itemEditGlyph}>✎</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => setDeleteTarget({ type: 'expense', id: exp.id, name: exp.description })}>
            <Text style={styles.itemDeleteGlyph}>✕</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Sección "Reparto" de una tarjeta de hotel/vuelo (tabs Hoteles/Vuelos,
  // 2026-07-06) — deja armar/editar cuánto le toca a cada viajero de este
  // hotel/vuelo COMPARTIDO. Solo tiene sentido con precio cargado y más de
  // un participante en el viaje; si no, no se muestra nada.
  function renderShareSection(type: 'hotel' | 'flight', item: SavedHotel | SavedFlight) {
    if (item.price == null || participants.length <= 1) return null;
    const isEditing = editingSharesFor?.type === type && editingSharesFor.id === item.id;

    if (isEditing) {
      return (
        <View style={styles.sharesEditor}>
          <Text style={styles.sharesEditorTitle}>Reparto entre viajeros</Text>
          {participants.map((p) => {
            // Una parte ya pagada no se puede tocar desde acá (el backend
            // la protege igual, pero mejor no dejar editar un campo que en
            // los hechos no va a cambiar nada).
            const existing = item.shares.find((s) => s.userId === p.userId);
            if (existing?.paid) {
              return (
                <View key={p.userId} style={styles.shareEditorRow}>
                  <Text style={styles.shareEditorName}>{p.name}</Text>
                  <Text style={styles.shareEditorPaidNote}>{money(existing.amount)} · ya pagado</Text>
                </View>
              );
            }
            return (
              <View key={p.userId} style={styles.shareEditorRow}>
                <Text style={styles.shareEditorName}>{p.name}</Text>
                <TextInput
                  style={styles.shareEditorInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  value={shareDrafts[p.userId] ?? ''}
                  onChangeText={(v) => setShareDraftAmount(p.userId, v)}
                />
              </View>
            );
          })}
          <Text style={styles.shareEditorHint}>Dejar en 0 o vacío = esa persona no viaja en esta reserva.</Text>
          {sharesError ? <Text style={styles.error}>{sharesError}</Text> : null}
          <View style={styles.shareEditorActions}>
            <Pressable onPress={cancelShareEditor}>
              <Text style={styles.link}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={styles.smallButton}
              onPress={() => handleSaveShares(type, item.id)}
              disabled={savingShares}
            >
              <Text style={styles.smallButtonText}>{savingShares ? 'Guardando...' : 'Guardar reparto'}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (item.shares.length > 0) {
      return (
        <View style={styles.sharesSummary}>
          <Text style={styles.sharesSummaryText}>
            🔀 {item.shares.map((s) => `${s.name} ${money(s.amount)}${s.paid ? ' ✓' : ''}`).join(' · ')}
          </Text>
          <Pressable onPress={() => openShareEditor(type, item)}>
            <Text style={styles.link}>Editar reparto</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <Pressable onPress={() => openShareEditor(type, item)}>
        <Text style={styles.link}>+ Repartir entre viajeros</Text>
      </Pressable>
    );
  }

  return (
    <>
      {/* El header nativo queda oculto — el AppHeader compartido (mismo
          componente que usa app/(tabs)/_layout.tsx) dibuja el suyo. Desde
          el 2026-07-02 el botón "← Volver" ya no es un prop que hay que
          pasar a mano: AppHeader lo muestra solo en cualquier pantalla que
          no sea Inicio (mirando la ruta actual), y siempre vuelve a Inicio
          en vez de usar el historial de navegación. */}
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <AppHeader safeTop />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={styles.heroHead}>
            <View style={styles.heroTextCol}>
              <Text style={styles.eyebrow}>
                {STATUS_LABEL[trip.status].toUpperCase()} · {daysCount} DÍAS
              </Text>
              <Text style={styles.heroTitle}>{trip.title}</Text>
              <Text style={styles.heroSub}>
                Tu dossier completo: itinerario, presupuesto, reservas y mapa. Todo en un lugar, listo para
                cuando aterrices.
              </Text>
            </View>
            <View style={styles.heroActions}>
              <Pressable style={styles.ghostButton} onPress={handleShare}>
                <Text style={styles.ghostButtonText}>Compartir</Text>
              </Pressable>
              <Pressable style={styles.solidButton} onPress={() => router.push(`/trip/${tripId}/edit`)}>
                <Text style={styles.solidButtonText}>Editar viaje</Text>
              </Pressable>
              <Pressable style={styles.dangerButton} onPress={() => setConfirmingDelete(true)}>
                <Text style={styles.dangerButtonText}>Eliminar viaje</Text>
              </Pressable>
            </View>
          </View>

          {/* Tarjeta de embarque */}
          <View style={styles.pass}>
            <View style={styles.passMain}>
              <Text style={styles.passEyebrow}>DOSSIER DE VIAJE · {trip.destination.toUpperCase()}</Text>
              {/* Restructurado (2026-07-03): antes eran 3 columnas iguales
                  (INICIO / FIN / MONEDA) en una fila, y con el ancho real
                  de passMain (descontando el stub de 140px) cada columna
                  quedaba en ~40-45px — la fecha completa en ISO
                  ("2026-12-23") se partía en 2-3 renglones. Ahora INICIO y
                  FIN comparten una sola línea con formato corto ("23 DIC →
                  01 ENE", vía el mismo formatShort que ya usa la tarjeta de
                  Inicio) y MONEDA baja a su propia fila — cada renglón usa
                  todo el ancho de passMain en vez de pelear por una
                  fracción. */}
              <View style={styles.passGrid}>
                <View style={styles.passGridRow}>
                  <Text style={styles.passGridK}>FECHAS</Text>
                  <Text style={styles.passGridV}>
                    {formatShort(trip.startDate)} → {formatShort(trip.endDate)}
                  </Text>
                </View>
                <View style={styles.passGridRow}>
                  <Text style={styles.passGridK}>MONEDA</Text>
                  <Text style={styles.passGridV}>{trip.currency}</Text>
                </View>
              </View>
            </View>
            <View style={styles.passStub}>
              <View style={styles.perfTop} />
              <View style={styles.perfBottom} />
              <Text style={styles.stubK}>PROGRESO DEL PLAN</Text>
              <ProgressBadge pct={planPct} />
              <View style={styles.stubDivider} />
              <Text style={styles.stubK}>ESTADO</Text>
              <Text style={styles.stubStatus}>{STATUS_LABEL[trip.status].toUpperCase()}</Text>
            </View>
          </View>

          {/* Selector de pestañas */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
            <View style={styles.tabs}>
              {tabs.map((t) => (
                <Pressable key={t.key} style={styles.tab} onPress={() => setActiveTab(t.key)}>
                  <Text style={[styles.tabNum, activeTab === t.key && styles.tabNumActive]}>{t.num}</Text>
                  <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
                  {activeTab === t.key ? <View style={styles.tabIndicator} /> : null}
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* ---------- Panel: Itinerario ---------- */}
          {activeTab === 'itin' ? (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Itinerario día a día</Text>
              </View>

              {days.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.muted}>Todavía no armaste el itinerario día por día.</Text>
                </View>
              ) : (
                days.map((day) => (
                  <View key={day.id} style={styles.dayBlock}>
                    <View style={styles.dayHeader}>
                      <View style={styles.dayNum}>
                        <Text style={styles.dayNumText}>{day.dayNumber}</Text>
                      </View>
                      <Text style={styles.dayDate}>{day.dayDate}</Text>
                    </View>
                    {day.notes ? <Text style={styles.dayNotes}>{day.notes}</Text> : null}

                    {(day.activities ?? []).length === 0 ? (
                      <Text style={styles.noActivities}>Sin actividades cargadas todavía.</Text>
                    ) : (
                      <View style={styles.timeline}>
                        <View style={styles.timelineLine} />
                        {day.activities!.map((activity) => (
                          <TimelineItem
                            key={activity.id}
                            activity={activity}
                            onDelete={() => setDeleteTarget({ type: 'activity', id: activity.id, name: activity.title })}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                ))
              )}

              <View style={styles.form}>
                <Text style={styles.formTitle}>+ Agregar actividad</Text>

                {days.length === 0 ? (
                  <Text style={styles.hint}>Primero creá un día para el itinerario.</Text>
                ) : (
                  <>
                    <Text style={styles.formLabel}>DÍA</Text>
                    <View style={styles.formChipRow}>
                      {days.map((day) => (
                        <Pressable
                          key={day.id}
                          style={[styles.formChip, selectedDayId === day.id && styles.formChipSelected]}
                          onPress={() => setSelectedDayId(day.id)}
                        >
                          <Text style={[styles.formChipLabel, selectedDayId === day.id && styles.formChipLabelSelected]}>
                            Día {day.dayNumber}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                {addingDay ? (
                  <View style={styles.newDayRow}>
                    <View style={styles.newDayField}>
                      <DatePickerField
                        glyph="🗓️"
                        label="Fecha del nuevo día"
                        placeholder="Elegí una fecha"
                        value={newDayDate}
                        onChange={setNewDayDate}
                      />
                    </View>
                    <Pressable style={styles.smallButton} onPress={handleAddDay} disabled={savingDay}>
                      <Text style={styles.smallButtonText}>{savingDay ? 'Creando...' : 'Crear'}</Text>
                    </Pressable>
                    <Pressable style={styles.smallButtonGhost} onPress={() => setAddingDay(false)}>
                      <Text style={styles.smallButtonGhostText}>Cancelar</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setAddingDay(true)}>
                    <Text style={styles.link}>+ Agregar día nuevo</Text>
                  </Pressable>
                )}

                <Text style={styles.formLabel}>CATEGORÍA</Text>
                <View style={styles.formChipRow}>
                  {ACTIVITY_CATEGORY_OPTIONS.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[styles.formChip, activityCategory === cat && styles.formChipSelected]}
                      onPress={() => setActivityCategory(cat)}
                    >
                      <Text style={[styles.formChipLabel, activityCategory === cat && styles.formChipLabelSelected]}>
                        {CATEGORY_GLYPH[cat]} {CATEGORY_LABEL[cat]}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Título (ej: Visita al cerro)"
                  placeholderTextColor={colors.muted}
                  value={activityTitle}
                  onChangeText={setActivityTitle}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Lugar (opcional)"
                  placeholderTextColor={colors.muted}
                  value={activityLocation}
                  onChangeText={setActivityLocation}
                />
                <Text style={styles.hint}>
                  Si cargás el lugar, la ubicación en el mapa se calcula sola (geocoding automático).
                </Text>
                <View style={styles.formRow}>
                  <View style={styles.formRowField}>
                    <TimePickerField glyph="🕐" label="Hora" value={activityTime} onChange={setActivityTime} />
                  </View>
                  <View style={styles.formRowField}>
                    <PriceField glyph="💲" label="Costo estimado" value={activityCost} onChange={setActivityCost} />
                  </View>
                </View>

                {itinFormError ? <Text style={styles.error}>{itinFormError}</Text> : null}

                <Pressable style={styles.button} onPress={handleAddActivity} disabled={savingActivity}>
                  <Text style={styles.buttonText}>{savingActivity ? 'Guardando...' : 'Agregar actividad'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* ---------- Panel: Presupuesto ---------- */}
          {activeTab === 'budget' ? (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Presupuesto</Text>
              </View>

              {budget ? (
                <View style={styles.budgetGrid}>
                  <View style={styles.catsCard}>
                    {budget.categories.length === 0 ? (
                      <Text style={styles.muted}>Todavía no cargaste categorías de presupuesto.</Text>
                    ) : (
                      budget.categories.map((cat, i) => {
                        const spent = num(cat.spent_amount);
                        const planned = num(cat.planned_amount);
                        const catColor = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                        return (
                          <View key={cat.category_id} style={styles.cat}>
                            <View style={styles.catRow}>
                              <View style={styles.catName}>
                                <View style={[styles.catDot, { backgroundColor: catColor }]} />
                                <Text style={styles.catNameText}>
                                  {categoryGlyph(cat.name)} {cat.name}
                                </Text>
                              </View>
                              <View style={styles.catRowRight}>
                                <Text style={styles.catAmt}>
                                  {money(spent)} / {money(planned)}
                                </Text>
                                <Pressable
                                  hitSlop={8}
                                  onPress={() => setDeleteTarget({ type: 'category', id: cat.category_id, name: cat.name })}
                                >
                                  <Text style={styles.itemDeleteGlyph}>✕</Text>
                                </Pressable>
                              </View>
                            </View>
                            <View style={styles.track}>
                              <View style={[styles.trackFill, { width: `${Math.min(pct(spent, planned), 100)}%`, backgroundColor: catColor }]} />
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>

                  <View style={styles.totalCard}>
                    <Text style={styles.totalEyebrow}>GASTADO</Text>
                    <Text style={styles.totalBig}>
                      {money(totalSpent)} <Text style={styles.totalCurrency}>{trip.currency}</Text>
                    </Text>
                    <Text style={styles.totalRem}>
                      {remaining >= 0 ? `Quedan ${money(remaining)} de ${money(totalPlanned)}` : `${money(-remaining)} de más`}
                    </Text>
                    <View style={styles.totalBar}>
                      <View style={[styles.totalBarFill, { width: `${Math.min(utilized, 100)}%` }, overBudget && styles.totalBarFillOver]} />
                    </View>
                    <Text style={styles.totalPctLabel}>{Math.round(utilized)}% DEL LÍMITE USADO</Text>
                  </View>
                </View>
              ) : null}

              {/* Gráfico: gasto por categoría (antes vivía solo en la
                  pantalla global /(tabs)/budget, ya eliminada). */}
              <View style={styles.chartCard}>
                <Text style={styles.formTitle}>Gasto por categoría</Text>
                {chartSegments.length === 0 ? (
                  <Text style={styles.muted}>Todavía no hay gastos cargados.</Text>
                ) : (
                  <>
                    <View style={styles.chartBar}>
                      {chartSegments.map((seg) => (
                        <View key={seg.id} style={{ flex: seg.spent, backgroundColor: seg.color }} />
                      ))}
                    </View>
                    <View style={styles.chartLegend}>
                      {chartSegments.map((seg) => (
                        <View key={seg.id} style={styles.chartLegendRow}>
                          <View style={[styles.catDot, { backgroundColor: seg.color }]} />
                          <Text style={styles.chartLegendName}>{seg.name}</Text>
                          <Text style={styles.chartLegendAmt}>
                            {money(seg.spent)} {trip.currency} · {Math.round(pct(seg.spent, totalSpent))}%
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>

              <View style={styles.form}>
                <Text style={styles.formTitle}>+ Agregar categoría</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre (ej: Hospedaje)"
                  placeholderTextColor={colors.muted}
                  value={categoryName}
                  onChangeText={setCategoryName}
                />
                <PriceField glyph="💲" label="Monto planificado" value={categoryPlanned} onChange={setCategoryPlanned} />
                {categoryError ? <Text style={styles.error}>{categoryError}</Text> : null}
                <Pressable style={styles.button} onPress={handleAddCategory} disabled={savingCategory}>
                  <Text style={styles.buttonText}>{savingCategory ? 'Guardando...' : 'Agregar categoría'}</Text>
                </Pressable>
              </View>

              <Pressable style={styles.budgetCta} onPress={() => setActiveTab('expenses')}>
                <Text style={styles.budgetCtaText}>Para registrar un gasto real, andá a la pestaña Gastos →</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ---------- Panel: Gastos ---------- */}
          {activeTab === 'expenses' ? (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Gastos del viaje</Text>
              </View>

              <View style={styles.totalCard}>
                <Text style={styles.totalEyebrow}>GASTADO EN TOTAL</Text>
                <Text style={styles.totalBig}>
                  {money(totalSpent)} <Text style={styles.totalCurrency}>{trip.currency}</Text>
                </Text>
                <Text style={styles.totalRem}>
                  {money(preTripTotal)} de la previa · {money(duringTripTotal)} durante el viaje
                </Text>
              </View>

              {pendingPayments.length > 0 ? (
                <View style={styles.expenseSection}>
                  <Text style={styles.expenseSectionTitle}>Pendientes de pago</Text>
                  <Text style={styles.muted}>
                    Hoteles y vuelos guardados con precio que todavía no pasaste a gastos.
                  </Text>
                  {pendingPaymentError ? <Text style={styles.error}>{pendingPaymentError}</Text> : null}
                  {sharePayError ? <Text style={styles.error}>{sharePayError}</Text> : null}
                  {pendingPayments.map((item) => {
                    const cat = budget?.categories.find((c) => c.category_id === item.budgetCategoryId);

                    // Hotel/vuelo COMPARTIDO con reparto armado (tabs Hoteles/
                    // Vuelos): cada persona marca su propia parte, con su propio
                    // monto y fecha — en vez de un único botón para todo el ítem.
                    if (item.shares.length > 0) {
                      return (
                        <View key={`${item.type}-${item.id}`} style={styles.pendingShareGroup}>
                          <Text style={styles.expenseDescription}>
                            {item.type === 'hotel' ? '🏨' : '✈️'} {item.title}
                          </Text>
                          <Text style={styles.expenseMeta}>
                            {cat ? `${categoryGlyph(cat.name)} ${cat.name}` : 'Sin categoría'} · repartido entre{' '}
                            {item.shares.length}
                          </Text>
                          {item.shares.map((share) => (
                            <View key={share.id} style={styles.pendingShareRow}>
                              <Text style={styles.pendingShareName}>{share.name}</Text>
                              <Text style={styles.pendingShareAmount}>
                                {money(share.amount)} <Text style={styles.expenseCurrency}>{item.currency}</Text>
                              </Text>
                              {share.paid ? (
                                <Text style={styles.pendingSharePaid}>
                                  ✓ {share.paidAt ? formatShort(share.paidAt) : 'Pagado'}
                                </Text>
                              ) : (
                                <View style={styles.pendingSharePayControls}>
                                  <View style={styles.pendingShareDateField}>
                                    <DatePickerField
                                      glyph="🗓️"
                                      label="Fecha"
                                      placeholder="Hoy"
                                      value={shareDates[share.id] ?? ''}
                                      onChange={(v) => setShareDates((prev) => ({ ...prev, [share.id]: v }))}
                                    />
                                  </View>
                                  <Pressable
                                    style={[
                                      styles.markPaidButton,
                                      payingShareId === share.id && styles.markPaidButtonDisabled,
                                    ]}
                                    onPress={() => handlePayShare(share)}
                                    disabled={payingShareId === share.id}
                                  >
                                    <Text style={styles.markPaidButtonText}>
                                      {payingShareId === share.id ? '...' : 'Marcar pagado'}
                                    </Text>
                                  </Pressable>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                      );
                    }

                    return (
                      <View key={`${item.type}-${item.id}`} style={styles.expenseRow}>
                        <View style={styles.expenseInfo}>
                          <Text style={styles.expenseDescription}>
                            {item.type === 'hotel' ? '🏨' : '✈️'} {item.title}
                          </Text>
                          <Text style={styles.expenseMeta}>
                            {cat ? `${categoryGlyph(cat.name)} ${cat.name}` : 'Sin categoría'}
                          </Text>
                        </View>
                        <Text style={styles.expenseAmount}>
                          {money(item.price)} <Text style={styles.expenseCurrency}>{item.currency}</Text>
                        </Text>
                        <Pressable
                          style={[styles.markPaidButton, markingPaidId === item.id && styles.markPaidButtonDisabled]}
                          onPress={() => handleMarkAsPaid(item)}
                          disabled={markingPaidId === item.id}
                        >
                          <Text style={styles.markPaidButtonText}>
                            {markingPaidId === item.id ? '...' : 'Marcar pagado'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.form}>
                <Text style={styles.formTitle}>{editingExpenseId ? 'Editar gasto' : '+ Registrar gasto'}</Text>
                <SelectField
                  glyph="🏷️"
                  label="Categoría (opcional)"
                  placeholder="Sin categoría"
                  value={expenseCategoryId}
                  onChange={setExpenseCategoryId}
                  options={[{ value: '', label: 'Sin categoría' }, ...categoryOptions]}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Descripción (ej: Taxi al hotel)"
                  placeholderTextColor={colors.muted}
                  value={expenseDescription}
                  onChangeText={setExpenseDescription}
                />
                <View style={styles.formRow}>
                  <View style={styles.formRowField}>
                    <PriceField glyph="💲" label="Monto" value={expenseAmount} onChange={setExpenseAmount} />
                  </View>
                  <View style={styles.formRowField}>
                    <DatePickerField glyph="🗓️" label="Fecha" placeholder="Elegí una fecha" value={expenseDate} onChange={setExpenseDate} />
                  </View>
                </View>
                {participants.length > 1 ? (
                  <>
                    <SelectField
                      glyph="🙋"
                      label="Pagado por"
                      placeholder="Elegí quién pagó"
                      value={expensePaidBy}
                      onChange={setExpensePaidBy}
                      options={participants.map((p) => ({ value: p.userId, label: p.name }))}
                    />
                    <Text style={styles.splitFieldLabel}>DIVIDIR ENTRE</Text>
                    <View style={styles.formChipRow}>
                      {participants.map((p) => (
                        <Pressable
                          key={p.userId}
                          style={[styles.formChip, splitParticipantIds.includes(p.userId) && styles.formChipSelected]}
                          onPress={() => toggleSplitParticipant(p.userId)}
                        >
                          <Text
                            style={[styles.formChipLabel, splitParticipantIds.includes(p.userId) && styles.formChipLabelSelected]}
                          >
                            {p.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                {expenseFormError ? <Text style={styles.error}>{expenseFormError}</Text> : null}
                <Pressable style={styles.button} onPress={handleSubmitExpense} disabled={savingExpense}>
                  <Text style={styles.buttonText}>
                    {savingExpense ? 'Guardando...' : editingExpenseId ? 'Actualizar gasto' : 'Registrar gasto'}
                  </Text>
                </Pressable>
                {editingExpenseId ? (
                  <Pressable onPress={resetExpenseForm}>
                    <Text style={styles.link}>Cancelar edición</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.expenseSection}>
                <Text style={styles.expenseSectionTitle}>Gastos de la previa</Text>
                {preTripExpenses.length === 0 ? (
                  <Text style={styles.muted}>Todavía no cargaste gastos anteriores al viaje.</Text>
                ) : (
                  <>
                    {preTripExpenses.map(renderExpenseRow)}
                    <Text style={styles.expenseSectionTotal}>
                      Subtotal: {money(preTripTotal)} {trip.currency}
                    </Text>
                  </>
                )}
              </View>

              <View style={styles.expenseSection}>
                <Text style={styles.expenseSectionTitle}>Gastos durante el viaje</Text>
                {duringTripExpenses.length === 0 ? (
                  <Text style={styles.muted}>Todavía no cargaste gastos durante el viaje.</Text>
                ) : (
                  <>
                    {duringTripExpenses.map(renderExpenseRow)}
                    <Text style={styles.expenseSectionTotal}>
                      Subtotal: {money(duringTripTotal)} {trip.currency}
                    </Text>
                  </>
                )}
              </View>
            </View>
          ) : null}

          {/* ---------- Panel: Balances ---------- */}
          {activeTab === 'balances' ? (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Balances entre participantes</Text>
              </View>
              {participants.length <= 1 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.muted}>
                    Este viaje todavía no tiene colaboradores — invitá a alguien desde la pestaña Colaboradores para
                    empezar a dividir gastos.
                  </Text>
                </View>
              ) : expenses.every((e) => e.splits.length === 0) ? (
                <View style={styles.emptyState}>
                  <Text style={styles.muted}>
                    Todavía no hay gastos divididos. Al registrar un gasto en la tab Gastos, elegí quién pagó y entre
                    quiénes se divide.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.expenseSection}>
                    <Text style={styles.expenseSectionTitle}>Saldo neto</Text>
                    {balances.map((b) => (
                      <View key={b.userId} style={styles.balanceRow}>
                        <Text style={styles.balanceName}>{b.name}</Text>
                        <Text
                          style={[
                            styles.balanceAmount,
                            b.net > 0.01 ? styles.balancePositive : b.net < -0.01 ? styles.balanceNegative : styles.balanceNeutral,
                          ]}
                        >
                          {b.net > 0.01 ? `+${money(b.net)}` : b.net < -0.01 ? `−${money(Math.abs(b.net))}` : '0'}{' '}
                          {trip.currency}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.expenseSection}>
                    <Text style={styles.expenseSectionTitle}>Para saldar cuentas</Text>
                    {settleUps.length === 0 ? (
                      <Text style={styles.muted}>Ya está todo saldado — nadie le debe a nadie.</Text>
                    ) : (
                      settleUps.map((s, i) => (
                        <View key={i} style={styles.settleRow}>
                          <Text style={styles.settleText}>
                            {s.fromName} → {s.toName}
                          </Text>
                          <Text style={styles.settleAmount}>
                            {money(s.amount)} {trip.currency}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </>
              )}
            </View>
          ) : null}

          {/* ---------- Panel: Hoteles ---------- */}
          {activeTab === 'hotels' ? (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Hoteles &amp; estadías</Text>
                <Pressable style={styles.headerLinkButton} onPress={handleGoToExplore}>
                  <Text style={styles.headerLinkButtonText}>+ Agregar reserva</Text>
                </Pressable>
              </View>
              {hotels.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.muted}>Todavía no guardaste hoteles para este viaje.</Text>
                </View>
              ) : (
                hotels.map((hotel) => (
                  <View key={hotel.id} style={styles.savedCard}>
                    <View style={styles.savedCardHeader}>
                      <Text style={styles.savedCardTitle}>🏨 {hotel.name}</Text>
                      <View style={styles.savedCardHeaderRight}>
                        <Pressable hitSlop={8} onPress={() => handleEditHotel(hotel)}>
                          <Text style={styles.itemEditGlyph}>✎</Text>
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          onPress={() => setDeleteTarget({ type: 'hotel', id: hotel.id, name: hotel.name })}
                        >
                          <Text style={styles.itemDeleteGlyph}>✕</Text>
                        </Pressable>
                      </View>
                    </View>
                    {hotel.checkInDate ? (
                      <Text style={styles.savedMeta}>
                        {formatShort(hotel.checkInDate)} → {hotel.checkOutDate ? formatShort(hotel.checkOutDate) : '—'}
                      </Text>
                    ) : null}
                    {hotel.price != null ? (
                      <Text style={styles.savedPrice}>
                        {hotel.price} <Text style={styles.savedPriceUnit}>{hotel.currency} / noche</Text>
                      </Text>
                    ) : null}
                    {renderShareSection('hotel', hotel)}
                  </View>
                ))
              )}
            </View>
          ) : null}

          {/* ---------- Panel: Vuelos ---------- */}
          {activeTab === 'flights' ? (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Vuelos</Text>
                <Pressable style={styles.headerLinkButton} onPress={handleGoToExplore}>
                  <Text style={styles.headerLinkButtonText}>+ Agregar vuelo</Text>
                </Pressable>
              </View>
              {flights.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.muted}>Todavía no guardaste vuelos para este viaje.</Text>
                </View>
              ) : (
                flights.map((flight) => {
                  const flightDay = flight.departureDatetime
                    ? days.find((d) => d.dayDate === flight.departureDatetime!.slice(0, 10))
                    : undefined;
                  return (
                    <View key={flight.id} style={styles.flightCard}>
                      <View style={styles.flightInfo}>
                        <View style={styles.flightMetaRow}>
                          <View style={[styles.legBadge, styles[`legBadge_${flight.legType}` as const]]}>
                            <Text style={styles.legBadgeText}>{LEG_TYPE_LABEL[flight.legType]}</Text>
                          </View>
                          {flightDay ? <Text style={styles.flightDayText}>Día {flightDay.dayNumber}</Text> : null}
                        </View>
                        <View style={styles.flightLeg}>
                          <View style={styles.flightEp}>
                            <Text style={styles.flightCode}>{flight.departureAirport ?? '???'}</Text>
                            <Text style={styles.flightTime}>
                              {flight.departureDatetime
                                ? new Date(flight.departureDatetime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                                : '--:--'}
                            </Text>
                          </View>
                          <View style={styles.flightPath}>
                            <Text style={styles.flightDur}>✈</Text>
                            <View style={styles.flightLine} />
                          </View>
                          <View style={styles.flightEp}>
                            <Text style={styles.flightCode}>{flight.arrivalAirport ?? '???'}</Text>
                            <Text style={styles.flightTime}>
                              {flight.arrivalDatetime
                                ? new Date(flight.arrivalDatetime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                                : '--:--'}
                            </Text>
                          </View>
                        </View>
                        {flight.hasLayover ? (
                          <Text style={styles.layoverText}>
                            🔀 Escala en {flight.layoverAirport ?? '???'}
                            {flight.layoverFlightNumber ? ` (vuelo ${flight.layoverFlightNumber})` : ''}
                            {flight.layoverDurationMinutes ? ` · ${minutesToHM(flight.layoverDurationMinutes)} de espera` : ''}
                          </Text>
                        ) : null}
                        {flight.price != null ? (
                          <Text style={styles.savedPrice}>
                            {flight.price} <Text style={styles.savedPriceUnit}>{flight.currency}</Text>
                          </Text>
                        ) : null}
                        {renderShareSection('flight', flight)}
                      </View>
                      <View style={styles.flightStub}>
                        {/* stubK es blanco 50% para el fondo OSCURO de
                            passStub — acá el fondo es paper2 (claro), así
                            que se pisa el color o quedaba casi invisible. */}
                        <Text style={[styles.stubK, styles.stubKOnLight]}>VUELO</Text>
                        <Text style={styles.stubV}>{flight.flightNumber ?? '—'}</Text>
                        {/* Editar/Eliminar apilados (no en fila): el stub
                            mide 108px de ancho, muy angosto para los dos
                            links uno al lado del otro sin que se corten o
                            se salgan de la caja — apilados heredan el
                            mismo gap:6 vertical del resto del stub. */}
                        <Pressable hitSlop={8} onPress={() => handleEditFlight(flight)}>
                          <Text style={styles.itemEditLink}>Editar</Text>
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          onPress={() =>
                            setDeleteTarget({
                              type: 'flight',
                              id: flight.id,
                              name: flight.flightNumber ?? `${flight.departureAirport ?? '???'} → ${flight.arrivalAirport ?? '???'}`,
                            })
                          }
                        >
                          <Text style={[styles.itemDeleteLink, styles.stubDeleteLink]}>Eliminar</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {/* ---------- Panel: Mapa ---------- */}
          {activeTab === 'map' ? (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Mapa del viaje</Text>
              </View>
              {pins.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.muted}>Todavía no hay actividades, hoteles o lugares con ubicación cargada.</Text>
                </View>
              ) : (
                <TripMapPreview pins={pins} centerLat={trip.destinationLat} centerLng={trip.destinationLng} />
              )}

              <View style={styles.legend}>
                <LegendItem color={colors.stamp} label="Hoteles" count={pins.filter((p) => p.type === 'hotel').length} />
                <LegendItem color={colors.teal} label="Actividades" count={pins.filter((p) => p.type === 'activity').length} />
                <LegendItem color={colors.gold} label="Lugares guardados" count={pins.filter((p) => p.type === 'place').length} />
              </View>
            </View>
          ) : null}

          {/* ---------- Panel: Colaboradores ---------- */}
          {activeTab === 'collab' ? (
            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>Colaboradores</Text>
              </View>

              {isOwner ? (
                <View style={styles.form}>
                  <Text style={styles.formTitle}>+ Invitar colaborador</Text>
                  <Text style={styles.muted}>Tiene que ser el email de alguien que ya tenga cuenta en la app.</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={collabEmail}
                    onChangeText={setCollabEmail}
                  />
                  <View style={styles.formChipRow}>
                    {(['editor', 'viewer'] as const).map((r) => (
                      <Pressable
                        key={r}
                        style={[styles.formChip, collabRole === r && styles.formChipSelected]}
                        onPress={() => setCollabRole(r)}
                      >
                        <Text style={[styles.formChipLabel, collabRole === r && styles.formChipLabelSelected]}>
                          {r === 'editor' ? 'Editor' : 'Solo lectura'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {collabError ? <Text style={styles.error}>{collabError}</Text> : null}
                  <Pressable style={styles.button} onPress={handleAddCollaborator} disabled={savingCollab}>
                    <Text style={styles.buttonText}>{savingCollab ? 'Agregando...' : 'Invitar'}</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.expenseSection}>
                <Text style={styles.expenseSectionTitle}>Participantes del viaje</Text>
                {participants.map((p) => (
                  <View key={p.userId} style={styles.collabRow}>
                    <View style={styles.collabInfo}>
                      <Text style={styles.collabName}>{p.name}</Text>
                      <Text style={styles.collabMeta}>{p.email}</Text>
                    </View>
                    <View style={styles.collabRoleBadge}>
                      <Text style={styles.collabRoleBadgeText}>
                        {p.role === 'owner' ? 'Dueño' : p.role === 'editor' ? 'Editor' : 'Lectura'}
                      </Text>
                    </View>
                    {isOwner && p.role !== 'owner' ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => setDeleteTarget({ type: 'collaborator', id: p.userId, name: p.name })}
                      >
                        <Text style={styles.itemDeleteGlyph}>✕</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <Pressable style={styles.deleteBackdrop} onPress={() => (deleting ? null : setConfirmingDelete(false))}>
          <Pressable style={styles.deleteCard} onPress={() => {}}>
            <Text style={styles.deleteTitle}>¿Eliminar este viaje?</Text>
            <Text style={styles.deleteBody}>
              Se va a borrar "{trip.title}" con todo su itinerario, presupuesto, hoteles y vuelos guardados. Esta
              acción no se puede deshacer.
            </Text>
            {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
            <View style={styles.deleteActions}>
              <Pressable style={styles.deleteCancelButton} onPress={() => setConfirmingDelete(false)} disabled={deleting}>
                <Text style={styles.deleteCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.deleteConfirmButton} onPress={handleConfirmDelete} disabled={deleting}>
                <Text style={styles.deleteConfirmText}>{deleting ? 'Eliminando...' : 'Sí, eliminar'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDeleteModal
        visible={deleteTarget != null}
        title={deleteTarget ? DELETE_COPY[deleteTarget.type].title : ''}
        body={
          deleteTarget
            ? `Se va a borrar ${DELETE_COPY[deleteTarget.type].noun} "${deleteTarget.name}". Esta acción no se puede deshacer.${DELETE_COPY[deleteTarget.type].extra ?? ''}`
            : ''
        }
        error={deleteItemError}
        deleting={deletingItem}
        onCancel={() => (deletingItem ? null : setDeleteTarget(null))}
        onConfirm={handleConfirmDeleteItem}
      />
    </>
  );
}

// Insignia de progreso circular — el boceto usa un anillo con arco
// proporcional (conic-gradient). Sin react-native-svg instalado (no se
// pudo correr npm install en esta sesión), un arco proporcional a mano con
// Views rotadas es fácil de romper visualmente sin poder previsualizarlo.
// En su lugar: insignia circular con el mismo peso visual, y el número es
// real (se calcula arriba a partir de itinerario/hoteles/vuelos/presupuesto
// del viaje, no un valor fijo).
function ProgressBadge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.ring}>
      <Text style={styles.ringPct}>{clamped}%</Text>
      <Text style={styles.ringLabel}>{clamped >= 100 ? 'LISTO' : 'EN PLAN'}</Text>
    </View>
  );
}

function LegendItem({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <View style={styles.legItem}>
      <View style={[styles.legMk, { backgroundColor: color }]} />
      <Text style={styles.legLabel}>{label}</Text>
      <Text style={styles.legCount}>{count}</Text>
    </View>
  );
}

function TimelineItem({ activity, onDelete }: { activity: Activity; onDelete: () => void }) {
  return (
    <View style={styles.item}>
      <View style={styles.node}>
        <View style={styles.nodeBadge}>
          <Text style={styles.nodeGlyph}>{CATEGORY_GLYPH[activity.category]}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              {activity.startTime ? <Text style={styles.timeText}>{activity.startTime}</Text> : null}
            </View>
            <Pressable hitSlop={8} style={styles.cardDeleteButton} onPress={onDelete}>
              <Text style={styles.itemDeleteGlyph}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.cardTitle}>{activity.title}</Text>
        </View>

        {activity.locationName ? (
          <View style={styles.locationRow}>
            <Text style={styles.locationGlyph}>📍</Text>
            <Text style={styles.locationText}>{activity.locationName}</Text>
          </View>
        ) : null}

        {activity.description ? <Text style={styles.description}>{activity.description}</Text> : null}

        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{CATEGORY_LABEL[activity.category]}</Text>
          </View>
          {activity.estimatedCost != null ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>~ ${activity.estimatedCost}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const NODE_SIZE = 40;
const NODE_COL = 56;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    padding: spacing.containerPadding,
    paddingBottom: 40,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.background },
  error: { color: colors.stamp, textAlign: 'center' },
  muted: { color: colors.muted },
  link: { color: colors.ink, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13 },

  // Hero
  heroHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: spacing.stackLg },
  // `flex: 1` sin más en un row con flexWrap deja que Yoga lo achique hasta
  // casi 0 en vez de mandar heroActions a su propia línea (bug visto en
  // celular: "Navidad" se renderizaba letra por letra en una columna de
  // unos 30px). `minWidth` le pone un piso: si no entra al lado de los
  // botones con ese ancho mínimo, ahora sí wrappea la fila completa en vez
  // de aplastar el texto.
  heroTextCol: { flex: 1, minWidth: 240 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11.5, letterSpacing: tracking.eyebrow, textTransform: 'uppercase', color: colors.muted },
  heroTitle: { fontFamily: fonts.displaySemibold, fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.6, marginTop: 6 },
  heroSub: { fontSize: 14.5, color: colors.inkSoft, marginTop: 8, maxWidth: 420 },
  heroActions: { flexDirection: 'row', gap: 10 },
  ghostButton: { borderWidth: 1, borderColor: colors.ink, borderRadius: radius.sm, paddingHorizontal: 15, paddingVertical: 9 },
  ghostButtonText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 13, color: colors.ink },
  solidButton: { backgroundColor: colors.ink, borderRadius: radius.sm, paddingHorizontal: 15, paddingVertical: 9 },
  solidButtonText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 13, color: colors.white },
  dangerButton: { borderWidth: 1, borderColor: colors.stamp, borderRadius: radius.sm, paddingHorizontal: 15, paddingVertical: 9 },
  dangerButtonText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 13, color: colors.stamp },

  // Modal de confirmación "Eliminar viaje"
  deleteBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.containerPadding },
  deleteCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  deleteTitle: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 18, color: colors.ink },
  deleteBody: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  deleteCancelButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  deleteCancelText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 14, color: colors.inkSoft },
  deleteConfirmButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.stamp },
  deleteConfirmText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 14, color: colors.white },

  // Tarjeta de embarque
  pass: {
    backgroundColor: colors.ink,
    borderRadius: radius.card,
    overflow: 'hidden',
    flexDirection: 'row',
    ...cardShadow,
  },
  passMain: { flex: 1, padding: spacing.gutter, gap: 4, justifyContent: 'center' },
  passEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: tracking.eyebrow,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 14,
  },
  passGrid: { gap: 10 },
  passGridRow: {},
  passGridK: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: tracking.wide, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' },
  passGridV: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 16, color: colors.white, marginTop: 4 },
  passStub: {
    width: 140,
    backgroundColor: colors.inkSoft,
    padding: spacing.stackMd,
    justifyContent: 'center',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.28)',
    borderStyle: 'dashed',
  },
  perfTop: { position: 'absolute', top: -11, left: -11, width: 22, height: 22, borderRadius: radius.full, backgroundColor: colors.background },
  perfBottom: { position: 'absolute', bottom: -11, left: -11, width: 22, height: 22, borderRadius: radius.full, backgroundColor: colors.background },
  stubK: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: tracking.wide, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' },
  stubDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 12 },
  stubStatus: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 13, color: colors.stamp, marginTop: 3 },

  // Insignia circular de progreso (dentro del stub)
  ring: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 7,
    borderColor: colors.stamp,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 4,
    // passStub tiene alignItems por default ('stretch'), pero al tener un
    // ancho fijo el ring no se estira — sin esto quedaba pegado al borde
    // izquierdo del stub en vez de centrado, mientras las etiquetas de
    // texto de al lado (que sí ocupan el ancho completo) parecían
    // "descentradas" respecto a él.
    alignSelf: 'center',
  },
  ringPct: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 17, color: colors.white },
  ringLabel: { fontFamily: fonts.mono, fontSize: 8, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, marginTop: 1 },

  // Selector de pestañas
  tabsScroll: { marginTop: spacing.stackLg, flexGrow: 0 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', flexDirection: 'row', gap: 8, position: 'relative' },
  tabNum: { fontFamily: fonts.mono, fontSize: 11, color: colors.line },
  tabNumActive: { color: colors.stamp },
  tabLabel: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 14, color: colors.muted },
  tabLabelActive: { color: colors.ink },
  tabIndicator: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, backgroundColor: colors.stamp },

  // Panel genérico
  panel: { paddingTop: spacing.stackLg },
  panelHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: spacing.stackLg, flexWrap: 'wrap' },
  panelTitle: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 21, color: colors.ink, letterSpacing: -0.3 },
  headerLinkButton: { paddingVertical: 4 },
  headerLinkButtonText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 13, color: colors.stamp },

  // CTA del panel Presupuesto — reemplaza los forms de "Agregar categoría"/
  // "Registrar gasto" que vivían acá (ahora solo en la pantalla completa de
  // Presupuesto, con filtros/lista/gráfico); este panel del dossier quedó
  // como resumen de solo lectura + botón para ir a cargar.
  budgetCta: {
    marginTop: spacing.stackLg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    borderStyle: 'dashed',
    padding: spacing.gutter,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  budgetCtaText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 14, color: colors.stamp },

  emptyState: { padding: 24, alignItems: 'center' },

  // Botón de eliminar reutilizado en actividades/hoteles/vuelos/categorías
  // — una "✕" chica y discreta en vez de un botón grande, porque puede
  // aparecer muchas veces en una misma lista.
  itemDeleteGlyph: { color: colors.muted, fontSize: 14, fontWeight: '700', paddingHorizontal: 2 },
  itemDeleteLink: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.stamp, marginTop: 4 },
  itemEditLink: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.inkSoft },
  // El stub de vuelo ya separa a sus hijos con gap:6 (flightStub) — sin
  // esto, el marginTop:4 de itemDeleteLink se sumaba a ese gap y el
  // "Eliminar" quedaba más lejos de "Editar" que "Editar" del badge de
  // arriba, rompiendo el ritmo vertical de la columna.
  stubDeleteLink: { marginTop: 0 },
  // stubK reutiliza blanco 50% pensado para el fondo oscuro de passStub;
  // acá el stub de vuelo tiene fondo claro (paper2) y ese blanco quedaba
  // casi invisible.
  stubKOnLight: { color: colors.muted },

  // Día / timeline
  dayBlock: { marginBottom: spacing.stackLg },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.stackMd,
    marginBottom: spacing.stackLg,
  },
  dayNum: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  dayNumText: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 15, color: colors.white },
  dayDate: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, letterSpacing: tracking.wide, textTransform: 'uppercase' },
  dayNotes: { color: colors.muted, marginBottom: spacing.stackMd, fontStyle: 'italic' },
  noActivities: { color: colors.muted, fontSize: 13 },

  timeline: { position: 'relative' },
  timelineLine: {
    position: 'absolute',
    left: NODE_COL / 2 - 1,
    top: NODE_SIZE / 2,
    bottom: NODE_SIZE / 2,
    width: 2,
    backgroundColor: colors.line,
  },
  item: { flexDirection: 'row', gap: spacing.gutter, marginBottom: spacing.stackLg },
  node: { width: NODE_COL, alignItems: 'center' },
  nodeBadge: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeGlyph: { fontSize: 16 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    gap: spacing.stackSm,
    ...cardShadow,
  },
  cardHeader: { flexDirection: 'column', gap: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDeleteButton: { padding: 2 },
  timeText: { fontFamily: fonts.mono, fontSize: 12, color: colors.teal, fontWeight: '700' },
  cardTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, fontWeight: '600', color: colors.ink },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationGlyph: { fontSize: 12 },
  locationText: { fontSize: 13, color: colors.muted },
  description: { fontSize: 14, color: colors.inkSoft },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  chip: { backgroundColor: colors.paper2, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  chipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft },

  // Vuelos / hoteles guardados
  savedCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    gap: 6,
    marginBottom: spacing.stackMd,
    ...cardShadow,
  },
  savedCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  savedCardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  savedCardTitle: { flex: 1, fontFamily: fonts.displaySemibold, fontSize: 16, fontWeight: '600', color: colors.ink },
  savedMeta: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.inkSoft },
  savedPrice: { fontFamily: fonts.displaySemibold, fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 2 },
  savedPriceUnit: { fontSize: 12.5, fontWeight: '400', color: colors.muted },

  flightCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: spacing.stackMd,
    ...cardShadow,
  },
  flightInfo: { flex: 1, padding: spacing.gutter, gap: 10 },
  flightMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legBadge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  legBadge_departure: { backgroundColor: colors.primaryFixed },
  legBadge_return: { backgroundColor: '#F2E4C4' },
  legBadge_one_way: { backgroundColor: colors.paper2 },
  legBadgeText: { fontFamily: fonts.mono, fontSize: 10.5, fontWeight: '700', color: colors.ink, textTransform: 'uppercase' },
  flightDayText: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  layoverText: { fontSize: 12.5, color: colors.inkSoft },
  flightLeg: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flightEp: { alignItems: 'center' },
  flightCode: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 20, color: colors.ink, letterSpacing: -0.5 },
  flightTime: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  flightPath: { flex: 1, alignItems: 'center', gap: 4 },
  flightDur: { color: colors.stamp, fontSize: 13 },
  flightLine: { width: '100%', height: 2, backgroundColor: colors.line },
  flightStub: {
    width: 108,
    backgroundColor: colors.paper2,
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
    borderStyle: 'dashed',
    padding: spacing.stackMd,
    justifyContent: 'center',
    gap: 6,
  },
  stubV: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 14, color: colors.ink },

  // Presupuesto
  budgetGrid: { gap: spacing.gutter },
  catsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    gap: spacing.stackLg,
    ...cardShadow,
  },
  cat: { gap: 7 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catRowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catName: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  catDot: { width: 9, height: 9, borderRadius: 3 },
  catNameText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 14, color: colors.ink },
  catNameTextSelected: { color: colors.stamp },
  catAmt: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.inkSoft },
  track: { height: 9, backgroundColor: colors.paper2, borderRadius: 6, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 6 },
  totalCard: { backgroundColor: colors.ink, borderRadius: radius.card, padding: spacing.stackLg, alignItems: 'center', ...cardShadow },
  totalEyebrow: { fontFamily: fonts.mono, fontSize: 11.5, letterSpacing: tracking.eyebrow, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' },
  totalBig: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 36, color: colors.white, letterSpacing: -1, marginTop: 8 },
  totalCurrency: { fontSize: 15, fontWeight: '400', color: 'rgba(255,255,255,0.7)' },
  totalRem: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.stamp, marginTop: 4 },
  totalBar: { width: '100%', height: 11, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 6, marginTop: 20, overflow: 'hidden' },
  totalBarFill: { height: '100%', backgroundColor: colors.stamp, borderRadius: 6 },
  totalBarFillOver: { backgroundColor: '#C94F4F' },
  totalPctLabel: { fontFamily: fonts.mono, fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 12, letterSpacing: tracking.wide },

  // Gráfico "Gasto por categoría" (tab Presupuesto) — antes vivía solo en
  // la pantalla global /(tabs)/budget, ya eliminada.
  chartCard: {
    marginTop: spacing.stackMd,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  chartBar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.paper2 },
  chartLegend: { gap: 8 },
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartLegendName: { flex: 1, fontSize: 13.5, color: colors.ink, fontWeight: '600' },
  chartLegendAmt: { fontFamily: fonts.mono, fontSize: 12, color: colors.inkSoft },

  // Mapa
  legend: { marginTop: spacing.stackMd, gap: 4 },
  legItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderStyle: 'dashed',
  },
  legMk: { width: 12, height: 12, borderRadius: 4 },
  legLabel: { flex: 1, fontFamily: fonts.displaySemibold, fontSize: 13.5, color: colors.ink },
  legCount: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.muted },

  // Form "Agregar actividad" / "Agregar categoría" / "Registrar gasto"
  form: {
    marginTop: spacing.stackLg,
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    ...cardShadow,
  },
  formTitle: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 16, color: colors.ink, marginBottom: 4 },
  formLabel: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: tracking.wide, color: colors.muted, marginTop: spacing.stackSm },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, color: colors.ink, backgroundColor: colors.surface },
  formRow: { flexDirection: 'row', gap: 8 },
  formRowField: { flex: 1 },
  button: { backgroundColor: colors.ink, borderRadius: radius.sm, padding: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { color: colors.white, fontFamily: fonts.displaySemibold, fontWeight: '600' },

  formChipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  formChip: { backgroundColor: colors.paper2, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: 'transparent' },
  formChipSelected: { borderColor: colors.stamp, backgroundColor: colors.primaryFixed },
  formChipLabel: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.inkSoft },
  formChipLabelSelected: { color: colors.ink, fontWeight: '700' },

  newDayRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  newDayField: { flex: 1 },
  smallButton: { backgroundColor: colors.ink, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12 },
  smallButtonText: { color: colors.white, fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 13 },
  smallButtonGhost: { paddingHorizontal: 8, paddingVertical: 12 },
  smallButtonGhostText: { color: colors.muted, fontWeight: '600', fontSize: 13 },

  // Tab Gastos: secciones "previa" / "durante el viaje" + filas de gasto
  // (mismo look que la lista de la pantalla global de Presupuesto).
  expenseSection: {
    marginTop: spacing.stackMd,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    ...cardShadow,
  },
  expenseSectionTitle: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 15, color: colors.ink, marginBottom: 4 },
  expenseSectionTotal: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.muted, marginTop: 6, textAlign: 'right' },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderStyle: 'dashed',
  },
  expenseInfo: { flex: 1 },
  expenseDescription: { fontSize: 14, fontWeight: '600', color: colors.ink },
  expenseMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 2 },
  expenseAmount: { fontFamily: fonts.displaySemibold, fontSize: 14, fontWeight: '700', color: colors.ink },
  expenseCurrency: { fontSize: 11, fontWeight: '400', color: colors.muted },
  expenseActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  itemEditGlyph: { color: colors.muted, fontSize: 14, paddingHorizontal: 2 },

  // Botón "Marcar pagado" en la sección "Pendientes de pago" (tab Gastos)
  markPaidButton: {
    backgroundColor: colors.stamp,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  markPaidButtonDisabled: { opacity: 0.5 },
  markPaidButtonText: { fontFamily: fonts.mono, fontSize: 10.5, fontWeight: '700', color: colors.white },

  // "Dividido entre..." debajo de la fila de gasto (tab Gastos) — solo se
  // muestra si el gasto tiene división cargada, ver Expense.splits.
  expenseSplitMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.teal, marginTop: 2 },

  // "Dividir entre" en el form de gasto: reusa el patrón formChip/formChipSelected
  // (mismo look que categorías de actividad) — uno por participante del viaje.
  splitFieldLabel: { fontFamily: fonts.mono, fontSize: 11, fontWeight: '700', color: colors.muted, marginTop: spacing.stackSm, marginBottom: 6 },

  // Tab Colaboradores: form de invitar + lista de participantes.
  collabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderStyle: 'dashed',
  },
  collabInfo: { flex: 1 },
  collabName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  collabMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 2 },
  collabRoleBadge: {
    borderRadius: radius.full,
    paddingVertical: 3,
    paddingHorizontal: 9,
    backgroundColor: colors.line,
  },
  collabRoleBadgeText: { fontFamily: fonts.mono, fontSize: 10, fontWeight: '700', color: colors.muted },

  // Tab Balances: saldo neto por persona + lista de "quién le paga a quién".
  // Positivo (le deben) en teal, negativo (debe) en el naranja "sello" que
  // ya se usa para errores/alertas en el resto del dossier.
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderStyle: 'dashed',
  },
  balanceName: { fontSize: 14, fontWeight: '600', color: colors.ink, flex: 1 },
  balanceAmount: { fontFamily: fonts.displaySemibold, fontSize: 14, fontWeight: '700' },
  balancePositive: { color: colors.teal },
  balanceNegative: { color: colors.stamp },
  balanceNeutral: { color: colors.muted },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderStyle: 'dashed',
  },
  settleText: { fontSize: 13, color: colors.ink, flex: 1 },
  settleAmount: { fontFamily: fonts.mono, fontSize: 12.5, fontWeight: '700', color: colors.ink },

  // Sección "Reparto" en la tarjeta de hotel/vuelo (2026-07-06).
  sharesSummary: { marginTop: 8, gap: 2 },
  sharesSummaryText: { fontFamily: fonts.mono, fontSize: 11, color: colors.teal },
  sharesEditor: {
    marginTop: 10,
    backgroundColor: colors.paper2,
    borderRadius: radius.lg,
    padding: spacing.stackMd,
    gap: 8,
  },
  sharesEditorTitle: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 13, color: colors.ink },
  shareEditorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  shareEditorName: { fontSize: 13.5, color: colors.ink, flex: 1 },
  shareEditorInput: {
    width: 90,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
    fontSize: 13.5,
    color: colors.ink,
    textAlign: 'right',
  },
  shareEditorHint: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.muted },
  shareEditorPaidNote: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.teal },
  shareEditorActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },

  // Desglose por persona en "Pendientes de pago" (Gastos) cuando el hotel/
  // vuelo tiene un reparto armado — reemplaza la fila con un solo botón.
  pendingShareGroup: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    borderStyle: 'dashed',
    gap: 4,
  },
  pendingShareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
  },
  pendingShareName: { fontSize: 13.5, fontWeight: '600', color: colors.ink, flex: 1 },
  pendingShareAmount: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink },
  pendingSharePaid: { fontFamily: fonts.mono, fontSize: 11.5, fontWeight: '700', color: colors.teal },
  pendingSharePayControls: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pendingShareDateField: { width: 130 },
});
