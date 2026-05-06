import { useNavigation } from '@react-navigation/native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronRight,
  Eye, EyeOff,
  FolderInput,
  Info,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WordDetailModal } from '../../components/flashcard/WordDetailModal';
import { Card } from '../../components/ui/Card';
import { COLORS, LAYOUT } from '../../constants/theme';
import { getAge, getTargetReps, isOverdue } from '../../lib/algorithm';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { Flashcard } from '../../types';

export default function ReviewScreen() {
  const router = useRouter();
  const {
    flashcards,
    collections,
    activeCollectionId,
    inboxCollectionId,
    setActiveCollectionId,
    refresh,
    updateFlashcard,
    removeFlashcard,
    removeMultipleFlashcards,
    moveFlashcard,
    moveMultipleFlashcards,
  } = useFlashcardStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showMeanings, setShowMeanings] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [selectedCard, setSelectedCard] = useState<Flashcard | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editData, setEditData] = useState({
    english: '',
    vietnamese: '',
    grammar_note: '',
    example_en: '',
    example_vi: '',
    phonetic: '',
    word_type: '',
  });
  const [aiLoading, setAiLoading] = useState(false);

  // Multi-select cards
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());

  // Move cards modal
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);

  const { editId } = useLocalSearchParams();
  const navigation = useNavigation();

  useFocusEffect(useCallback(() => { refresh(); }, []));

  // Clear search on tab re-press
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener('tabPress', () => {
      if ((navigation as any).isFocused?.()) {
        setSearchQuery('');
        setRevealedIds(new Set());
        setIsMultiSelectMode(false);
      }
    });
    return unsubscribe;
  }, [navigation]);

  const activeCollection = useMemo(
    () => (activeCollectionId ? collections.find(d => d.id === activeCollectionId) : null),
    [activeCollectionId, collections]
  );

  const activeCards = useMemo(() => {
    if (!activeCollectionId) return [];
    const q = searchQuery.trim().toLowerCase();
    return flashcards
      .filter(c => c.collection_id === activeCollectionId)
      .filter(c => (q ? c.english.toLowerCase().includes(q) : true));
  }, [flashcards, activeCollectionId, searchQuery]);

  // Open detail when navigated from global search (editId)
  useEffect(() => {
    if (!editId || !activeCollectionId) return;
    const idNum = Number(editId);
    if (!Number.isFinite(idNum)) return;
    const card = flashcards.find(c => c.id === idNum);
    if (card && card.collection_id === activeCollectionId) {
      setSelectedCard(card);
      setDetailVisible(true);
    }
  }, [editId, activeCollectionId, flashcards]);

  const globalSessionInfo = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();

    const dueToday = flashcards.filter(c => {
      const age = getAge(c.created_at);
      const target = getTargetReps(age, dayOfWeek);
      return target > 0 && c.daily_reps < target;
    });

    const overdue = flashcards
      .filter(c => {
        const age = getAge(c.created_at);
        const target = getTargetReps(age, dayOfWeek);
        if (c.daily_reps > 0) return false;
        if (age > 0 && target > 0) return true;
        return false;
      })
      .filter(c => !dueToday.includes(c));

    return { dueToday, overdue };
  }, [flashcards]);

  const activeStats = useMemo(() => {
    if (!activeCollectionId) return null;
    const cards = flashcards.filter(c => c.collection_id === activeCollectionId);
    const today = new Date();
    const dayOfWeek = today.getDay();
    let mastered = 0;
    let due = 0;
    for (const c of cards) {
      const age = getAge(c.created_at);
      const target = getTargetReps(age, dayOfWeek);
      const isDue = (target > 0 && c.daily_reps < target) || isOverdue(c, today);
      if (isDue) due++;
      else if (age > 35) mastered++;
    }
    return { mastered, due, total: cards.length };
  }, [flashcards, activeCollectionId]);

  const handleEditInit = (card: Flashcard) => {
    setSelectedCard(card);
    setEditData({
      english: card.english,
      vietnamese: card.vietnamese,
      grammar_note: card.grammar_note || '',
      example_en: card.example_en || '',
      example_vi: card.example_vi || '',
      phonetic: card.phonetic || '',
      word_type: card.word_type || '',
    });
    setIsEditModalVisible(true);
  };

  const handleEditCard = (card: Flashcard) => {
    setDetailVisible(false);
    handleEditInit(card);
  };

  const handleSaveEdit = async () => {
    if (!selectedCard) return;
    await updateFlashcard({ id: selectedCard.id, ...editData } as any);
    setIsEditModalVisible(false);
    refresh();
  };

  const handleAiReanalyze = async () => {
    if (!editData.english.trim()) return;
    setAiLoading(true);
    try {
      const { reanalyzeCard } = await import('../../lib/gemini');
      const result = await reanalyzeCard(editData.english);
      setEditData(prev => ({ ...prev, ...result }));
    } catch (e: any) {
      Alert.alert('AI Error', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const toggleSelectCard = useCallback((id: number) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllCards = useCallback(() => {
    if (selectedCardIds.size === activeCards.length) {
      setSelectedCardIds(new Set());
    } else {
      setSelectedCardIds(new Set(activeCards.map(c => c.id)));
    }
  }, [selectedCardIds.size, activeCards]);

  const handleCancelMulti = () => {
    setIsMultiSelectMode(false);
    setSelectedCardIds(new Set());
  };

  const handleDeleteMultiple = () => {
    if (selectedCardIds.size === 0) return;
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];

    if (activeCollectionId !== inboxCollectionId) {
      options.push({
        text: 'Move to Inbox',
        onPress: async () => {
          if (inboxCollectionId) {
            await moveMultipleFlashcards(Array.from(selectedCardIds), inboxCollectionId);
            handleCancelMulti();
          }
        },
      });
    }

    options.push({
      text: 'Delete Permanently',
      style: 'destructive',
      onPress: async () => {
        await removeMultipleFlashcards(Array.from(selectedCardIds));
        handleCancelMulti();
      },
    });

    Alert.alert('Bulk Delete', `What would you like to do with ${selectedCardIds.size} selected words?`, options);
  };

  const handleMoveMultiple = (targetCollectionId: number) => {
    moveMultipleFlashcards(Array.from(selectedCardIds), targetCollectionId);
    setIsMoveModalVisible(false);
    handleCancelMulti();
    Alert.alert('Success', `Moved ${selectedCardIds.size} words.`);
  };

  const handleSingleDelete = (card: Flashcard) => {
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];

    if (card.collection_id !== inboxCollectionId) {
      options.push({
        text: 'Move to Inbox',
        onPress: async () => {
          if (inboxCollectionId) {
            await moveFlashcard(card.id, inboxCollectionId);
            setDetailVisible(false);
          }
        },
      });
    }

    options.push({
      text: 'Delete Permanently',
      style: 'destructive',
      onPress: async () => {
        await removeFlashcard(card.id);
        setDetailVisible(false);
      },
    });

    Alert.alert('Delete Card', `What would you like to do with "${card.english}"?`, options);
  };

  type FlashcardItemProps = {
    card: Flashcard;
    isSelected: boolean;
    isMultiSelect: boolean;
    isRevealed: boolean;
    showMeaningsGlobal: boolean;
    onPress: () => void;
    onLongPress: () => void;
    onToggleReveal: (id: number) => void;
  };

  const FlashcardItem = React.memo((props: FlashcardItemProps) => {
    const {
      card,
      isSelected,
      isMultiSelect,
      isRevealed,
      showMeaningsGlobal,
      onPress,
      onLongPress,
      onToggleReveal,
    } = props;
    const isShowingMeaning = showMeaningsGlobal || isRevealed;
    return (
      <TouchableOpacity
        style={[styles.cardRow, isMultiSelect && isSelected && styles.cardRowSelected]}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
        delayLongPress={300}
      >
        {isMultiSelect && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Check size={10} color="white" />}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardEn}>{card.english}</Text>
          {isShowingMeaning ? (
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); onToggleReveal(card.id); }}>
              <Text style={styles.cardVi}>{card.vietnamese}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); onToggleReveal(card.id); }}>
              <Text style={styles.tapReveal}>Tap to reveal...</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  });

  const renderCardItem = useCallback(({ item }: { item: Flashcard }) => (
    <FlashcardItem
      card={item}
      isSelected={selectedCardIds.has(item.id)}
      isMultiSelect={isMultiSelectMode}
      isRevealed={revealedIds.has(item.id)}
      showMeaningsGlobal={showMeanings}
      onPress={() => {
        if (isMultiSelectMode) toggleSelectCard(item.id);
        else {
          setSelectedCard(item);
          setDetailVisible(true);
        }
      }}
      onLongPress={() => {
        if (!isMultiSelectMode) {
          setIsMultiSelectMode(true);
          setSelectedCardIds(new Set([item.id]));
        }
      }}
      onToggleReveal={(id) => {
        setRevealedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }}
    />
  ), [FlashcardItem, isMultiSelectMode, revealedIds, selectedCardIds, showMeanings, toggleSelectCard]);

  const focusedView = activeCollection && activeStats;

  return focusedView ? (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.focusedHeader}>
        <TouchableOpacity onPress={() => setActiveCollectionId(null)} style={styles.backBtn}>
          <ArrowLeft size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <Text style={styles.focusedTitle} numberOfLines={1}>
          {isMultiSelectMode ? `${selectedCardIds.size} Selected` : activeCollection.name}
        </Text>

        {isMultiSelectMode ? (
          <TouchableOpacity onPress={handleSelectAllCards} style={styles.selectAllBtn}>
            <Text style={styles.selectAllText}>
              {selectedCardIds.size === activeCards.length ? 'Deselect' : 'All'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.focusedStudyBtn}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: String(activeCollectionId), mode: 'all' } })}
          >
            <Play size={14} color="white" fill="white" />
            <Text style={styles.focusedStudyBtnText}>Practice All</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isMultiSelectMode && (
        <View style={styles.activeStatsRow}>
          <View style={styles.statChip}><Text style={styles.statChipText}>Total: {activeStats.total}</Text></View>
          <View style={[styles.statChip, { backgroundColor: '#E8F5E9' }]}><Text style={[styles.statChipText, { color: COLORS.success }]}>Mastered: {activeStats.mastered}</Text></View>
          <View style={[styles.statChip, { backgroundColor: '#FFF3E0' }]}><Text style={[styles.statChipText, { color: COLORS.warning }]}>Due: {activeStats.due}</Text></View>
        </View>
      )}

      <View style={styles.searchBar}>
        <Search size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search words..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity onPress={() => { setShowMeanings(!showMeanings); setRevealedIds(new Set()); }}>
          {showMeanings ? <EyeOff size={18} color={COLORS.primary} /> : <Eye size={18} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeCards}
        keyExtractor={item => item.id.toString()}
        renderItem={renderCardItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.cardList}
        ListFooterComponent={<View style={{ height: 120 }} />}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={<Text style={styles.emptyText}>No words found in this collection.</Text>}
      />

      {isMultiSelectMode && (
        <View style={styles.multiBar}>
          <TouchableOpacity style={styles.multiBarBtn} onPress={handleCancelMulti}>
            <X size={20} color="white" />
            <Text style={styles.multiBarBtnText}>Cancel</Text>
          </TouchableOpacity>
          <View style={styles.multiDivider} />
          <TouchableOpacity style={styles.multiBarBtn} onPress={() => setIsMoveModalVisible(true)}>
            <FolderInput size={20} color="white" />
            <Text style={styles.multiBarBtnText}>Move</Text>
          </TouchableOpacity>
          <View style={styles.multiDivider} />
          <TouchableOpacity style={styles.multiBarBtn} onPress={handleDeleteMultiple}>
            <Trash2 size={20} color="#FF5252" />
            <Text style={[styles.multiBarBtnText, { color: '#FF5252' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isMultiSelectMode && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push({
            pathname: '/tutor',
            params: { collectionId: String(activeCollectionId), collectionName: activeCollection.name }
          })}
        >
          <Plus size={28} color="white" />
        </TouchableOpacity>
      )}

      <WordDetailModal
        visible={detailVisible}
        word={selectedCard}
        onClose={() => setDetailVisible(false)}
        onEdit={handleEditCard}
        onDelete={handleSingleDelete}
      />

      {/* Edit Card Modal */}
      <Modal visible={isEditModalVisible} transparent animationType="slide" onRequestClose={() => setIsEditModalVisible(false)}>
        <View style={styles.modalOverlayEdit}>
          <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject }} onPress={() => setIsEditModalVisible(false)} />
          <KeyboardAvoidingView behavior='padding'>
            <View style={styles.modalSheetEdit}>
              <View style={styles.modalHeaderEdit}>
                <Text style={styles.modalTitleEdit}>Edit Card</Text>
                <TouchableOpacity onPress={handleAiReanalyze} disabled={aiLoading} style={styles.aiBadge}>
                  {aiLoading ? <ActivityIndicator size={12} color={COLORS.primary} /> : <Sparkles size={12} color={COLORS.primary} />}
                  <Text style={styles.aiText}>AI Fix</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {(['english', 'vietnamese', 'phonetic', 'word_type', 'grammar_note', 'example_en', 'example_vi'] as const).map(field => (
                  <View key={field} style={{ marginBottom: 12 }}>
                    <Text style={styles.inputLabelEdit}>{field.replace('_', ' ').toUpperCase()}</Text>
                    <TextInput
                      style={[styles.textInput, ['grammar_note', 'example_en', 'example_vi'].includes(field) && { minHeight: 60 }]}
                      value={(editData as any)[field]}
                      onChangeText={v => setEditData(p => ({ ...p, [field]: v }))}
                      multiline={['grammar_note', 'example_en', 'example_vi'].includes(field)}
                    />
                  </View>
                ))}
                <TouchableOpacity style={styles.saveBtnEdit} onPress={handleSaveEdit}>
                  <Text style={styles.saveBtnTextEdit}>Save Changes</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={isMoveModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsMoveModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.handleBar} />
            <Text style={styles.modalTitle}>Move to Collection</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {collections.map(d => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.collectionSelectRow, d.id === activeCollectionId && styles.collectionSelectRowDisabled]}
                  disabled={d.id === activeCollectionId}
                  onPress={() => handleMoveMultiple(d.id)}
                >
                  <Text style={styles.collectionEmoji}>{d.icon || '📚'}</Text>
                  <Text style={styles.collectionSelectName}>{d.name}</Text>
                  {d.id === activeCollectionId ? (
                    <Text style={styles.currentLabel}>Current</Text>
                  ) : (
                    <ChevronRight size={16} color={COLORS.border} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setIsMoveModalVisible(false)}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  ) : (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Review</Text>
          <Text style={styles.subtitle}>Stay consistent with Intensive Learning.</Text>
        </View>

        <TouchableOpacity
          style={styles.heroCard}
          activeOpacity={0.9}
          onPress={() => router.push({ pathname: '/session/[id]', params: { id: 'review' } })}
        >
          <View style={styles.heroIcon}>
            <RotateCcw size={32} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Smart Review Session</Text>
            <Text style={styles.heroSubtitle}>
              {globalSessionInfo.dueToday.length + globalSessionInfo.overdue.length} cards scheduled for focus today.
            </Text>
          </View>
          <View style={styles.heroBtn}>
            <Brain size={20} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>TODAY'S SCHEDULE</Text>

        <Card style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={[styles.infoDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.infoText}>Active Review</Text>
            <Text style={styles.infoCount}>{globalSessionInfo.dueToday.length}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <View style={[styles.infoDot, { backgroundColor: COLORS.warning }]} />
            <Text style={styles.infoText}>Overdue Cards</Text>
            <Text style={styles.infoCount}>{globalSessionInfo.overdue.length}</Text>
          </View>
        </Card>

        <Text style={styles.sectionHeader}>ALGORITHM GUIDE</Text>
        <Card style={styles.guideCard}>
          <View style={styles.guideItem}>
            <View style={styles.guideNum}><Text style={styles.guideNumText}>1</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guideTitle}>Phase 1: The Intensive Week</Text>
              <Text style={styles.guideDesc}>Learn new cards 3x on Day 1. Review on Days 2, 3, 6, and 7.</Text>
            </View>
          </View>
          <View style={styles.guideItem}>
            <View style={styles.guideNum}><Text style={styles.guideNumText}>2</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guideTitle}>Phase 2: Milestone Review</Text>
              <Text style={styles.guideDesc}>Sunday reviews on Week 3 and Week 5 to cement long-term memory.</Text>
            </View>
          </View>
          <View style={styles.guideItem}>
            <View style={styles.guideNum}><Text style={styles.guideNumText}>3</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guideTitle}>Phase 3: Graduation</Text>
              <Text style={styles.guideDesc}>After Week 5, the word is considered mastered and leaves focus.</Text>
            </View>
          </View>
        </Card>

        <View style={styles.tipBox}>
          <Info size={16} color={COLORS.textMuted} />
          <Text style={styles.tipText}>
            Intensive Learning prioritize high-frequency contact in the first month over traditional SRS intervals.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

        const styles = StyleSheet.create({
          container: {flex: 1, backgroundColor: COLORS.background },
        scrollContent: {padding: 16 },
        header: {marginBottom: 20 },
        title: {fontFamily: 'Outfit_700Bold', fontSize: 28, color: COLORS.textPrimary },
        subtitle: {fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },

        // Focused Mode
        focusedHeader: {
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: COLORS.border
  },
        backBtn: {padding: 6, marginRight: 6 },
        focusedTitle: {flex: 1, fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.textPrimary },
        selectAllBtn: {paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COLORS.border, borderRadius: 16 },
        selectAllText: {fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.textSecondary },
        focusedStudyBtn: {
          flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary,
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, gap: 4
  },
        focusedStudyBtnText: {fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: 'white' },
        activeStatsRow: {flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginTop: 10 },
        statChip: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.border },
        statChipText: {fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.textSecondary },
        searchBar: {
          flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
        margin: 16, paddingHorizontal: 14, height: 44, borderRadius: 12, ...LAYOUT.shadow
  },
        searchInput: {flex: 1, marginHorizontal: 10, fontFamily: 'Inter_400Regular', fontSize: 14 },
        cardList: {paddingHorizontal: 16 },
        cardRow: {
          flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
        borderRadius: 12, padding: 12, marginBottom: 10, ...LAYOUT.shadow, borderWidth: 1.5, borderColor: 'transparent'
  },
        cardRowSelected: {borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
        checkbox: {
          width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.border,
        marginRight: 10, alignItems: 'center', justifyContent: 'center'
  },
        checkboxChecked: {backgroundColor: COLORS.primary, borderColor: COLORS.primary },
        cardEn: {fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.textPrimary },
        cardVi: {fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
        tapReveal: {fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.border, fontStyle: 'italic', marginTop: 2 },
        cardRight: {alignItems: 'flex-end', gap: 6 },
        progressDots: {flexDirection: 'row', gap: 3 },
        dot: {width: 5, height: 5, borderRadius: 2.5 },
        dotFilled: {backgroundColor: COLORS.success },
        dotEmpty: {backgroundColor: COLORS.border },

        // Multi-bar
        multiBar: {
          position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#1A1A1A',
        borderRadius: 16, flexDirection: 'row', padding: 2, ...LAYOUT.shadow
  },
        multiBarBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
        multiBarBtnText: {fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },
        multiDivider: {width: 1, height: '50%', backgroundColor: '#333', alignSelf: 'center' },

        // Global Mode
        heroCard: {
          backgroundColor: COLORS.primary, borderRadius: 20, padding: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24,
        ...LAYOUT.shadow, shadowColor: COLORS.primary, shadowOpacity: 0.15,
  },
        heroIcon: {width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
        heroTitle: {fontFamily: 'Outfit_700Bold', fontSize: 18, color: 'white' },
        heroSubtitle: {fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
        heroBtn: {width: 36, height: 36, borderRadius: 18, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },

        sectionHeader: {fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1.2, color: COLORS.textMuted, marginBottom: 8 },
        infoCard: {padding: 8, marginBottom: 24 },
        infoRow: {flexDirection: 'row', alignItems: 'center', padding: 10 },
        infoDot: {width: 8, height: 8, borderRadius: 4, marginRight: 10 },
        infoText: {flex: 1, fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary },
        infoCount: {fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.textPrimary },
        divider: {height: 1, backgroundColor: COLORS.border, marginHorizontal: 10 },

        guideCard: {padding: 20, marginBottom: 16 },
        guideItem: {flexDirection: 'row', gap: 12, marginBottom: 16 },
        guideNum: {width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
        guideNumText: {fontFamily: 'Outfit_700Bold', fontSize: 12, color: COLORS.primary },
        guideTitle: {fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary },
        guideDesc: {fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 2, lineHeight: 18 },

        tipBox: {flexDirection: 'row', gap: 10, padding: 12, backgroundColor: 'white', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.border },
        tipText: {flex: 1, fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },
        emptyText: {textAlign: 'center', paddingVertical: 40, fontFamily: 'Inter_400Regular', color: COLORS.textMuted },

        // Modal
        modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
        modalSheet: {backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
        handleBar: {width: 36, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
        modalTitle: {fontFamily: 'Outfit_700Bold', fontSize: 20, color: COLORS.textPrimary, marginBottom: 16 },
        modalSubtitle: {fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 },
        inputLabel: {fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1.1, color: COLORS.textMuted, marginBottom: 6 },
        collectionSelectRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
        collectionSelectRowDisabled: {opacity: 0.3 },
        collectionSelectName: {flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.textPrimary, marginLeft: 10 },
        currentLabel: {fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textMuted },
        closeBtn: {marginTop: 16, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.background },
        closeBtnText: {fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textSecondary },
        collectionEmoji: {fontSize: 18 },
        fab: {
          position: 'absolute', bottom: 24, right: 24,
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: COLORS.primary,
        alignItems: 'center', justifyContent: 'center',
        ...LAYOUT.shadow, elevation: 5,
  },
        // Edit Modal Styles
        modalOverlayEdit: {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
        modalSheetEdit: {backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
        modalHeaderEdit: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
        modalTitleEdit: {fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.textPrimary },
        aiBadge: {flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, gap: 4 },
        aiText: {fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.primary },
        inputLabelEdit: {fontFamily: 'Inter_500Medium', fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.8, marginBottom: 4 },
        textInput: {backgroundColor: COLORS.background, borderRadius: LAYOUT.radiusXSmall, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border, textAlignVertical: 'top' },
        saveBtnEdit: {backgroundColor: COLORS.primary, borderRadius: LAYOUT.radiusSmall, paddingVertical: 12, alignItems: 'center' },
        saveBtnTextEdit: {fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },
});
