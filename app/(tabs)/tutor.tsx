import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import {
  Camera,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Save, Search,
  Sparkles,
  Volume2,
  X
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform, ScrollView,
  StyleSheet,
  Text,
  TextInput, TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { COLORS, LAYOUT } from '../../constants/theme';
import { analyzeInput, extractFromImage } from '../../lib/gemini';
import { useFlashcardStore } from '../../store/useFlashcardStore';

export default function TutorScreen() {
  const { collectionId: paramCollectionId, collectionName } = useLocalSearchParams<{ collectionId?: string; collectionName?: string }>();
  const { 
    collections, flashcards, addFlashcardsBulk, addCollection, inboxCollectionId, refresh 
  } = useFlashcardStore();

  const [input, setInput] = useState('');
  const [context, setContext] = useState(collectionName || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [uncheckedIndices, setUncheckedIndices] = useState<Set<number>>(new Set());
  const [cardCollections, setCardCollections] = useState<Record<number, { collectionId?: number; newCollectionName?: string }>>({});
  
  // Collection selector
  const [isCollectionModalVisible, setIsCollectionModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | 'master' | null>(null);
  const [collectionSearch, setCollectionSearch] = useState('');

  const handleAiResult = (data: any) => {
    setResult(data);
    setUncheckedIndices(new Set());
    
    if (data && data.flashcards) {
      const initialMap: Record<number, { collectionId?: number; newCollectionName?: string }> = {};
      data.flashcards.forEach((card: any, idx: number) => {
        const initialCollectionId = paramCollectionId ? Number(paramCollectionId) : null;
        
        if (card.suggested_collection) {
          const suggestedLower = card.suggested_collection.toLowerCase();
          const existing = collections.find(d => d.name.toLowerCase() === suggestedLower);
          
          if (existing) {
            // Priority 1: AI suggested an existing collection
            initialMap[idx] = { collectionId: existing.id };
          } else if (suggestedLower !== 'inbox' && suggestedLower !== 'general') {
            // Priority 2: AI suggested a meaningful NEW collection name
            initialMap[idx] = { newCollectionName: card.suggested_collection };
          } else if (initialCollectionId) {
            // Priority 3: Fallback to current collection
            initialMap[idx] = { collectionId: initialCollectionId };
          } else {
            // Priority 4: Final fallback to global Inbox
            initialMap[idx] = { collectionId: inboxCollectionId || undefined };
          }
        } else {
          initialMap[idx] = { collectionId: initialCollectionId || (inboxCollectionId || undefined) };
        }
      });
      setCardCollections(initialMap);
    }
  };

  const handleAnalyze = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    try {
      const existingCollectionNames = collections.map(d => d.name);
      const data = await analyzeInput(input, undefined, existingCollectionNames);
      handleAiResult(data);
    } catch (error: any) {
      Alert.alert("Analysis Failed", error.message || "Please check your API keys.");
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async (useCamera: boolean) => {
    try {
      const permission = useCamera 
        ? await ImagePicker.requestCameraPermissionsAsync() 
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission Required", "Camera/Media access is needed to scan vocabulary.");
        return;
      }

      const pickerResult = useCamera 
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true });

      if (!pickerResult.canceled && pickerResult.assets[0].base64) {
        setLoading(true);
        const { base64, mimeType } = pickerResult.assets[0];
        const existingCollectionNames = collections.map(d => d.name);
        try {
          const data = await extractFromImage(base64, mimeType || 'image/jpeg', existingCollectionNames);
          if (data && data.flashcards?.length > 0) {
            handleAiResult(data);
          } else {
            Alert.alert("Notice", "No vocabulary found in this image.");
          }
        } catch (err: any) {
          Alert.alert("Scan Error", err.message);
        }
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBulk = async () => {
    if (!result || !result.flashcards || loading) return;
    
    const validIndices = result.flashcards
      .map((_: any, i: number) => i)
      .filter((i: number) => !uncheckedIndices.has(i));
    
    if (validIndices.length === 0) return;

    setLoading(true);
    try {
      const duplicates: string[] = [];
      const preparedCards: any[] = [];
      
      for (const idx of validIndices) {
        const card = result.flashcards[idx];
        const target = cardCollections[idx];
        let finalCollectionId = inboxCollectionId;

        if (target?.collectionId) {
          finalCollectionId = target.collectionId;
        } else if (target?.newCollectionName) {
          const lowerName = target.newCollectionName.toLowerCase();
          const currentCollections = useFlashcardStore.getState().collections;
          let existing = currentCollections.find(d => d.name.toLowerCase() === lowerName);
          if (existing) {
            finalCollectionId = existing.id;
          } else {
            // New collection name - will create later
            finalCollectionId = -1; // Placeholder for new collection
          }
        }

        // Check for duplicate in target collection if collection is known
        if (finalCollectionId && finalCollectionId !== -1) {
          const dup = await useFlashcardStore.getState().findDuplicateInCollection(card.english, finalCollectionId, card.word_type);
          if (dup) {
            duplicates.push(card.english);
          }
        }

        preparedCards.push({ idx, card, target, finalCollectionId });
      }

      if (duplicates.length > 0) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            'Duplicate Warning',
            `${duplicates.length} words already exist in their target collections with the same word type:\n\n${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '...' : ''}\n\nDo you want to proceed and update/add them?`,
            [
              { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Proceed', onPress: () => resolve(true) }
            ]
          );
        });
        if (!proceed) {
          setLoading(false);
          return;
        }
      }

      const operations: any[] = [];
      const newlyCreatedCollections: Record<string, number> = {};

      for (const { card, target } of preparedCards) {
        let finalCollectionId = inboxCollectionId;

        if (target?.collectionId) {
          finalCollectionId = target.collectionId;
        } else if (target?.newCollectionName) {
          const lowerName = target.newCollectionName.toLowerCase();
          
          if (newlyCreatedCollections[lowerName]) {
            finalCollectionId = newlyCreatedCollections[lowerName];
          } else {
            const currentCollections = useFlashcardStore.getState().collections;
            let existing = currentCollections.find(d => d.name.toLowerCase() === lowerName);
            
            if (!existing) {
              const newCollectionId = await addCollection(target.newCollectionName, '📚');
              newlyCreatedCollections[lowerName] = newCollectionId;
              finalCollectionId = newCollectionId;
            } else {
              finalCollectionId = existing.id;
            }
          }
        }

        operations.push({
          collection_id: finalCollectionId,
          english: card.english,
          vietnamese: card.vietnamese,
          phonetic: card.phonetic,
          word_type: card.word_type,
          grammar_note: card.grammar_note,
          example_en: card.example_en,
          example_vi: card.example_vi,
        });
      }

      const res = await addFlashcardsBulk(operations);
      const summary = `Added: ${res.added}\nUpdated: ${res.updated}${res.skipped ? `\nSkipped: ${res.skipped}` : ''}`;
      Alert.alert("Saved", summary);
      setResult(null);
      setInput('');
    } catch (error: any) {
      Alert.alert("Save Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (idx: number) => {
    setUncheckedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const openCollectionSelector = (idx: number | 'master') => {
    setEditingIndex(idx);
    setIsCollectionModalVisible(true);
  };

  const filteredCollections = collections.filter(d => d.name.toLowerCase().includes(collectionSearch.toLowerCase()));

  const normalized = (s: string) => (s ?? '').trim().toLowerCase();

  // Fast lookup: normalized english -> first existing card
  const existingByEnglish = useMemo(() => {
    const map = new Map<string, { id: number; collection_id: number; english: string; word_type: string }>();
    for (const c of flashcards) {
      const key = `${normalized(c.english)}|${normalized(c.word_type)}`;
      if (!normalized(c.english)) continue;
      if (!map.has(key)) map.set(key, { id: c.id, collection_id: c.collection_id, english: c.english, word_type: c.word_type });
    }
    return map;
  }, [flashcards]);

  const getTargetCollectionIdForIndex = (idx: number): number | null => {
    const target = cardCollections[idx];
    if (target?.collectionId) return target.collectionId;
    return null;
  };

  const getDuplicateWarning = (english: string, wordType: string, targetCollectionId: number | null) => {
    const key = `${normalized(english)}|${normalized(wordType)}`;
    const dup = key ? existingByEnglish.get(key) : undefined;
    if (!dup) return null;

    const dupCollectionName = collections.find(d => d.id === dup.collection_id)?.name ?? 'Unknown';
    if (targetCollectionId && dup.collection_id === targetCollectionId) {
      return { kind: 'same' as const, text: `Already in this collection → will update existing card.`, detail: dupCollectionName };
    }
    return { kind: 'other' as const, text: `Already exists in "${dupCollectionName}" → will add another copy here.`, detail: dupCollectionName };
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior='padding'>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>AI Tutor</Text>
            <Text style={styles.subtitle}>Smart grammar check and automated card creation.</Text>
          </View>

          {/* Input Box */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              placeholder="Enter words or sentences..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              value={input}
              onChangeText={setInput}
            />
            <View style={styles.inputActions}>
              <View style={styles.mediaBtns}>
                <TouchableOpacity style={styles.mediaBtn} onPress={() => handlePickImage(true)}>
                  <Camera size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaBtn} onPress={() => handlePickImage(false)}>
                  <ImageIcon size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity onPress={() => { setInput(''); setResult(null); }}>
                  <X size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.analyzeBtn, !input.trim() && styles.disabledBtn]} 
                  onPress={handleAnalyze}
                  disabled={loading || !input.trim()}
                >
                  {loading ? <ActivityIndicator color="white" size="small" /> : (
                    <>
                      <Sparkles size={18} color="white" />
                      <Text style={styles.analyzeText}>Analyze</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Analysis Results */}
          {result && (
            <View style={styles.resultsContainer}>
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>Found {result.flashcards?.length || 0} cards</Text>
                <TouchableOpacity onPress={() => setUncheckedIndices(new Set())}>
                  <Text style={styles.selectAllText}>Select All</Text>
                </TouchableOpacity>
              </View>

              {result.flashcards?.map((card: any, idx: number) => (
                <TouchableOpacity 
                  key={idx}
                  activeOpacity={0.9}
                  onPress={() => toggleCheck(idx)}
                  style={[styles.cardPreview, uncheckedIndices.has(idx) && styles.cardUnchecked]}
                >
                  <View style={[styles.checkbox, !uncheckedIndices.has(idx) && styles.checkboxChecked]}>
                    {!uncheckedIndices.has(idx) && <Check size={10} color="white" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={styles.cardEn}>{card.english.trim().charAt(0).toUpperCase()}{card.english.trim().slice(1)}</Text>
                        {card.word_type && (
                          <Badge label={card.word_type} variant="muted" style={{ marginLeft: 8 }} />
                        )}
                      </View>
                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); Speech.speak(card.english, { language: 'en-US' }); }}>
                        <Volume2 size={18} color={COLORS.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.cardPhonetic}>{card.phonetic}</Text>
                    <Text style={styles.cardVi}>{card.vietnamese}</Text>

                    {(() => {
                      const targetId = getTargetCollectionIdForIndex(idx);
                      const warn = getDuplicateWarning(card.english, card.word_type, targetId);
                      if (!warn) return null;
                      return (
                        <Text style={[styles.cardNote, { color: warn.kind === 'same' ? COLORS.warning : COLORS.danger, fontStyle: 'normal' }]}>
                          {warn.kind === 'same' ? 'Update' : 'Duplicate'}: {warn.text}
                        </Text>
                      );
                    })()}
                    
                    {card.grammar_note && (
                      <Text style={styles.cardNote}>{card.grammar_note}</Text>
                    )}

                    <TouchableOpacity 
                      onPress={(e) => { e.stopPropagation(); openCollectionSelector(idx); }}
                      style={styles.collectionChip}
                    >
                      <Text style={styles.collectionLabel}>Save to:</Text>
                      <Text style={styles.collectionValue}>
                        {cardCollections[idx]?.newCollectionName ? `${cardCollections[idx].newCollectionName} (New)` : 
                         (collections.find(d => d.id === cardCollections[idx]?.collectionId)?.name || 'Not Selected')}
                      </Text>
                      <ChevronDown size={14} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Master Override & Save */}
              <View style={styles.saveCard}>
                <Text style={styles.masterLabel}>APPLY TO ALL SELECTED</Text>
                <TouchableOpacity 
                  onPress={() => openCollectionSelector('master')}
                  style={styles.masterSelector}
                >
                  <Text style={styles.masterValue} numberOfLines={1}>
                    {(() => {
                      const selectedIndices = result.flashcards
                        .map((_: any, i: number) => i)
                        .filter((i: number) => !uncheckedIndices.has(i));
                      
                      if (selectedIndices.length === 0) return 'None Selected';
                      
                      const firstId = cardCollections[selectedIndices[0]]?.collectionId;
                      const firstNew = cardCollections[selectedIndices[0]]?.newCollectionName;
                      
                      const allSame = selectedIndices.every((idx: number) => 
                        cardCollections[idx]?.collectionId === firstId && 
                        cardCollections[idx]?.newCollectionName === firstNew
                      );
                      
                      if (!allSame) return 'Mixed Collections';
                      
                      if (firstNew) return `${firstNew} (New)`;
                      return collections.find(d => d.id === firstId)?.name || 'Not Selected';
                    })()}
                  </Text>
                  <ChevronDown size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>

                <Button 
                  title={`Save ${result.flashcards?.length - uncheckedIndices.size} Cards`}
                  onPress={handleSaveBulk}
                  loading={loading}
                  icon={<Save size={20} color="white" />}
                  style={{ marginTop: 12 }}
                />
              </View>
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Collection Selector Modal */}
      <Modal visible={isCollectionModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setIsCollectionModalVisible(false)} />
          <KeyboardAvoidingView behavior='padding'>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Collection</Text>
                <TouchableOpacity onPress={() => setIsCollectionModalVisible(false)}>
                  <X size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalSearch}>
                <Search size={18} color={COLORS.textMuted} />
                <TextInput 
                  style={styles.modalSearchInput} 
                  placeholder="Search..." 
                  value={collectionSearch}
                  onChangeText={setCollectionSearch}
                />
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {filteredCollections.map(collection => (
                  <TouchableOpacity 
                    key={collection.id}
                    onPress={() => {
                      if (editingIndex === 'master') {
                        const newMap = { ...cardCollections };
                        Object.keys(newMap).forEach(k => {
                          newMap[parseInt(k)] = { collectionId: collection.id };
                        });
                        setCardCollections(newMap);
                      } else if (editingIndex !== null) {
                        setCardCollections(prev => ({ ...prev, [editingIndex]: { collectionId: collection.id } }));
                      }
                      setIsCollectionModalVisible(false);
                      setCollectionSearch('');
                    }}
                    style={styles.collectionOption}
                  >
                    <Text style={styles.collectionOptionText}>{collection.name}</Text>
                    {collection.id === inboxCollectionId && <Badge label="INBOX" variant="muted" />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
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
  header: { marginBottom: 20 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: COLORS.textPrimary },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  
  inputCard: {
    backgroundColor: 'white', borderRadius: LAYOUT.radiusSmall,
    padding: 14, minHeight: 160, ...LAYOUT.shadow,
  },
  input: {
    flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15,
    color: COLORS.textPrimary, textAlignVertical: 'top', minHeight: 80,
  },
  inputActions: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 10,
  },
  mediaBtns: { flexDirection: 'row', gap: 6 },
  mediaBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, gap: 6,
  },
  disabledBtn: { opacity: 0.5 },
  analyzeText: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },

  resultsContainer: { marginTop: 24 },
  resultsHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12, paddingHorizontal: 4,
  },
  resultsTitle: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.textPrimary },
  selectAllText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.primary, textTransform: 'uppercase' },

  cardPreview: {
    flexDirection: 'row', backgroundColor: 'white', borderRadius: LAYOUT.radiusSmall,
    padding: 12, marginBottom: 10, ...LAYOUT.shadow, gap: 10,
  },
  cardUnchecked: { opacity: 0.5 },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    borderColor: COLORS.border, marginTop: 2, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardEn: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.textPrimary, flexShrink: 1 },
  cardPhonetic: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.primary, marginTop: 1 },
  cardVi: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  cardNote: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 8 },
  collectionChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start',
    marginTop: 10, gap: 4, borderWidth: 1, borderColor: COLORS.border,
  },
  collectionLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, color: COLORS.textMuted },
  collectionValue: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: COLORS.textPrimary },

  saveCard: {
    backgroundColor: 'white', borderRadius: LAYOUT.radiusSmall,
    padding: 16, marginTop: 8, ...LAYOUT.shadow,
  },
  masterLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, letterSpacing: 1.2, color: COLORS.textMuted, marginBottom: 6 },
  masterSelector: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.background, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  masterValue: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary, flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 20, maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 20, color: COLORS.textPrimary },
  modalSearch: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    paddingHorizontal: 10, height: 40, borderRadius: 8, marginBottom: 12,
  },
  modalSearchInput: { flex: 1, marginLeft: 8, fontFamily: 'Inter_400Regular', fontSize: 14 },
  collectionOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  collectionOptionText: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary },
});
