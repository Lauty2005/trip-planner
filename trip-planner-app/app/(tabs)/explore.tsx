import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import {
  createHotel,
  updateHotel,
  createFlight,
  updateFlight,
  estimateFlightArrival,
  type FlightLegType,
  type FlightEstimate,
  type FlightFormPayload,
  type HotelFormPayload,
  type SavedFlight,
  type SavedHotel,
} from '@/api/trips';
import { getBudgetCategoryOptions, createBudgetCategory } from '@/api/budget';
import type { SelectOption } from '@/components/SelectField';
import { useSelectedTripStore } from '@/store/selectedTrip';
import { useEditFlightStore } from '@/store/editFlight';
import { useEditHotelStore } from '@/store/editHotel';
import { SelectField } from '@/components/SelectField';
import { AmountField } from '@/components/AmountField';
import { DateRangeField } from '@/components/DateRangeField';
import { DateTimeField } from '@/components/DateTimeField';
import { AIRLINES } from '@/data/airlines';
import { colors, spacing, radius, cardShadow, fonts, tracking, layout } from '@/theme';
import { AppHeader } from '@/components/AppHeader';

const AIRLINE_OPTIONS = AIRLINES.map((name) => ({ value: name, label: name }));

// Reservas — antes esta pantalla ("Explorar") buscaba hoteles/vuelos reales
// contra Amadeus. Se dejó de lado (2026-07-01, a pedido de Lautaro)
// mientras trip-planner-api/.env no tenga AMADEUS_CLIENT_ID/SECRET reales
// (ver CONTEXT.md) — sin eso, tanto la búsqueda como el autocompletado de
// ciudad tiraban 401. En su lugar: carga manual de hotel/vuelo (nombre,
// fechas, precio) contra los MISMOS endpoints que ya usaba el guardado de
// resultados de Amadeus (createHotel/createFlight en src/api/trips.ts,
// bookingSource: 'manual' en vez de 'amadeus') — nada del backend cambió,
// solo se dejó de pasar por el proxy de búsqueda.
//
// Vuelos con tramo Ida/Vuelta/Interno + escala + llegada auto-estimada
// (2026-07-02, a pedido de Lautaro): ver services/flightEstimate.ts en el
// backend para el disclaimer completo sobre qué tan aproximada es la
// estimación de llegada.

type Mode = 'hotels' | 'flights';

const LEG_TYPE_OPTIONS: { value: FlightLegType; label: string }[] = [
  { value: 'departure', label: 'Ida' },
  { value: 'return', label: 'Vuelta' },
  { value: 'one_way', label: 'Vuelo interno' },
];
const LEG_TYPE_LABEL: Record<FlightLegType, string> = { departure: 'Ida', return: 'Vuelta', one_way: 'Vuelo' };

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Combina fecha (AAAA-MM-DD) + hora (HH:MM) en el mismo formato de string
// que ya mandaba el flujo de Amadeus como departureDatetime/arrivalDatetime
// (sin offset de timezone) — el backend los guarda tal cual en columnas
// TIMESTAMPTZ.
function toDatetime(date: string, time: string): string {
  const t = /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim().padStart(5, '0') : '00:00';
  return `${date}T${t}:00`;
}

function formatEstimatedArrival(datetime: string): string {
  const [date, time] = datetime.split('T');
  const [y, m, d] = date.split('-');
  return `${(time ?? '00:00:00').slice(0, 5)} · ${d}/${m}`;
}

function minutesToHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// Separa un datetime guardado ('YYYY-MM-DDTHH:MM:SS...') en fecha + hora
// para precargar el form al editar un vuelo — a propósito NO pasa por
// `new Date(...)` (que reinterpretaría la hora en el timezone del
// navegador): toDatetime() guarda el string tal cual lo tipeó el usuario,
// así que leerlo de vuelta con un split simple es lo único que reconstruye
// exactamente esa misma hora sin importar el timezone de quien edita.
function splitDatetime(datetime: string): { date: string; time: string } {
  const [date, rest] = datetime.split('T');
  return { date: date ?? '', time: (rest ?? '00:00:00').slice(0, 5) };
}

export default function ExploreScreen() {
  const [mode, setMode] = useState<Mode>('hotels');
  const selectedTrip = useSelectedTripStore((state) => state.selectedTrip);
  const editFlight = useEditFlightStore((state) => state.editFlight);
  const clearEditFlight = useEditFlightStore((state) => state.clearEditFlight);
  const editHotel = useEditHotelStore((state) => state.editHotel);
  const clearEditHotel = useEditHotelStore((state) => state.clearEditHotel);

  // Categorías de presupuesto del viaje, para poder elegir a cuál cae el
  // gasto cuando el hotel/vuelo se marque como pagado (tab Gastos del
  // dossier) — se recarga cada vez que cambia el viaje seleccionado.
  const [budgetCategoryOptions, setBudgetCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (!selectedTrip) {
      setBudgetCategoryOptions([]);
      return;
    }
    let cancelled = false;
    getBudgetCategoryOptions(selectedTrip.id)
      .then((cats) => {
        if (!cancelled) setBudgetCategoryOptions(cats.map((c) => ({ value: c.id, label: c.name })));
      })
      .catch(() => {
        if (!cancelled) setBudgetCategoryOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTrip]);

  // Hotel
  const [hotelName, setHotelName] = useState('');
  const [hotelAddress, setHotelAddress] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [hotelPrice, setHotelPrice] = useState<number | undefined>(undefined);
  const [hotelCurrency, setHotelCurrency] = useState('');
  const [hotelNotes, setHotelNotes] = useState('');
  const [hotelBudgetCategoryId, setHotelBudgetCategoryId] = useState('');
  // Si no es null, "Guardar hotel" actualiza este hotel (PATCH) en vez de
  // crear uno nuevo — lo setea loadHotelForEdit cuando se entra acá desde
  // el botón "✎" del dossier (ver useEditHotelStore).
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);

  // Vuelo
  const [legType, setLegType] = useState<FlightLegType>('one_way');
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [departureAirport, setDepartureAirport] = useState('');
  const [arrivalAirport, setArrivalAirport] = useState('');
  const [departDate, setDepartDate] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [arriveDate, setArriveDate] = useState('');
  const [arriveTime, setArriveTime] = useState('');
  // Por default, para CUALQUIER tipo de vuelo (Ida/Vuelta/Interno) la
  // llegada se auto-estima (ver useEffect más abajo); este flag deja
  // ingresarla a mano si el usuario tiene el horario real o si la
  // estimación falló.
  const [manualArrival, setManualArrival] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimatedArrival, setEstimatedArrival] = useState<FlightEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  // Escala: un solo stopover informativo (aeropuerto + tiempo de espera).
  const [hasLayover, setHasLayover] = useState(false);
  const [layoverAirport, setLayoverAirport] = useState('');
  const [layoverFlightNumber, setLayoverFlightNumber] = useState('');
  const [layoverHours, setLayoverHours] = useState('');
  const [layoverMinutes, setLayoverMinutes] = useState('');
  const [flightPrice, setFlightPrice] = useState<number | undefined>(undefined);
  const [flightCurrency, setFlightCurrency] = useState('');
  const [flightNotes, setFlightNotes] = useState('');
  const [flightBudgetCategoryId, setFlightBudgetCategoryId] = useState('');
  // Si no es null, "Guardar vuelo" actualiza este vuelo (PATCH) en vez de
  // crear uno nuevo — lo setea loadFlightForEdit cuando se entra acá desde
  // el botón "Editar" del dossier (ver useEditFlightStore).
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  // Categoría "Hotel"/"Vuelo" por defecto (2026-07-06, a pedido de
  // Lautaro): en vez de dejar el selector en "Sin categoría" hasta que el
  // usuario elija algo a mano, en cuanto ya existe una categoría llamada
  // "Hotel" (u "Vuelo") se preselecciona sola acá — sin pisar nunca un
  // valor ya elegido (a mano o precargado al editar, ver loadHotelForEdit/
  // loadFlightForEdit). Si esa categoría todavía no existe, handleSaveHotel/
  // handleSaveFlight la crean recién al guardar (más abajo) — no la creamos
  // solo por abrir el form.
  useEffect(() => {
    if (hotelBudgetCategoryId) return;
    const existing = budgetCategoryOptions.find((o) => o.label.toLowerCase() === 'hotel');
    if (existing) setHotelBudgetCategoryId(existing.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetCategoryOptions]);

  useEffect(() => {
    if (flightBudgetCategoryId) return;
    const existing = budgetCategoryOptions.find((o) => o.label.toLowerCase() === 'vuelo');
    if (existing) setFlightBudgetCategoryId(existing.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetCategoryOptions]);

  // Minutos de espera de la escala (0 si "Con escala" está desmarcado) —
  // se suman a la duración estimada tanto acá como en el botón "Calcular
  // automáticamente".
  function getLayoverMinutesTotal(): number {
    if (!hasLayover) return 0;
    return Number(layoverHours || '0') * 60 + Number(layoverMinutes || '0');
  }

  // En cuanto hay origen+destino+fecha+hora de salida, pedimos la llegada
  // estimada solos — para Ida, Vuelta e Interno por igual (debounce 600ms
  // para no pegarle a Google/Nominatim en cada tecla). Si el usuario activó
  // "ingresar a mano" (manualArrival) esto no corre. Si hay escala cargada,
  // ese tiempo de espera se suma a la estimación.
  useEffect(() => {
    if (manualArrival) return;
    if (!departureAirport.trim() || !arrivalAirport.trim() || !departDate || !departTime) {
      setEstimatedArrival(null);
      setEstimateError(null);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    setEstimateError(null);
    const departureDatetime = toDatetime(departDate, departTime);
    const layoverMins = getLayoverMinutesTotal();
    const timer = setTimeout(async () => {
      const result = await estimateFlightArrival(
        departureAirport.trim().toUpperCase(),
        arrivalAirport.trim().toUpperCase(),
        departureDatetime,
        layoverMins
      );
      if (cancelled) return;
      setEstimating(false);
      if (result) {
        setEstimatedArrival(result);
        setEstimateError(null);
      } else {
        setEstimatedArrival(null);
        setEstimateError('No pudimos estimar la llegada automáticamente.');
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [legType, manualArrival, departureAirport, arrivalAirport, departDate, departTime, hasLayover, layoverHours, layoverMinutes]);

  function resetHotelForm() {
    setHotelName('');
    setHotelAddress('');
    setCheckIn('');
    setCheckOut('');
    setHotelPrice(undefined);
    setHotelCurrency('');
    setHotelNotes('');
    setHotelBudgetCategoryId('');
    setEditingHotelId(null);
  }

  // Precarga el form con un hotel ya guardado (botón "✎" en el dossier, vía
  // useEditHotelStore) — mismo patrón que loadFlightForEdit.
  function loadHotelForEdit(hotel: SavedHotel) {
    setMode('hotels');
    setEditingHotelId(hotel.id);
    setHotelName(hotel.name);
    setHotelAddress(hotel.address ?? '');
    setCheckIn(hotel.checkInDate ?? '');
    setCheckOut(hotel.checkOutDate ?? '');
    setHotelPrice(hotel.price);
    setHotelCurrency(hotel.currency ?? '');
    setHotelNotes(hotel.notes ?? '');
    setHotelBudgetCategoryId(hotel.budgetCategoryId ?? '');
    setError(null);
    setSavedLabel(null);
  }

  function cancelEditHotel() {
    resetHotelForm();
  }

  function resetFlightForm() {
    setLegType('one_way');
    setAirline('');
    setFlightNumber('');
    setDepartureAirport('');
    setArrivalAirport('');
    setDepartDate('');
    setDepartTime('');
    setArriveDate('');
    setArriveTime('');
    setManualArrival(false);
    setEstimatedArrival(null);
    setEstimateError(null);
    setHasLayover(false);
    setLayoverAirport('');
    setLayoverFlightNumber('');
    setLayoverHours('');
    setLayoverMinutes('');
    setFlightPrice(undefined);
    setFlightCurrency('');
    setFlightNotes('');
    setFlightBudgetCategoryId('');
    setEditingFlightId(null);
  }

  // Precarga el form con un vuelo ya guardado (botón "Editar" en el
  // dossier, vía useEditFlightStore) — a diferencia de una carga nueva,
  // fija manualArrival=true para respetar la llegada real ya guardada en
  // vez de disparar una nueva estimación automática que la pisaría.
  function loadFlightForEdit(flight: SavedFlight) {
    setMode('flights');
    setEditingFlightId(flight.id);
    setLegType(flight.legType);
    setAirline(flight.airline ?? '');
    setFlightNumber(flight.flightNumber ?? '');
    setDepartureAirport(flight.departureAirport ?? '');
    setArrivalAirport(flight.arrivalAirport ?? '');
    const dep = flight.departureDatetime ? splitDatetime(flight.departureDatetime) : { date: '', time: '' };
    setDepartDate(dep.date);
    setDepartTime(dep.time);
    const arr = flight.arrivalDatetime ? splitDatetime(flight.arrivalDatetime) : { date: '', time: '' };
    setArriveDate(arr.date);
    setArriveTime(arr.time);
    setManualArrival(true);
    setEstimatedArrival(null);
    setEstimateError(null);
    setHasLayover(flight.hasLayover);
    setLayoverAirport(flight.layoverAirport ?? '');
    setLayoverFlightNumber(flight.layoverFlightNumber ?? '');
    if (flight.layoverDurationMinutes != null) {
      setLayoverHours(String(Math.floor(flight.layoverDurationMinutes / 60)));
      setLayoverMinutes(String(flight.layoverDurationMinutes % 60));
    } else {
      setLayoverHours('');
      setLayoverMinutes('');
    }
    setFlightPrice(flight.price);
    setFlightCurrency(flight.currency ?? '');
    setFlightNotes(flight.notes ?? '');
    setFlightBudgetCategoryId(flight.budgetCategoryId ?? '');
    setError(null);
    setSavedLabel(null);
  }

  function cancelEditFlight() {
    resetFlightForm();
  }

  // Se dispara al entrar a Reservas viniendo del botón "Editar" del
  // dossier (handleEditFlight en app/trip/[tripId]/index.tsx setea
  // editFlight antes de navegar acá). Se limpia el store apenas se
  // consume para que no quede "pegado" si se vuelve a esta pantalla.
  useEffect(() => {
    if (!editFlight) return;
    loadFlightForEdit(editFlight);
    clearEditFlight();
  }, [editFlight]);

  // Mismo mecanismo para el botón "✎" de un hotel guardado (handleEditHotel
  // en app/trip/[tripId]/index.tsx setea editHotel antes de navegar acá).
  useEffect(() => {
    if (!editHotel) return;
    loadHotelForEdit(editHotel);
    clearEditHotel();
  }, [editHotel]);

  function handleSwapAirports() {
    setDepartureAirport(arrivalAirport);
    setArrivalAirport(departureAirport);
  }

  // Botón "Calcular automáticamente" para Ida/Vuelta (donde la llegada es
  // un campo normal, no auto-estimada en segundo plano) — llena
  // arriveDate/arriveTime con el resultado, que el usuario puede seguir
  // editando si sabe el horario real.
  async function handleEstimateArrivalClick() {
    if (!departureAirport.trim() || !arrivalAirport.trim() || !departDate || !departTime) {
      setEstimateError('Completá origen, destino, fecha y hora de salida primero.');
      return;
    }
    setEstimating(true);
    setEstimateError(null);
    const departureDatetime = toDatetime(departDate, departTime);
    const result = await estimateFlightArrival(
      departureAirport.trim().toUpperCase(),
      arrivalAirport.trim().toUpperCase(),
      departureDatetime,
      getLayoverMinutesTotal()
    );
    setEstimating(false);
    if (result) {
      const [d, t] = result.arrivalDatetime.split('T');
      setArriveDate(d);
      setArriveTime(t.slice(0, 5));
    } else {
      setEstimateError('No pudimos estimar la llegada — completala a mano.');
    }
  }

  // Precio a usar como "planificado" si hay que crear la categoría del
  // hotel — el TOTAL de la estadía (precio por noche × noches, mismo
  // cálculo que hotelTotalPrice en el dossier), no el precio por noche.
  function hotelPlannedAmount(): number {
    const nights =
      checkIn && checkOut
        ? Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000))
        : 1;
    return hotelPrice != null ? Math.round(hotelPrice * nights * 100) / 100 : 0;
  }

  // Busca una categoría de presupuesto existente por nombre (case-
  // insensitive) antes de crearla — la usan tanto el selector manual de
  // categoría (onCreateOption, cuando el usuario tipea un nombre nuevo)
  // como el default automático "Hotel"/"Vuelo" en handleSaveHotel/
  // handleSaveFlight (2026-07-06, a pedido de Lautaro), así ambos caminos
  // reusan la misma categoría en vez de duplicarla. Devuelve `null` si
  // falla el POST (sin cortar el guardado del hotel/vuelo por eso).
  async function findOrCreateCategory(name: string, plannedAmount: number): Promise<SelectOption | null> {
    if (!selectedTrip) return null;
    const trimmed = name.trim();
    const existing = budgetCategoryOptions.find((o) => o.label.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    try {
      const cat = await createBudgetCategory(selectedTrip.id, { name: trimmed, plannedAmount });
      const opt: SelectOption = { value: cat.id, label: cat.name };
      setBudgetCategoryOptions((prev) => [...prev, opt]);
      return opt;
    } catch {
      return null;
    }
  }

  async function handleCreateHotelCategory(name: string): Promise<SelectOption | null> {
    return findOrCreateCategory(name, hotelPlannedAmount());
  }

  async function handleCreateFlightCategory(name: string): Promise<SelectOption | null> {
    return findOrCreateCategory(name, flightPrice ?? 0);
  }

  async function handleSaveHotel() {
    if (!selectedTrip) return;
    if (!hotelName.trim() || !checkIn || !checkOut) {
      setError('Completá nombre del hotel y las dos fechas.');
      return;
    }
    if (checkOut <= checkIn) {
      setError('El check-out tiene que ser posterior al check-in.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // Sin categoría elegida a mano: cae en "Hotel" por default (se crea
      // sola la primera vez, con el total de la estadía como planificado).
      const budgetCategoryId = hotelBudgetCategoryId || (await findOrCreateCategory('Hotel', hotelPlannedAmount()))?.value;
      const payload: HotelFormPayload = {
        name: hotelName.trim(),
        address: hotelAddress.trim() || undefined,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        price: hotelPrice,
        currency: hotelCurrency || selectedTrip.currency,
        notes: hotelNotes.trim() || undefined,
        budgetCategoryId,
      };
      if (editingHotelId) {
        await updateHotel(editingHotelId, payload);
      } else {
        await createHotel(selectedTrip.id, payload);
      }
      setSavedLabel(hotelName.trim());
      resetHotelForm();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'No se pudo guardar el hotel.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFlight() {
    if (!selectedTrip) return;
    if (!departDate || !departTime) {
      setError('Completá fecha y hora de salida.');
      return;
    }
    const departureDatetime = toDatetime(departDate, departTime);

    let arrivalDatetime: string;
    if (manualArrival) {
      if (!arriveDate || !arriveTime) {
        setError('Completá fecha y hora de llegada (o calculala automáticamente).');
        return;
      }
      arrivalDatetime = toDatetime(arriveDate, arriveTime);
    } else {
      if (!estimatedArrival) {
        setError('Todavía no se pudo calcular la llegada — completá origen/destino o ingresala a mano.');
        return;
      }
      arrivalDatetime = estimatedArrival.arrivalDatetime;
    }

    if (arrivalDatetime <= departureDatetime) {
      setError('La llegada tiene que ser posterior a la salida.');
      return;
    }

    if (hasLayover && !layoverAirport.trim()) {
      setError('Completá el aeropuerto de la escala (o desmarcá "Con escala").');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const layoverDurationMinutes = hasLayover
        ? Number(layoverHours || '0') * 60 + Number(layoverMinutes || '0')
        : undefined;
      // Editando y se desmarcó "Con escala": mandamos `null` explícito
      // (no `undefined`) para que el PATCH limpie esas columnas en vez de
      // dejar pisada la escala vieja (ver comentario en FlightFormPayload).
      const clearingLayover = Boolean(editingFlightId) && !hasLayover;
      // Sin categoría elegida a mano: cae en "Vuelo" por default (se crea
      // sola la primera vez, con el precio cargado como planificado).
      const budgetCategoryId = flightBudgetCategoryId || (await findOrCreateCategory('Vuelo', flightPrice ?? 0))?.value;
      const payload: FlightFormPayload = {
        airline: airline.trim() || undefined,
        flightNumber: flightNumber.trim() || undefined,
        departureAirport: departureAirport.trim().toUpperCase() || undefined,
        arrivalAirport: arrivalAirport.trim().toUpperCase() || undefined,
        departureDatetime,
        arrivalDatetime,
        price: flightPrice,
        currency: flightCurrency || selectedTrip.currency,
        notes: flightNotes.trim() || undefined,
        legType,
        hasLayover,
        layoverAirport: hasLayover ? layoverAirport.trim().toUpperCase() || undefined : clearingLayover ? null : undefined,
        layoverDurationMinutes: hasLayover && layoverDurationMinutes ? layoverDurationMinutes : clearingLayover ? null : undefined,
        layoverFlightNumber: hasLayover
          ? layoverFlightNumber.trim().toUpperCase() || undefined
          : clearingLayover
            ? null
            : undefined,
        budgetCategoryId,
      };

      if (editingFlightId) {
        await updateFlight(editingFlightId, payload);
      } else {
        await createFlight(selectedTrip.id, payload);
      }
      setSavedLabel(
        `${LEG_TYPE_LABEL[legType]}${
          departureAirport && arrivalAirport ? `: ${departureAirport.toUpperCase()} → ${arrivalAirport.toUpperCase()}` : ''
        }`
      );
      resetFlightForm();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'No se pudo guardar el vuelo.');
    } finally {
      setSaving(false);
    }
  }

  function handleModeChange(next: Mode) {
    setMode(next);
    setError(null);
    setSavedLabel(null);
  }

  const showArrivalFields = manualArrival;

  return (
    <View style={styles.pageRoot}>
      <AppHeader safeTop />
      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Título */}
        <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>RESERVAS</Text>
        <Text style={styles.title}>Cargá lo que ya tenés</Text>
        <Text style={styles.subtitle}>
          La búsqueda automática está en pausa por ahora — cargá el hotel o el vuelo a mano y quedan guardados en tu
          viaje igual.
        </Text>
      </View>

      {!selectedTrip ? (
        <Pressable style={styles.tripHint} onPress={() => router.push('/(tabs)/trips')}>
          <Text style={styles.tripHintText}>Elegí un viaje en "Mis viajes" para poder guardar acá →</Text>
        </Pressable>
      ) : (
        <Text style={styles.tripActive}>
          Guardando en <Text style={styles.tripActiveBold}>{selectedTrip.title}</Text>
        </Text>
      )}

      {/* Toggle Vuelos / Hoteles */}
      <View style={styles.toggle}>
        <Pressable
          style={[styles.toggleOption, mode === 'flights' && styles.toggleOptionActive]}
          onPress={() => handleModeChange('flights')}
        >
          <Text style={[styles.toggleText, mode === 'flights' && styles.toggleTextActive]}>Vuelos</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleOption, mode === 'hotels' && styles.toggleOptionActive]}
          onPress={() => handleModeChange('hotels')}
        >
          <Text style={[styles.toggleText, mode === 'hotels' && styles.toggleTextActive]}>Hoteles</Text>
        </Pressable>
      </View>

      {/* Formulario */}
      <View style={styles.form}>
        {mode === 'hotels' ? (
          <>
            {editingHotelId ? (
              <View style={styles.editingBanner}>
                <Text style={styles.editingBannerText}>✎ Editando hotel guardado</Text>
                <Pressable onPress={cancelEditHotel}>
                  <Text style={styles.editingBannerLink}>Cancelar edición</Text>
                </Pressable>
              </View>
            ) : null}
            <Field glyph="🏨" label="Nombre del hotel" placeholder="Ej: Hotel Central" value={hotelName} onChangeText={setHotelName} />
            <Field glyph="📍" label="Dirección (opcional)" placeholder="Calle y número, ciudad" value={hotelAddress} onChangeText={setHotelAddress} />
            <DateRangeField
              checkIn={checkIn}
              checkOut={checkOut}
              onChangeCheckIn={setCheckIn}
              onChangeCheckOut={setCheckOut}
              minDate={todayISO()}
            />
            <AmountField
              label="Precio por noche (opcional)"
              price={hotelPrice}
              currency={hotelCurrency || selectedTrip?.currency || ''}
              onPriceChange={setHotelPrice}
              onCurrencyChange={setHotelCurrency}
            />
            {/* Categoría de presupuesto: no suma nada a "gastado" por sí
                sola — solo queda guardada para cuando marqués este hotel
                como pagado desde la tab Gastos. */}
            <SelectField
              glyph="🏷️"
              label="Categoría de presupuesto (opcional)"
              placeholder="Sin categoría"
              value={hotelBudgetCategoryId}
              onChange={setHotelBudgetCategoryId}
              options={budgetCategoryOptions}
              creatable
              onCreateOption={handleCreateHotelCategory}
            />
            <Field glyph="📝" label="Notas (opcional)" placeholder="Ej: reserva a nombre de..." value={hotelNotes} onChangeText={setHotelNotes} />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.saveButton, (!selectedTrip || saving) && styles.saveButtonDisabled]}
              onPress={handleSaveHotel}
              disabled={!selectedTrip || saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Guardando...' : editingHotelId ? '✓ Guardar cambios' : '＋ Guardar hotel'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>TIPO DE VUELO</Text>
            <View style={styles.legTypeRow}>
              {LEG_TYPE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.legTypeChip, legType === opt.value && styles.legTypeChipActive]}
                  onPress={() => setLegType(opt.value)}
                >
                  <Text style={[styles.legTypeChipText, legType === opt.value && styles.legTypeChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>Con origen, destino, fecha y hora de salida, la llegada se calcula sola. Podés ingresarla a mano si preferís.</Text>

            {editingFlightId ? (
              <View style={styles.editingBanner}>
                <Text style={styles.editingBannerText}>✎ Editando vuelo guardado</Text>
                <Pressable onPress={cancelEditFlight}>
                  <Text style={styles.editingBannerLink}>Cancelar edición</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.fieldRow}>
              <View style={styles.fieldRowItem}>
                <Field glyph="🛫" label="Origen (opcional)" placeholder="Ej: EZE" value={departureAirport} onChangeText={setDepartureAirport} autoCapitalize="characters" maxLength={10} />
              </View>
              <Pressable style={styles.swapButton} onPress={handleSwapAirports} hitSlop={8}>
                <Text style={styles.swapButtonText}>⇄</Text>
              </Pressable>
              <View style={styles.fieldRowItem}>
                <Field glyph="🛬" label="Destino (opcional)" placeholder="Ej: MIA" value={arrivalAirport} onChangeText={setArrivalAirport} autoCapitalize="characters" maxLength={10} />
              </View>
            </View>

            <DateTimeField
              label="Salida"
              glyph="🛫"
              date={departDate}
              time={departTime}
              onChangeDate={setDepartDate}
              onChangeTime={setDepartTime}
              minDate={todayISO()}
            />

            {/* Escala arriba de la llegada: el tiempo de espera acá cargado
                se suma a la estimación automática de más abajo. */}
            <Pressable style={styles.checkboxRow} onPress={() => setHasLayover(!hasLayover)}>
              <View style={[styles.checkbox, hasLayover && styles.checkboxChecked]}>
                {hasLayover ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxLabel}>Con escala</Text>
            </Pressable>
            {hasLayover ? (
              <>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldRowItem}>
                    <Field
                      glyph="🔀"
                      label="Aeropuerto de la escala"
                      placeholder="Ej: BOG"
                      value={layoverAirport}
                      onChangeText={setLayoverAirport}
                      autoCapitalize="characters"
                      maxLength={10}
                    />
                  </View>
                  <View style={styles.fieldRowItem}>
                    <Field
                      glyph="#️⃣"
                      label="N° vuelo escala (opcional)"
                      placeholder="Ej: AR5678"
                      value={layoverFlightNumber}
                      onChangeText={setLayoverFlightNumber}
                      autoCapitalize="characters"
                    />
                  </View>
                </View>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldRowItem}>
                    <Field glyph="⏱️" label="Espera (horas)" placeholder="0" value={layoverHours} onChangeText={setLayoverHours} keyboardType="numeric" />
                  </View>
                  <View style={styles.fieldRowItem}>
                    <Field glyph="⏱️" label="Espera (minutos)" placeholder="0" value={layoverMinutes} onChangeText={setLayoverMinutes} keyboardType="numeric" />
                  </View>
                </View>
              </>
            ) : null}

            {showArrivalFields ? (
              <>
                <DateTimeField
                  label="Llegada"
                  glyph="🛬"
                  date={arriveDate}
                  time={arriveTime}
                  onChangeDate={setArriveDate}
                  onChangeTime={setArriveTime}
                  minDate={departDate || todayISO()}
                />
                <View style={styles.estimateActions}>
                  <Pressable onPress={handleEstimateArrivalClick} disabled={estimating}>
                    <Text style={styles.estimateLink}>{estimating ? 'Calculando...' : '✨ Calcular automáticamente'}</Text>
                  </Pressable>
                  {manualArrival ? (
                    <Pressable onPress={() => setManualArrival(false)}>
                      <Text style={styles.estimateLinkMuted}>Volver a la estimación automática</Text>
                    </Pressable>
                  ) : null}
                </View>
                {estimateError ? <Text style={styles.estimateError}>{estimateError}</Text> : null}
              </>
            ) : (
              <View style={styles.estimateBox}>
                {estimating ? (
                  <Text style={styles.estimateText}>Calculando llegada estimada...</Text>
                ) : estimatedArrival ? (
                  <>
                    <Text style={styles.estimateText}>
                      🛬 Llegada estimada: {formatEstimatedArrival(estimatedArrival.arrivalDatetime)} ·{' '}
                      {minutesToHM(estimatedArrival.estimatedDurationMinutes)} en total
                      {hasLayover ? ' (incluye la escala)' : ''}
                    </Text>
                    <Text style={styles.estimateHint}>Estimación por distancia entre aeropuertos, no el horario real del vuelo.</Text>
                  </>
                ) : estimateError ? (
                  <Text style={styles.estimateError}>{estimateError}</Text>
                ) : (
                  <Text style={styles.estimateHint}>Completá origen, destino, fecha y hora de salida para calcular la llegada.</Text>
                )}
                <Pressable onPress={() => setManualArrival(true)}>
                  <Text style={styles.estimateLink}>Ingresar llegada manualmente</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.fieldRow}>
              <View style={styles.fieldRowItem}>
                <SelectField
                  glyph="✈️"
                  label="Aerolínea (opcional)"
                  placeholder="Elegí una aerolínea"
                  value={airline}
                  onChange={setAirline}
                  options={AIRLINE_OPTIONS}
                  searchable
                />
              </View>
              <View style={styles.fieldRowItem}>
                <Field glyph="#️⃣" label="N° de vuelo (opcional)" placeholder="Ej: AR1234" value={flightNumber} onChangeText={setFlightNumber} autoCapitalize="characters" />
              </View>
            </View>

            <AmountField
              label="Precio (opcional)"
              price={flightPrice}
              currency={flightCurrency || selectedTrip?.currency || ''}
              onPriceChange={setFlightPrice}
              onCurrencyChange={setFlightCurrency}
            />
            {/* Categoría de presupuesto: no suma nada a "gastado" por sí
                sola — solo queda guardada para cuando marqués este vuelo
                como pagado desde la tab Gastos. */}
            <SelectField
              glyph="🏷️"
              label="Categoría de presupuesto (opcional)"
              placeholder="Sin categoría"
              value={flightBudgetCategoryId}
              onChange={setFlightBudgetCategoryId}
              options={budgetCategoryOptions}
              creatable
              onCreateOption={handleCreateFlightCategory}
            />
            <Field glyph="📝" label="Notas (opcional)" placeholder="Ej: check-in online pendiente" value={flightNotes} onChangeText={setFlightNotes} />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.saveButton, (!selectedTrip || saving) && styles.saveButtonDisabled]}
              onPress={handleSaveFlight}
              disabled={!selectedTrip || saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Guardando...' : editingFlightId ? '✓ Guardar cambios' : '＋ Guardar vuelo'}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {savedLabel ? (
        <View style={styles.savedBanner}>
          <Text style={styles.savedBannerText}>
            ✓ Guardado {mode === 'hotels' ? 'el hotel' : savedLabel} en {selectedTrip?.title}.
          </Text>
          {selectedTrip ? (
            <Pressable onPress={() => router.push(`/trip/${selectedTrip.id}`)}>
              <Text style={styles.savedBannerLink}>Ver en el dossier del viaje →</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      </ScrollView>
    </View>
  );
}

function Field({
  glyph,
  label,
  ...inputProps
}: { glyph: string; label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.fieldBox}>
        <Text style={styles.fieldGlyph}>{glyph}</Text>
        <TextInput
          style={styles.fieldInput}
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          {...inputProps}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.containerPadding,
    paddingBottom: 40,
    gap: spacing.stackLg,
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
  },

  titleBlock: { gap: 4 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11.5, letterSpacing: tracking.eyebrow, textTransform: 'uppercase', color: colors.muted },
  title: { fontFamily: fonts.displaySemibold, fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.5, marginTop: 2 },
  subtitle: { fontSize: 15, color: colors.inkSoft },

  tripHint: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: spacing.stackMd,
    backgroundColor: colors.surface,
  },
  tripHintText: { color: colors.stamp, fontSize: 13.5, fontWeight: '600' },
  tripActive: { fontSize: 13.5, color: colors.inkSoft },
  tripActiveBold: { fontWeight: '700', color: colors.ink },

  // Toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.paper2,
    borderRadius: radius.xl,
    padding: 4,
  },
  toggleOption: { flex: 1, paddingVertical: 8, borderRadius: radius.lg, alignItems: 'center' },
  toggleOptionActive: { backgroundColor: colors.ink },
  toggleText: { fontFamily: fonts.displaySemibold, fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  toggleTextActive: { color: colors.white },

  // Tipo de vuelo (Ida / Vuelta / Vuelo interno)
  legTypeRow: { flexDirection: 'row', gap: 8 },
  legTypeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  legTypeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  legTypeChipText: { fontFamily: fonts.displaySemibold, fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  legTypeChipTextActive: { color: colors.white },
  hint: { fontSize: 12.5, color: colors.muted, marginTop: -4 },

  // Formulario
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  fieldRow: { flexDirection: 'row', gap: spacing.stackMd, alignItems: 'flex-start' },
  fieldRowItem: { flex: 1 },
  // minHeight reserva lugar para 2 renglones aunque el label entre en uno
  // solo — sin esto, en una fieldRow donde un label es corto ("MONEDA") y
  // el otro largo ("N° DE VUELO (OPCIONAL)"), el que entra en 1 línea
  // arranca su fieldBox más arriba que el que se parte en 2, y las dos
  // cajas quedan desalineadas entre sí (bug visto en pantalla). Mismo
  // fix replicado en PriceField/SelectField/DatePickerField/TimePickerField
  // (cada uno define su propio fieldLabel).
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: tracking.wide, color: colors.muted, marginBottom: 4, marginLeft: 2, minHeight: 28 },
  fieldBox: {
    height: spacing.fieldHeight,
    boxSizing: 'border-box' as any,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    // Antes: paddingVertical:12 acá determinaba el alto — pero un
    // <TextInput> (Field) y un <Text> dentro de un Pressable (SelectField/
    // AmountField/DateRangeField/DateTimeField) miden distinto en
    // react-native-web aunque compartan el mismo padding (el <input> tiene
    // su propio alto intrínseco). Eso desalineaba "Aerolínea" (SelectField,
    // ya con height:fieldHeight fijo) contra "N° de vuelo" (este Field,
    // todavía con paddingVertical) — reportado 2026-07-06. Ahora los 8
    // tipos de campo comparten el mismo height:spacing.fieldHeight +
    // boxSizing:'border-box', así ninguna fieldRow los desalinea.
  },
  fieldGlyph: { fontSize: 16, marginRight: 8 },
  fieldInput: { flex: 1, fontSize: 16, color: colors.ink },

  // Botón "⇄" para invertir origen/destino, alineado con la altura de los
  // dos inputs de la fila (le pusimos margin-top para que no quede pegado
  // al label de arriba).
  swapButton: {
    width: 36,
    height: 44,
    // Alineado con el nuevo minHeight del label (28 + marginBottom 4 = 32),
    // para que el botón quede a la altura del fieldBox sin importar si el
    // label de al lado se partió en 1 o 2 líneas.
    marginTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.paper2,
  },
  swapButtonText: { fontSize: 16, color: colors.inkSoft },

  // Estimación automática de llegada
  estimateBox: {
    backgroundColor: colors.paper2,
    borderRadius: radius.lg,
    padding: spacing.stackMd,
    gap: 6,
  },
  estimateText: { fontSize: 13.5, color: colors.ink, fontWeight: '600' },
  estimateHint: { fontSize: 11.5, color: colors.muted },
  estimateError: { fontSize: 12.5, color: colors.stamp },
  estimateActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  estimateLink: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.stamp, fontWeight: '700' },
  estimateLinkMuted: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.muted },

  // Banner "Editando vuelo guardado" (form en modo edición)
  editingBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: colors.paper2,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: spacing.stackMd,
    marginTop: -4,
  },
  editingBannerText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  editingBannerLink: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.stamp, fontWeight: '700' },

  // Checkbox "Con escala"
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: { backgroundColor: colors.ink, borderColor: colors.ink },
  checkboxMark: { color: colors.white, fontSize: 12, fontWeight: '700' },
  checkboxLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },

  error: { color: colors.stamp },
  saveButton: {
    backgroundColor: colors.stamp,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.stackSm,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: colors.white, fontFamily: fonts.displaySemibold, fontSize: 15, fontWeight: '600' },

  savedBanner: {
    backgroundColor: colors.primaryFixed,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: 4,
  },
  savedBannerText: { color: colors.ink, fontWeight: '600' },
  savedBannerLink: { color: colors.stamp, fontWeight: '700' },
});
