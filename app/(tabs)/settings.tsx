import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  ChevronRight,
  Copy,
  Download,
  Eye, EyeOff,
  Key, Plus, Trash2,
  Upload,
  X
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { COLORS, LAYOUT } from '../../constants/theme';
import { validateAndEnrichImportData } from '../../lib/gemini';
import { useFlashcardStore } from '../../store/useFlashcardStore';

export default function SettingsScreen() {
  const {
    apiKeys, addApiKey, removeApiKey, toggleApiKey, loadApiKeys,
    exportData, importData
  } = useFlashcardStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [showKeys, setShowKeys] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importIssues, setImportIssues] = useState<string[]>([]);

  useEffect(() => {
    loadApiKeys();
  }, []);

  const handleAddKey = async () => {
    if (!newKeyValue.trim()) return;
    try {
      await addApiKey(newKeyValue.trim());
      setNewKeyValue('');
      setModalVisible(false);
      Alert.alert("Success", "API Key added.");
    } catch (error) {
      Alert.alert('Error', 'Failed to add API key.');
    }
  };

  const toggleShowKey = (id: number) => {
    setShowKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirmDeleteKey = (id: number) => {
    Alert.alert(
      'Delete API Key',
      'Are you sure you want to remove this key?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeApiKey(id) }
      ]
    );
  };

  const handleExport = async () => {
    setIsProcessing(true);
    try {
      const data = await exportData();
      const fileName = `LinguistAI_Backup_${new Date().toISOString().split('T')[0]}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data, null, 2));
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath);
      } else {
        Alert.alert("Error", "Sharing is not supported on this device.");
      }
    } catch (error: any) {
      Alert.alert("Export Failed", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });

      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(fileUri);
      const backup = JSON.parse(content);

      const collections = backup.collections;
      const cards = backup.cards;

      if (!collections || !cards) {
        throw new Error("Invalid backup file format.");
      }

      Alert.alert(
        "Confirm Import",
        `Found ${collections.length} collections and ${cards.length} cards. Choose import mode:`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Quick", 
            onPress: async () => {
              setIsProcessing(true);
              try {
                await importData(collections, cards);
                Alert.alert("Success", "Data imported successfully.");
              } catch (e: any) {
                Alert.alert("Import Error", e.message);
              } finally {
                setIsProcessing(false);
              }
            }
          },
          {
            text: "AI Enrichment", 
            onPress: async () => {
              setIsProcessing(true);
              try {
                const { enriched, issues } = await validateAndEnrichImportData(cards, (current, total) => {
                  setProgress({ current, total });
                });
                await importData(collections, enriched);
                setProgress({ current: 0, total: 0 });
                if (issues.length > 0) {
                  setImportIssues(issues);
                } else {
                  Alert.alert("Success", "Data imported and enriched with AI!");
                }
              } catch (e: any) {
                Alert.alert("AI Error", e.message);
              } finally {
                setIsProcessing(false);
                setProgress({ current: 0, total: 0 });
              }
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert("Error", "Failed to parse file: " + error.message);
    }
  };

  const handleImportWithAI = async (rawCards: any[]) => {
    const { addFlashcardsBulk, inboxCollectionId, collections, refresh } = useFlashcardStore.getState();
    const { analyzeInput } = require('../../lib/gemini');

    setIsProcessing(true);
    try {
      const groupA: any[] = [];
      const groupC: string[] = [];
      
      rawCards.forEach(card => {
        if (!card.english) return; 

        const isComplete = card.vietnamese && card.phonetic && card.example_en;
        if (isComplete) {
          groupA.push({
            ...card,
            collection_id: card.collection_id || inboxCollectionId,
          });
        } else {
          groupC.push(card.english);
        }
      });

      // 2. Process Group C in batches of 10
      const BATCH_SIZE = 10;
      const processedGroupC: any[] = [];
      const existingCollectionNames = collections.map(d => d.name);

      for (let i = 0; i < groupC.length; i += BATCH_SIZE) {
        const batch = groupC.slice(i, i + BATCH_SIZE);
        try {
          const res = await analyzeInput(batch.join(', '), undefined, existingCollectionNames);
          if (res && res.flashcards) {
            processedGroupC.push(...res.flashcards.map((fc: any) => ({
              ...fc,
              collection_id: fc.collection_id || inboxCollectionId, 
            })));
          }
        } catch (e) {
          console.error(`Error processing batch starting at ${i}:`, e);
        }
      }

      // 3. Final Import
      const finalImport = [...groupA, ...processedGroupC];
      if (finalImport.length > 0) {
        const res = await addFlashcardsBulk(finalImport);
        await refresh();
        const summary = `Added: ${res.added}\nUpdated: ${res.updated}${res.skipped ? `\nSkipped: ${res.skipped}` : ''}`;
        Alert.alert(
          "AI Import Complete",
          `Requested: ${finalImport.length} cards (${groupA.length} original, ${processedGroupC.length} AI enhanced).\n\n${summary}`
        );
      } else {
        Alert.alert("Notice", "No valid cards found for import.");
      }
    } catch (error: any) {
      Alert.alert("AI Import Failed", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your account and preferences.</Text>

        <Text style={styles.sectionHeader}>DATA & BACKUP</Text>
        <Card style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={handleExport}>
            <View style={[styles.iconBox, { backgroundColor: '#E3F2FD' }]}>
              <Download size={20} color={COLORS.primary} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>Export Backup</Text>
              <Text style={styles.menuSubtitle}>Save your data to a JSON file</Text>
            </View>
            <ChevronRight size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
          
          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={handleImport}>
            <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}>
              <Upload size={20} color={COLORS.success} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>Import Backup</Text>
              <Text style={styles.menuSubtitle}>Restore data from a backup file</Text>
            </View>
            <ChevronRight size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </Card>

        <Text style={styles.sectionHeader}>AI CONFIGURATION</Text>
        <Card style={styles.card}>
          <View style={styles.keyHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Key size={20} color={COLORS.primary} />
              <Text style={styles.keyTitle}>Gemini API Keys</Text>
            </View>
            <TouchableOpacity 
              style={styles.addKeyBtn}
              onPress={() => setModalVisible(true)}
            >
              <Plus size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {apiKeys.length === 0 ? (
            <Text style={styles.emptyText}>
              No custom keys. Using default environment key.
            </Text>
          ) : (
            apiKeys.map((key) => (
              <View key={key.id} style={styles.keyItem}>
                <View style={styles.keyItemLeft}>
                  <Text style={styles.keyLabel}>
                    {showKeys.has(key.id) ? key.api_key : `••••••••${key.api_key.slice(-4)}`}
                  </Text>
                  <View style={styles.keyActions}>
                    <TouchableOpacity onPress={() => toggleShowKey(key.id)} style={styles.keyActionBtn}>
                      {showKeys.has(key.id) ? <EyeOff size={16} color={COLORS.textSecondary} /> : <Eye size={16} color={COLORS.textSecondary} />}
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={async () => {
                        await Clipboard.setStringAsync(key.api_key);
                        Alert.alert("Copied", "API Key copied to clipboard.");
                      }} 
                      style={styles.keyActionBtn}
                    >
                      <Copy size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.keyItemRight}>
                  <Switch 
                    value={!!key.is_active} 
                    onValueChange={(val) => toggleApiKey(key.id, val)}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  />
                  <TouchableOpacity onPress={() => confirmDeleteKey(key.id)}>
                    <Trash2 size={18} color={COLORS.danger} style={{ marginLeft: 12 }} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <Text style={styles.keyNote}>
            * The app will rotate keys if one reaches its limit (429 error).
          </Text>
        </Card>

        <Text style={styles.version}>LinguistAI v1.1.0</Text>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Processing Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.processingText}>Processing...</Text>
            {progress.total > 0 && (
              <View style={styles.progressContainer}>
                <Text style={styles.progressText}>AI Enriching: {progress.current}/{progress.total}</Text>
                <View style={styles.progressBarBg}>
                  <View 
                    style={[styles.progressBarFill, { width: `${(progress.current / progress.total) * 100}%` }]} 
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Import Issues Modal */}
      <Modal visible={importIssues.length > 0} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Import Notice</Text>
              <TouchableOpacity onPress={() => setImportIssues([])}>
                <X size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.issueDesc}>
              Import complete. However, AI skipped some cards. You can copy the list below for review:
            </Text>
            <ScrollView style={styles.issueList} showsVerticalScrollIndicator={true}>
              <Text style={styles.issueText}>{importIssues.join('\n\n')}</Text>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Button 
                title="Copy List" 
                variant="primary" 
                style={{ flex: 1 }}
                onPress={async () => {
                  await Clipboard.setStringAsync(importIssues.join('\n\n'));
                  Alert.alert("Copied", "Issue list copied to clipboard.");
                }} 
              />
              <Button title="Got it" style={{ flex: 1 }} onPress={() => setImportIssues([])} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Key Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <KeyboardAvoidingView behavior='padding'>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add API Key</Text>
                <TouchableOpacity onPress={() => { setModalVisible(false); setNewKeyValue(''); }}>
                  <X size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>API KEY</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Paste your Gemini API key"
                placeholderTextColor={COLORS.textMuted}
                value={newKeyValue}
                onChangeText={setNewKeyValue}
                secureTextEntry
              />

              <Button title="Save Key" onPress={handleAddKey} disabled={!newKeyValue} />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 16 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: COLORS.textPrimary },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  sectionHeader: { fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.textMuted, letterSpacing: 1.2, marginBottom: 10, marginTop: 8 },
  card: { padding: 4, marginBottom: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuText: { flex: 1 },
  menuTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
  menuSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 10 },
  keyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 },
  keyTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: COLORS.textPrimary, marginLeft: 10 },
  addKeyBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic', padding: 12, textAlign: 'center' },
  keyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  keyItemLeft: { flex: 1 },
  keyLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary },
  keyActions: { flexDirection: 'row', marginTop: 6, gap: 12 },
  keyActionBtn: { padding: 4 },
  keyMask: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  failCount: { fontFamily: 'Inter_400Regular', fontSize: 9, color: COLORS.danger, marginTop: 1 },
  keyItemRight: { flexDirection: 'row', alignItems: 'center' },
  keyNote: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, padding: 12, lineHeight: 16 },
  version: { textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, marginTop: 16 },
  processingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  processingBox: { backgroundColor: 'white', padding: 24, borderRadius: 20, alignItems: 'center', width: '80%' },
  processingText: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: COLORS.textPrimary, marginTop: 12 },
  progressContainer: { width: '100%', marginTop: 16 },
  progressText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8 },
  progressBarBg: { height: 6, backgroundColor: COLORS.background, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: COLORS.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, ...LAYOUT.shadow },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 20, color: COLORS.textPrimary },
  issueDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 12 },
  issueList: { backgroundColor: COLORS.background, borderRadius: 12, padding: 12, maxHeight: 200 },
  issueText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.danger, lineHeight: 20 },
  inputLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.8, marginBottom: 6, marginTop: 12 },
  modalInput: { backgroundColor: COLORS.background, borderRadius: 10, padding: 12, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textPrimary, marginBottom: 16 },
});
