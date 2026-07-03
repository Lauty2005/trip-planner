import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, spacing, radius, cardShadow, fonts } from '@/theme';

// Modal de confirmación genérico — mismo patrón visual/de interacción que
// el modal de "Eliminar viaje" del dossier (app/trip/[tripId]/index.tsx),
// extraído a componente para no repetirlo en cada pantalla que necesite
// borrar algo (actividades, hoteles, vuelos, categorías de presupuesto).

export function ConfirmDeleteModal({
  visible,
  title,
  body,
  error,
  deleting,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body: string;
  error?: string | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => (deleting ? null : onCancel())}>
      <Pressable style={styles.backdrop} onPress={() => (deleting ? null : onCancel())}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onCancel} disabled={deleting}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={onConfirm} disabled={deleting}>
              <Text style={styles.confirmText}>{deleting ? 'Eliminando...' : 'Sí, eliminar'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.containerPadding },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.gutter,
    gap: spacing.stackMd,
    ...cardShadow,
  },
  title: { fontFamily: fonts.displaySemibold, fontWeight: '700', fontSize: 18, color: colors.ink },
  body: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  error: { color: colors.stamp },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  cancelText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 14, color: colors.inkSoft },
  confirmButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.stamp },
  confirmText: { fontFamily: fonts.displaySemibold, fontWeight: '600', fontSize: 14, color: colors.white },
});
