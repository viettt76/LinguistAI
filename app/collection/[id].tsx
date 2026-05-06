import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eye, EyeOff,
  Move,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WordDetailModal } from '../../components/flashcard/WordDetailModal';
import { COLORS, ICON_OPTIONS, LAYOUT } from '../../constants/theme';
import { getAge, getTargetReps } from '../../lib/algorithm';
import { reanalyzeCard } from '../../lib/gemini';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { Flashcard } from '../../types';

export default function CollectionDetailScreen() {
  const { id, editId } = useLocalSearchParams<{ id: string, editId?: string }>();
  const router = useRouter();
  const {
    collections, flashcards, inboxCollectionId,
    editCollection, removeCollection, updateFlashcard, removeFlashcard,
    removeMultipleFlashcards, moveFlashcard, moveMultipleFlashcards,
    refresh,
  } = useFlashcardStore();

  const collectionId = Number(id);
  const collection = collections.find(d => d.id === collectionId);
  const cards = flashcards.filter(c => c.collection_id === collectionId);

  const [searchQuery, setSearchQuery] = useState('');
  const [showMeanings, setShowMeanings] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  // Multi-select
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());

  // Edit card modal
  const [selectedCard, setSelectedCard] = useState<Flashcard | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editData, setEditData] = useState({
    english: '', vietnamese: '', grammar_note: '', example_en: '', example_vi: '', phonetic: '', word_type: ''
  });
  const [aiLoading, setAiLoading] = useState(false);

  // Move modal
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [moveSearch, setMoveSearch] = useState('');
  const [movingForMulti, setMovingForMulti] = useState(false);

  // Edit collection modal
  const [isCollectionEditModalVisible, setIsCollectionEditModalVisible] = useState(false);
  const [collectionNameEdit, setCollectionNameEdit] = useState('');
  const [collectionIconEdit, setCollectionIconEdit] = useState('📚');

  useFocusEffect(useCallback(() => { 
    refresh(); 
  }, []));

  // Auto-open edit modal if editId is provided from search
  useEffect(() => {
    if (editId && cards.length > 0) {
      const cardToEdit = cards.find(c => c.id === Number(editId));
      if (cardToEdit) {
        handleEditInit(cardToEdit);
        // Clear the param after opening to avoid re-opening on every render
        router.setParams({ editId: undefined });
      }
    }
  }, [editId, cards.length]);

  const filteredCards = useMemo(() => {
    return cards.filter(c =>
      c.english.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.vietnamese.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [cards, searchQuery]);

  const stats = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    let mastered = 0, due = 0;
    for (const c of cards) {
      const age = getAge(c.created_at);
      const target = getTargetReps(age, dayOfWeek);
      if (c.total_reps >= 10) mastered++;
      else if (target > 0 && c.daily_reps < target) due++;
    }
    return { mastered, due, total: cards.length };
  }, [cards]);

  const filteredMoveCollections = useMemo(() =>
    collections.filter(d => d.name.toLowerCase().includes(moveSearch.toLowerCase())),
    [collections, moveSearch]
  );

  const handleEditInit = (card: Flashcard) => {
    setSelectedCard(card);
    setEditData({
      english: card.english, vietnamese: card.vietnamese,
      grammar_note: card.grammar_note || '', example_en: card.example_en || '',
      example_vi: card.example_vi || '', phonetic: card.phonetic || '',
      word_type: card.word_type || ''
    });
    setIsEditModalVisible(true);
  };

  const handleAiReanalyze = async () => {
    if (!editData.english.trim()) return;
    setAiLoading(true);
    try {
      const result = await reanalyzeCard(editData.english);
      setEditData(prev => ({ ...prev, ...result }));
    } catch (e: any) {
      Alert.alert('AI Error', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedCard) return;
    await updateFlashcard({ id: selectedCard.id, ...editData } as any);
    setIsEditModalVisible(false);
  };

  const handleDeleteCard = (card: Flashcard) => {
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];
    
    // Only show "Move to Inbox" if not already in Inbox
    if (collectionId !== inboxCollectionId) {
      options.push({ 
        text: 'Move to Inbox', 
        onPress: async () => {
          if (inboxCollectionId) await moveFlashcard(card.id, inboxCollectionId);
        }
      });
    }

    options.push({ 
      text: 'Delete Permanently', 
      style: 'destructive', 
      onPress: () => removeFlashcard(card.id) 
    });

    Alert.alert('Delete Card', `What would you like to do with "${card.english}"?`, options);
  };

  const handleMoveInit = (card: Flashcard) => {
    setSelectedCard(card);
    setMovingForMulti(false);
    setMoveSearch('');
    setIsMoveModalVisible(true);
  };

  const handleMoveMultiInit = () => {
    setMovingForMulti(true);
    setMoveSearch('');
    setIsMoveModalVisible(true);
  };

  const handleMoveToCollection = async (targetCollectionId: number) => {
    if (movingForMulti) {
      const selectedCards = cards.filter(c => selectedCardIds.has(c.id));
      const duplicates: string[] = [];
      
      for (const card of selectedCards) {
        const dup = await useFlashcardStore.getState().findDuplicateInCollection(card.english, targetCollectionId, card.word_type);
        if (dup) duplicates.push(card.english);
      }

      if (duplicates.length > 0) {
        Alert.alert(
          'Duplicate Warning',
          `${duplicates.length} words already exist in the target collection with the same word type:\n\n${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '...' : ''}\n\nDo you still want to move them?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Move Anyway', 
              onPress: async () => {
                await moveMultipleFlashcards(Array.from(selectedCardIds), targetCollectionId);
                handleCancelMulti();
                setIsMoveModalVisible(false);
              } 
            }
          ]
        );
        return;
      }

      await moveMultipleFlashcards(Array.from(selectedCardIds), targetCollectionId);
      handleCancelMulti();
    } else if (selectedCard) {
      const dup = await useFlashcardStore.getState().findDuplicateInCollection(selectedCard.english, targetCollectionId, selectedCard.word_type);
      if (dup) {
        Alert.alert(
          'Duplicate Warning',
          `"${selectedCard.english}" (${selectedCard.word_type}) already exists in the target collection. Move it anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Move Anyway', 
              onPress: async () => {
                await moveFlashcard(selectedCard.id, targetCollectionId);
                setIsMoveModalVisible(false);
              } 
            }
          ]
        );
        return;
      }
      await moveFlashcard(selectedCard.id, targetCollectionId);
    }
    setIsMoveModalVisible(false);
  };

  const handleLongPress = (id: number) => {
    if (!isMultiSelectMode) { setIsMultiSelectMode(true); setSelectedCardIds(new Set([id])); }
  };

  const toggleSelect = (id: number) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCardIds.size === cards.length) setSelectedCardIds(new Set());
    else setSelectedCardIds(new Set(cards.map(c => c.id)));
  };

  const handleCancelMulti = () => { setIsMultiSelectMode(false); setSelectedCardIds(new Set()); };

  const handleDeleteMultiple = () => {
    if (selectedCardIds.size === 0) return;
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];

    if (collectionId !== inboxCollectionId) {
      options.push({
        text: 'Move to Inbox',
        onPress: async () => {
          if (inboxCollectionId) {
            await moveMultipleFlashcards(Array.from(selectedCardIds), inboxCollectionId);
            handleCancelMulti();
          }
        }
      });
    }

    options.push({
      text: 'Delete Permanently',
      style: 'destructive',
      onPress: async () => {
        await removeMultipleFlashcards(Array.from(selectedCardIds));
        handleCancelMulti();
      }
    });

    Alert.alert('Bulk Delete', `What would you like to do with ${selectedCardIds.size} selected cards?`, options);
  };

  const handleDeleteCollection = () => {
    if (!collection || collection.id === inboxCollectionId) return;
    Alert.alert('Delete Collection', `Delete "${collection.name}"? All cards will be moved to Inbox.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await removeCollection(collectionId); router.back(); } },
    ]);
  };

  const handleSingleDelete = (card: Flashcard) => {
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];

    if (collectionId !== inboxCollectionId) {
      options.push({
        text: 'Move to Inbox',
        onPress: async () => {
          if (inboxCollectionId) {
            await moveFlashcard(card.id, inboxCollectionId);
            setDetailVisible(false);
          }
        }
      });
    }

    options.push({ 
      text: 'Delete Permanently', 
      style: 'destructive', 
      onPress: async () => {
        await removeFlashcard(card.id);
        setDetailVisible(false);
      } 
    });

    Alert.alert('Delete Card', `What would you like to do with "${card.english}"?`, options);
  };

  const handleEditCard = (card: Flashcard) => {
    setDetailVisible(false);
    handleEditInit(card);
  };

  const handleEditCollection = async () => {
    if (!collectionNameEdit.trim()) return;
    await editCollection(collectionId, collectionNameEdit.trim(), collectionIconEdit);
    setIsCollectionEditModalVisible(false);
  };

  if (!collection) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <WordDetailModal
        visible={detailVisible}
        word={selectedCard}
        onClose={() => setDetailVisible(false)}
        onEdit={handleEditCard}
        onDelete={handleSingleDelete}
      />
      {/* Header */}
      <View style={styles.header}>
        {isMultiSelectMode ? (
          <TouchableOpacity onPress={handleCancelMulti} style={styles.cancelBtnHeader}>
            <Text style={styles.cancelTextHeader}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={22} color={COLORS.primary} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>{collection.name}</Text>
        <View style={{ flexDirection: 'row' }}>
          {collection.id !== inboxCollectionId && (
            <>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => { 
                  setCollectionNameEdit(collection.name); 
                  setCollectionIconEdit(collection.icon || '📚');
                  setIsCollectionEditModalVisible(true); 
                }}
              >
                <Edit2 size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={handleDeleteCollection}>
                <Trash2 size={18} color={COLORS.danger} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.statText}>Mastered: {stats.mastered}</Text>
        </View>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: COLORS.warning }]} />
          <Text style={styles.statText}>Due: {stats.due}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={styles.studyBtn} onPress={() => router.push({ pathname: '/session/[id]', params: { id: String(collectionId) } })}>
            <Play size={12} color="white" fill="white" />
            <Text style={styles.studyBtnText}>Learn Due</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.studyBtn, { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.border }]}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: String(collectionId), mode: 'all' } })}
          >
            <Brain size={12} color={COLORS.primary} />
            <Text style={[styles.studyBtnText, { color: COLORS.primary }]}>Full Review</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search + Controls */}
      <View style={styles.searchBar}>
        <Search size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search words..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={COLORS.textMuted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
        {isMultiSelectMode ? (
          <TouchableOpacity onPress={toggleSelectAll} style={styles.toggleAllBtn}>
            <Text style={styles.toggleAllText}>{selectedCardIds.size === cards.length ? 'None' : 'All'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => { setShowMeanings(v => !v); setRevealedIds(new Set()); }}>
            {showMeanings ? <EyeOff size={16} color={COLORS.textSecondary} /> : <Eye size={16} color={COLORS.textSecondary} />}
          </TouchableOpacity>
        )}
      </View>

      {/* Card List */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.listContent}>
        {filteredCards.map(card => (
          <TouchableOpacity
            key={card.id}
            onLongPress={() => handleLongPress(card.id)}
            onPress={() => {
              if (isMultiSelectMode) {
                toggleSelect(card.id);
              } else {
                setSelectedCard(card);
                setDetailVisible(true);
              }
            }}
            activeOpacity={0.85}
            style={[styles.cardRow, selectedCardIds.has(card.id) && styles.cardRowSelected]}
          >
            {isMultiSelectMode && (
              <View style={[styles.checkbox, selectedCardIds.has(card.id) && styles.checkboxChecked]}>
                {selectedCardIds.has(card.id) && <Check size={10} color="white" />}
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.cardEn} numberOfLines={1}>{card.english}</Text>
                {card.word_type && (
                  <View style={styles.wordTypeBadge}>
                    <Text style={styles.wordTypeText}>{card.word_type}</Text>
                  </View>
                )}
              </View>
              {(showMeanings || revealedIds.has(card.id)) ? (
                <TouchableOpacity 
                  onPress={(e) => {
                    e.stopPropagation();
                    setRevealedIds(prev => {
                      const next = new Set(prev);
                      next.delete(card.id);
                      return next;
                    });
                  }}
                >
                  <Text style={styles.cardVi} numberOfLines={1}>{card.vietnamese}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  onPress={(e) => {
                    e.stopPropagation();
                    setRevealedIds(prev => {
                      const next = new Set(prev);
                      next.add(card.id);
                      return next;
                    });
                  }}
                >
                  <Text style={styles.tapReveal}>Tap to reveal...</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        ))}
        {cards.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No cards yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to add words with AI Tutor</Text>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {isMultiSelectMode && (
        <View style={styles.multiBar}>
          <TouchableOpacity onPress={handleCancelMulti} style={styles.multiBarCancel}>
            <X size={20} color="white" />
            <Text style={styles.multiBarBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.multiBarText}>{selectedCardIds.size} selected</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={handleMoveMultiInit}><Move size={18} color="white" /></TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteMultiple}><Trash2 size={18} color="#ff4444" /></TouchableOpacity>
          </View>
        </View>
      )}

      {/* FAB */}
      {!isMultiSelectMode && (
        <TouchableOpacity 
          style={styles.fab} 
          onPress={() => router.push({
            pathname: '/tutor',
            params: { collectionId: String(collectionId), collectionName: collection?.name }
          })}
        >
          <Plus size={28} color="white" />
        </TouchableOpacity>
      )}

      {/* Edit Card Modal */}
      <Modal visible={isEditModalVisible} transparent animationType="slide" onRequestClose={() => setIsEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setIsEditModalVisible(false)} />
          <KeyboardAvoidingView behavior='padding'>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Card</Text>
                <TouchableOpacity
                  onPress={handleAiReanalyze}
                  disabled={aiLoading}
                  style={styles.aiBadge}
                >
                  {aiLoading ? <ActivityIndicator size={12} color={COLORS.primary} /> : <Sparkles size={12} color={COLORS.primary} />}
                  <Text style={styles.aiText}>AI Fix</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {(['english', 'vietnamese', 'phonetic', 'word_type', 'grammar_note', 'example_en', 'example_vi'] as const).map(field => (
                  <View key={field} style={{ marginBottom: 12 }}>
                    <Text style={styles.inputLabel}>{field.replace('_', ' ').toUpperCase()}</Text>
                    <TextInput
                      style={[styles.textInput, ['grammar_note', 'example_en', 'example_vi'].includes(field) && { minHeight: 60 }]}
                      value={(editData as any)[field]}
                      onChangeText={v => setEditData(p => ({ ...p, [field]: v }))}
                      multiline={['grammar_note', 'example_en', 'example_vi'].includes(field)}
                    />
                  </View>
                ))}
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Move Modal */}
      <Modal visible={isMoveModalVisible} transparent animationType="slide" onRequestClose={() => setIsMoveModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setIsMoveModalVisible(false)} />
          <View style={[styles.modalSheet, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Move to...</Text>
              <TouchableOpacity onPress={() => setIsMoveModalVisible(false)}><X size={20} color={COLORS.textSecondary} /></TouchableOpacity>
            </View>
            <TextInput
              style={[styles.textInput, { marginBottom: 12 }]}
              placeholder="Search collections..."
              value={moveSearch}
              onChangeText={setMoveSearch}
              placeholderTextColor={COLORS.textMuted}
            />
            <ScrollView>
              {filteredMoveCollections.map(d => (
                <TouchableOpacity key={d.id} onPress={() => handleMoveToCollection(d.id)} style={styles.collectionMoveRow}>
                  <Text style={styles.collectionMoveName}>{d.name}</Text>
                  <ChevronRight size={18} color={COLORS.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Collection Name Modal */}
      <Modal visible={isCollectionEditModalVisible} transparent animationType="fade" onRequestClose={() => setIsCollectionEditModalVisible(false)}>
        <View style={[styles.modalOverlay, { justifyContent: 'center', paddingHorizontal: 24 }]}>
          <View style={[styles.modalSheet, { borderRadius: LAYOUT.radiusLarge }]}>
            <Text style={[styles.modalTitle, { marginBottom: 16 }]}>Edit Collection Name</Text>
            <TextInput
              style={[styles.textInput, { marginBottom: 16 }]}
              value={collectionNameEdit}
              onChangeText={setCollectionNameEdit}
              autoFocus
            />
            <Text style={styles.inputLabel}>ICON</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24, marginTop: 8 }}>
              {ICON_OPTIONS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={[{ width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' }, collectionIconEdit === emoji && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight }]}
                  onPress={() => setCollectionIconEdit(emoji)}
                >
                  <Text style={{ fontSize: 20 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: COLORS.border }]} onPress={() => setIsCollectionEditModalVisible(false)}>
                <Text style={[styles.saveBtnText, { color: COLORS.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={handleEditCollection}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'white',
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1, fontFamily: 'Outfit_700Bold', fontSize: 16,
    color: COLORS.textPrimary, textAlign: 'center', marginHorizontal: 12,
  },
  cancelBtnHeader: { paddingVertical: 4, paddingHorizontal: 4 },
  cancelTextHeader: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: COLORS.primary },
  iconBtn: { padding: 6, marginLeft: 2 },
  statsBar: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6,
    backgroundColor: 'white', paddingHorizontal: 16, paddingBottom: 12,
    paddingTop: 2,
  },
  statItem: { flexDirection: 'row', alignItems: 'center' },
  statDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.textSecondary },
  studyBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, gap: 4,
  },
  studyBtnText: { fontFamily: 'Outfit_600SemiBold', fontSize: 11, color: 'white' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    margin: 16, paddingHorizontal: 12, height: 42, borderRadius: LAYOUT.radiusSmall,
    ...LAYOUT.shadow,
  },
  searchInput: {
    flex: 1, marginHorizontal: 8, fontFamily: 'Inter_400Regular',
    fontSize: 14, color: COLORS.textPrimary,
  },
  toggleAllBtn: { backgroundColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  toggleAllText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.textSecondary },
  listContent: { paddingHorizontal: 16 },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    borderRadius: LAYOUT.radiusSmall, padding: 12, marginBottom: 8, ...LAYOUT.shadow,
  },
  cardRowSelected: { borderWidth: 1.5, borderColor: COLORS.primary },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
    borderColor: COLORS.border, marginRight: 10, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  cardEn: { fontFamily: 'Outfit_700Bold', fontSize: 15, color: COLORS.textPrimary, flex: 1 },
  wordTypeBadge: { backgroundColor: COLORS.border, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginLeft: 6 },
  wordTypeText: { fontFamily: 'Inter_500Medium', fontSize: 8, color: COLORS.textSecondary },
  cardVi: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  tapReveal: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.border, fontStyle: 'italic', marginTop: 2 },
  progressRow: { flexDirection: 'row', gap: 3, marginTop: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  dotFilled: { backgroundColor: COLORS.success },
  dotEmpty: { backgroundColor: COLORS.border },
  cardActions: { flexDirection: 'row', marginLeft: 8 },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 20, color: COLORS.textPrimary, marginTop: 16 },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 8 },
  multiBar: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: '#1A1A1A', borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  multiBarText: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },
  multiBarCancel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  multiBarBtnText: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },
  fab: {
    position: 'absolute', right: 16, bottom: 16, width: 52, height: 52,
    borderRadius: 26, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', ...LAYOUT.shadow,
  },
  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 20, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.textPrimary },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, gap: 4,
  },
  aiText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.primary },
  inputLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  textInput: {
    backgroundColor: COLORS.background, borderRadius: LAYOUT.radiusXSmall,
    paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textPrimary,
    borderWidth: 1, borderColor: COLORS.border, textAlignVertical: 'top',
  },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: LAYOUT.radiusSmall, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },
  collectionMoveRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  collectionMoveName: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary },
});
