import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSelectedTripStore } from '@/store/selectedTrip';
import { colors } from '@/theme';

// 2026-07-02, a pedido de Lautaro: esta pantalla global de Presupuesto se
// eliminó — TODA la gestión (categorías, gráfico, "Agregar categoría") se
// mudó a la pestaña Presupuesto del dossier de cada viaje
// (app/trip/[tripId]/index.tsx), y "Registrar gasto" vive en la pestaña
// Gastos de ese mismo dossier. Este archivo debería borrarse directamente,
// pero esta sesión no tuvo acceso a una shell (`mcp__workspace__bash`
// reportó "Workspace unavailable... HYPERVISOR_VIRT_DISABLED" toda la
// conversación) así que no se pudo ejecutar el `rm`. Queda como redirect
// para no dejar una pantalla duplicada/rota si algo todavía enlaza acá —
// se puede borrar el archivo a mano
// (trip-planner-app/app/(tabs)/budget.tsx) y sacar la línea
// `<Stack.Screen name="budget" />` de app/(tabs)/_layout.tsx cuando
// quieras, ya no hace falta.
export default function BudgetScreenRedirect() {
  const selectedTrip = useSelectedTripStore((state) => state.selectedTrip);

  useEffect(() => {
    if (selectedTrip) {
      router.replace(`/trip/${selectedTrip.id}`);
    } else {
      router.replace('/(tabs)/trips');
    }
  }, [selectedTrip]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}
