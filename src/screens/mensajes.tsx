import * as ImagePicker from 'expo-image-picker';
import * as React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { useAppSession } from '../contexts/app-session';
import {
  fetchInternalMessageContacts,
  fetchInternalMessageThread,
  fetchInternalMessageThreads,
  markInternalMessageThreadRead,
  sendInternalMessage,
  type InternalMessageContact,
  type InternalMessageItem,
  type InternalMessageThread,
  type InternalMessageThreadPayload,
  type UploadableProof,
} from '../services/api';

export default function MensajesScreen() {
  const { authUser, accessToken } = useAppSession();
  const [contacts, setContacts] = React.useState<InternalMessageContact[]>([]);
  const [threads, setThreads] = React.useState<InternalMessageThread[]>([]);
  const [activeEmail, setActiveEmail] = React.useState('');
  const [thread, setThread] = React.useState<InternalMessageThreadPayload | null>(null);
  const [body, setBody] = React.useState('');
  const [attachments, setAttachments] = React.useState<UploadableProof[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const effectiveRecipient = activeEmail || contacts[0]?.email || '';

  const refreshInbox = React.useCallback(async () => {
    if (!accessToken) return;
    const [nextContacts, nextThreads] = await Promise.all([
      fetchInternalMessageContacts(accessToken),
      fetchInternalMessageThreads(accessToken),
    ]);
    setContacts(nextContacts);
    setThreads(nextThreads);
    setActiveEmail((current) => current || nextThreads[0]?.counterpartEmail || nextContacts[0]?.email || '');
  }, [accessToken]);

  const loadThread = React.useCallback(async (email: string) => {
    if (!accessToken || !email) return;
    const payload = await fetchInternalMessageThread(email, accessToken);
    setThread(payload);
    await markInternalMessageThreadRead(email, accessToken);
    setThreads((current) => current.map((item) => item.counterpartEmail === email ? { ...item, unreadCount: 0 } : item));
  }, [accessToken]);

  React.useEffect(() => {
    if (!accessToken) return;
    void refreshInbox().catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar Artemis.');
    });
  }, [accessToken, refreshInbox]);

  React.useEffect(() => {
    if (!accessToken) return;
    const interval = setInterval(() => {
      void refreshInbox().then(() => {
        if (effectiveRecipient) {
          return loadThread(effectiveRecipient);
        }
        return Promise.resolve();
      }).catch(() => undefined);
    }, 15000);
    return () => clearInterval(interval);
  }, [accessToken, effectiveRecipient, loadThread, refreshInbox]);

  React.useEffect(() => {
    if (!effectiveRecipient) return;
    void loadThread(effectiveRecipient).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'No se pudo cargar la conversacion de Artemis.');
    });
  }, [effectiveRecipient, loadThread]);

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Permite acceso a fotos para adjuntar imagenes al chat.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 5,
    });
    if (result.canceled) return;
    setAttachments(result.assets.map((asset, index) => ({
      uri: asset.uri,
      fileName: asset.fileName || `imagen-${Date.now()}-${index + 1}.jpg`,
      mimeType: asset.mimeType || 'image/jpeg',
    })));
  }

  async function handleSend() {
    if (!accessToken || !effectiveRecipient) {
      setError('Selecciona un destinatario antes de enviar el mensaje por Artemis.');
      return;
    }
    if (!body.trim() && attachments.length === 0) {
      setError('Escribe un mensaje o adjunta al menos una imagen en Artemis.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const message = await sendInternalMessage({ recipientEmail: effectiveRecipient, body, attachments }, accessToken);
      setThread((current) => ({
        counterpart: current?.counterpart?.email === effectiveRecipient
          ? current.counterpart
          : contacts.find((item) => item.email === effectiveRecipient) || {
              id: '',
              email: effectiveRecipient,
              role: 'admin',
              status: 'active',
              phone: null,
            },
        messages: [...(current?.messages || []), message as InternalMessageItem],
      }));
      setThreads((current) => {
        const existing = current.find((item) => item.counterpartEmail === effectiveRecipient);
        const next: InternalMessageThread = {
          counterpartEmail: effectiveRecipient,
          counterpartRole: contacts.find((item) => item.email === effectiveRecipient)?.role || existing?.counterpartRole || 'admin',
          counterpartStatus: contacts.find((item) => item.email === effectiveRecipient)?.status || existing?.counterpartStatus || 'active',
          counterpartPhone: contacts.find((item) => item.email === effectiveRecipient)?.phone || existing?.counterpartPhone || null,
          unreadCount: 0,
          lastMessage: message as InternalMessageItem,
        };
        return [next, ...current.filter((item) => item.counterpartEmail !== effectiveRecipient)];
      });
      setBody('');
      setAttachments([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo enviar el mensaje por Artemis.');
    } finally {
      setLoading(false);
    }
  }

  if (!authUser || !accessToken) {
    return (
      <ThemedView style={styles.emptyWrap}>
        <ThemedText type="subtitle">Artemis</ThemedText>
        <ThemedText style={styles.emptyText}>Inicia sesion para usar Artemis y comunicarte con administracion.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <ThemedText type="small" style={styles.eyebrow}>ARTEMIS | MENSAJERIA</ThemedText>
          <ThemedText type="title" style={styles.title}>Artemis</ThemedText>
        </View>
        <Pressable style={styles.refreshButton} onPress={() => void refreshInbox()}>
          <ThemedText type="small" style={styles.refreshText}>Sincronizar</ThemedText>
        </Pressable>
      </View>

      {error ? <View style={styles.errorCard}><ThemedText style={styles.errorText}>{error}</ThemedText></View> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.threadRow}>
        {(threads.length ? threads : contacts.map((contact) => ({ counterpartEmail: contact.email, counterpartRole: contact.role, counterpartStatus: contact.status, counterpartPhone: contact.phone, unreadCount: 0, lastMessage: { id: contact.id, senderRole: contact.role, senderEmail: contact.email, recipientRole: authUser.role, recipientEmail: authUser.email, body: 'Sin mensajes todavia.', type: 'system', status: 'read', createdAt: new Date().toISOString(), attachments: [] } as InternalMessageItem }))).map((threadItem) => {
          const active = effectiveRecipient === threadItem.counterpartEmail;
          return (
            <Pressable key={threadItem.counterpartEmail} onPress={() => setActiveEmail(threadItem.counterpartEmail)} style={[styles.threadChip, active && styles.threadChipActive]}>
              <ThemedText style={active ? styles.threadChipTitleActive : styles.threadChipTitle}>{threadItem.counterpartEmail}</ThemedText>
              <ThemedText type="small" style={active ? styles.threadChipMetaActive : styles.threadChipMeta}>{threadItem.counterpartRole === 'seller' ? 'Vendedor' : 'Admin'}</ThemedText>
              {threadItem.unreadCount ? <View style={styles.unreadDot}><ThemedText type="small" style={styles.unreadText}>{threadItem.unreadCount}</ThemedText></View> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.chatCard}>
        <ThemedText type="subtitle" style={styles.chatTitle}>{thread?.counterpart?.email || effectiveRecipient || 'Sin destinatario'}</ThemedText>
        <ScrollView contentContainerStyle={styles.messageList} style={styles.messageScroller}>
          {thread?.messages?.length ? thread.messages.map((message) => {
            const mine = message.senderEmail === authUser.email;
            return (
              <View key={message.id} style={[styles.messageBubble, mine ? styles.messageMine : styles.messageOther]}>
                <ThemedText type="small" style={mine ? styles.messageMetaMine : styles.messageMetaOther}>{mine ? 'Tu' : message.senderEmail}</ThemedText>
                <ThemedText style={mine ? styles.messageBodyMine : styles.messageBodyOther}>{message.body}</ThemedText>
                {message.attachments?.length ? (
                  <View style={styles.attachmentList}>
                    {message.attachments.map((attachment) => (
                      <View key={attachment.id} style={styles.attachmentBadge}>
                        <ThemedText type="small" style={styles.attachmentText}>{attachment.kind === 'image' ? 'Imagen' : 'Archivo'}: {attachment.originalName}</ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}
                <ThemedText type="small" style={mine ? styles.messageMetaMine : styles.messageMetaOther}>{new Date(message.createdAt).toLocaleString()}</ThemedText>
              </View>
            );
          }) : <ThemedText style={styles.emptyText}>Todavia no hay mensajes en esta conversacion.</ThemedText>}
        </ScrollView>
      </View>

      <View style={styles.composerCard}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Escribe por Artemis o deja una nota operativa"
          placeholderTextColor="#9ca3af"
          multiline
          style={styles.input}
        />
        {attachments.length ? (
          <View style={styles.attachmentList}>
            {attachments.map((file) => (
              <View key={file.uri} style={styles.attachmentBadge}>
                <ThemedText type="small" style={styles.attachmentText}>{file.fileName || 'Imagen'}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.actionsRow}>
          <Pressable style={styles.secondaryButton} onPress={() => void handlePickImage()}>
            <ThemedText type="small" style={styles.secondaryButtonText}>Imagen</ThemedText>
          </Pressable>
          <Pressable style={[styles.primaryButton, loading && styles.disabledButton]} onPress={() => void handleSend()} disabled={loading}>
            <ThemedText type="small" style={styles.primaryButtonText}>{loading ? 'Enviando...' : 'Enviar por Artemis'}</ThemedText>
          </Pressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef3fb',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    color: '#c81e1e',
    letterSpacing: 1,
  },
  title: {
    color: '#1f2937',
  },
  refreshButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#dbe4f0',
  },
  refreshText: {
    color: '#374151',
  },
  threadRow: {
    gap: 10,
    paddingRight: 18,
  },
  threadChip: {
    minWidth: 170,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    gap: 4,
  },
  threadChipActive: {
    backgroundColor: '#c81e1e',
    borderColor: '#c81e1e',
  },
  threadChipTitle: { color: '#1f2937' },
  threadChipTitleActive: { color: '#fff7ed' },
  threadChipMeta: { color: '#6b7280' },
  threadChipMetaActive: { color: '#fee2e2' },
  unreadDot: { alignSelf: 'flex-start', backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  unreadText: { color: '#fff7ed' },
  chatCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbe4f0',
  },
  chatTitle: { marginBottom: 12, color: '#111827' },
  messageScroller: { flex: 1 },
  messageList: { gap: 12, paddingBottom: 8 },
  messageBubble: { maxWidth: '84%', padding: 12, borderRadius: 18, gap: 8 },
  messageMine: { alignSelf: 'flex-end', backgroundColor: '#c81e1e' },
  messageOther: { alignSelf: 'flex-start', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb' },
  messageMetaMine: { color: '#fee2e2' },
  messageMetaOther: { color: '#6b7280' },
  messageBodyMine: { color: '#fffaf5' },
  messageBodyOther: { color: '#1f2937' },
  composerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    gap: 12,
  },
  input: {
    minHeight: 92,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbe4f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#111827',
    textAlignVertical: 'top',
  },
  actionsRow: { flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 18, backgroundColor: '#c81e1e' },
  primaryButtonText: { color: '#fff7ed' },
  secondaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 18, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  secondaryButtonText: { color: '#374151' },
  disabledButton: { opacity: 0.6 },
  attachmentList: { gap: 8 },
  attachmentBadge: { backgroundColor: '#eff6ff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  attachmentText: { color: '#1d4ed8' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#eef3fb' },
  emptyText: { color: '#6b7280' },
  errorCard: { backgroundColor: '#fef2f2', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#fecaca' },
  errorText: { color: '#991b1b' },
});


