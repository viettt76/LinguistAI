import { useNavigation } from '@react-navigation/native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowUpDown,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Edit2,
  FolderInput,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  X
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { Collection, Flashcard } from '../../types';

type SortOption = 'name_asc' | 'name_desc' | 'newest' | 'oldest';

const SORT_LABELS: Record<SortOption, string> = {
  name_asc: 'Name A→Z',
  name_desc: 'Name Z→A',
  newest: 'Newest',
  oldest: 'Oldest',
};
const SORT_OPTIONS: SortOption[] = ['name_asc', 'name_desc', 'newest', 'oldest'];
// Local constants removed, using shared constants

export default function LibraryScreen() {
  const router = useRouter();
  const {
    collections, flashcards, inboxCollectionId,
    newCramCount, newCramTotalCount, focusReviewCount: reviewCount, focusTotalCount: reviewTotalCount,
    addCollection, editCollection, removeCollection, removeMultipleCollections,
    refresh, searchFlashcards, setActiveCollectionId, moveMultipleFlashcards,
    moveFlashcard, removeFlashcard, updateFlashcard
  } = useFlashcardStore();

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(Flashcard & { collection_name: string; collection_icon: string })[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Sort
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Multi-select collections
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Add/Edit collection modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: number; name: string } | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [collectionIcon, setCollectionIcon] = useState('📚');
  const [saving, setSaving] = useState(false);

  // Move collections (merge) modal
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);

  // Word detail
  const [selectedCard, setSelectedCard] = useState<Flashcard | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editData, setEditData] = useState({
    english: '', vietnamese: '', grammar_note: '', example_en: '', example_vi: '', phonetic: '', word_type: ''
  });
  const [aiLoading, setAiLoading] = useState(false);

  const navigation = useNavigation();

  useFocusEffect(useCallback(() => { refresh(); }, []));

  // Clear search on double tab press
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener('tabPress', (e: any) => {
      if (navigation.isFocused()) {
        setSearchQuery('');
        setSearchResults([]);
        setIsMultiSelectMode(false);
      }
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const timer = setTimeout(async () => {
        setIsSearching(true);
        const results = await searchFlashcards(searchQuery);
        setSearchResults(results);
        setIsSearching(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery]);

  const inboxCollection = useMemo(() => collections.find(d => d.id === inboxCollectionId) ?? null, [collections, inboxCollectionId]);
  const inboxCount = useMemo(() => flashcards.filter(c => c.collection_id === inboxCollectionId).length, [flashcards, inboxCollectionId]);

  const filteredAndSortedCollections = useMemo(() => {
    const filtered = collections.filter(d => d.id !== inboxCollectionId && d.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return a.name.localeCompare(b.name);
        case 'name_desc': return b.name.localeCompare(a.name);
        case 'newest': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default: return 0;
      }
    });
  }, [collections, searchQuery, sortBy, inboxCollectionId]);

  const handleOpenAdd = () => {
    setEditTarget(null);
    setCollectionName('');
    setCollectionIcon('📚');
    setAddModalVisible(true);
  };

  const handleOpenEdit = (collection: Collection) => {
    setEditTarget({ id: collection.id, name: collection.name });
    setCollectionName(collection.name);
    setCollectionIcon(collection.icon || '📚');
    setAddModalVisible(true);
  };

  const handleSaveCollection = async () => {
    if (!collectionName.trim() || saving) return;
    setSaving(true);
    try {
      if (editTarget) {
        await editCollection(editTarget.id, collectionName.trim(), collectionIcon);
      } else {
        await addCollection(collectionName.trim(), collectionIcon);
      }
      setAddModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCollection = (collection: Collection) => {
    Alert.alert('Delete Collection', `Delete "${collection.name}"? All cards will be moved to Inbox.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeCollection(collection.id) },
    ]);
  };
  
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCollectionPress = useCallback((id: number) => {
    if (isMultiSelectMode) {
      toggleSelect(id);
    } else {
      setActiveCollectionId(id);
      router.push('/review');
    }
  }, [isMultiSelectMode, toggleSelect, setActiveCollectionId, router]);

  const handleSelectAll = () => {
    const selectableIds = filteredAndSortedCollections.map(d => d.id);
    if (selectedIds.size === selectableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const handleCancelMulti = () => {
    setIsMultiSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteMultiple = () => {
    if (selectedIds.size === 0) return;
    Alert.alert('Bulk Delete', `Delete ${selectedIds.size} collections? Cards will be moved to Inbox.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await removeMultipleCollections(Array.from(selectedIds));
          handleCancelMulti();
        },
      },
    ]);
  };

  const handleMoveMultipleCollections = (targetCollectionId: number) => {
    const sourceCollectionIds = Array.from(selectedIds);
    // Find all cards in selected collections
    const cardsToMove = flashcards.filter(c => sourceCollectionIds.includes(c.collection_id));
    if (cardsToMove.length > 0) {
      moveMultipleFlashcards(cardsToMove.map(c => c.id), targetCollectionId);
      Alert.alert('Success', `Moved ${cardsToMove.length} words to target collection.`);
    }
    setIsMoveModalVisible(false);
    handleCancelMulti();
  };

  const getCollectionWordCount = (collectionId: number) =>
    flashcards.filter(c => c.collection_id === collectionId).length;

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

  const handleSingleDelete = (card: Flashcard) => {
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];

    // Only show "Move to Inbox" if NOT already in Inbox
    if (card.collection_id !== inboxCollectionId) {
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

  // Pre-compute word counts for all collections to avoid O(N^2) lag in renderItem
  const collectionCountsMap = useMemo(() => {
    const counts: Record<number, number> = {};
    flashcards.forEach(c => {
      counts[c.collection_id] = (counts[c.collection_id] || 0) + 1;
    });
    return counts;
  }, [flashcards]);

  // Memoized Item Component to prevent unnecessary re-renders
  const CollectionItem = React.memo(({
    item,
    isSelected,
    isMultiSelect,
    onPress,
    onLongPress,
    onEdit,
    onDelete,
    count
  }: {
    item: Collection;
    isSelected: boolean;
    isMultiSelect: boolean;
    onPress: () => void;
    onLongPress: () => void;
    onEdit: (c: Collection) => void;
    onDelete: (c: Collection) => void;
    count: number;
  }) => (
    <TouchableOpacity
      delayLongPress={300}
      onLongPress={onLongPress}
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        styles.collectionCard,
        isMultiSelect && isSelected && styles.collectionCardSelected
      ]}
    >
      {isMultiSelect && (
        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
          {isSelected && <Check size={10} color="white" />}
        </View>
      )}
      <View style={styles.collectionIconBox}>
        <Text style={styles.collectionEmoji}>{item.icon || '📚'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.collectionName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.collectionCount}>{count} words</Text>
      </View>
      {!isMultiSelect && (
        <View style={styles.collectionActions}>
          <TouchableOpacity onPress={() => onEdit(item)} style={styles.iconBtn}>
            <Edit2 size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(item)} style={styles.iconBtn}>
            <Trash2 size={16} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  ));

  const renderItem = useCallback(({ item }: { item: Collection | (Flashcard & { collection_name: string; collection_icon: string }) }) => {
    // Check if it's a Flashcard (search result) or a Collection
    if ('english' in item) {
      const card = item;
      return (
        <TouchableOpacity
          key={card.id}
          style={styles.searchCardRow}
          activeOpacity={0.7}
          onPress={() => {
            setSelectedCard(card);
            setDetailVisible(true);
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.searchCardEn}>{card.english}</Text>
            <Text style={styles.searchCardVi}>{card.vietnamese}</Text>
            <Text style={styles.searchCardCollection}>{card.collection_icon || '📚'} {card.collection_name}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setActiveCollectionId(card.collection_id);
              router.push({ pathname: '/review', params: { editId: card.id } });
            }}
            style={styles.redirectBtn}
          >
            <ChevronRight size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    return (
      <CollectionItem
        key={item.id}
        item={item}
        isSelected={selectedIds.has(item.id)}
        isMultiSelect={isMultiSelectMode}
        onPress={() => handleCollectionPress(item.id)}
        onLongPress={() => {
          if (!isMultiSelectMode) {
            setIsMultiSelectMode(true);
            setSelectedIds(new Set([item.id]));
          }
        }}
        onEdit={handleOpenEdit}
        onDelete={handleDeleteCollection}
        count={collectionCountsMap[item.id] || 0}
      />
    );
  }, [isMultiSelectMode, selectedIds, collectionCountsMap, handleCollectionPress, handleOpenEdit, handleDeleteCollection]);


  const listData = useMemo(() =>
    searchQuery.length > 0 ? searchResults : filteredAndSortedCollections,
    [searchQuery, searchResults, filteredAndSortedCollections]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>

        {isMultiSelectMode && (
          <TouchableOpacity onPress={handleSelectAll} style={styles.selectAllBtn}>
            <Text style={styles.selectAllText}>
              {selectedIds.size === filteredAndSortedCollections.length ? 'Deselect' : 'Select All'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={listData}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.searchContainer}>
              <Search size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search all cards..."
                placeholderTextColor={COLORS.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {searchQuery.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Results</Text>
                  {isSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
                </View>

                {filteredAndSortedCollections.length > 0 && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.subLabel}>MATCHING COLLECTIONS</Text>
                    {filteredAndSortedCollections.map(collection => (
                      <TouchableOpacity
                        key={collection.id}
                        onPress={() => {
                          setActiveCollectionId(collection.id);
                          router.push('/review');
                        }}
                        style={styles.searchCollectionRow}
                      >
                        <Text style={{ fontSize: 18, marginRight: 10 }}>{collection.icon || '📚'}</Text>
                        <Text style={styles.searchCollectionName}>{collection.name}</Text>
                        <ChevronRight size={16} color={COLORS.primary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {searchResults.length > 0 && (
                  <Text style={styles.subLabel}>MATCHING WORDS</Text>
                )}
              </View>
            ) : (
              <>
                {inboxCollection && (
                  <TouchableOpacity
                    style={styles.inboxRow}
                    onPress={() => {
                      setActiveCollectionId(inboxCollection.id);
                      router.push('/review');
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.inboxIconBox}>
                      <Text style={styles.collectionEmoji}>{inboxCollection.icon || '📥'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inboxTitle}>Uncategorized (Inbox)</Text>
                      <Text style={styles.inboxSubtitle}>{inboxCount} {inboxCount === 1 ? 'card' : 'cards'} waiting</Text>
                    </View>
                  </TouchableOpacity>
                )}

                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.actionCard, { backgroundColor: COLORS.primary }]}
                    onPress={() => router.push({ pathname: '/session/[id]', params: { id: 'new', mode: 'new' } })}
                    activeOpacity={0.85}
                  >
                    <Brain size={22} color="white" />
                    <View style={styles.actionTextWrap}>
                      <Text style={styles.actionLabel}>Cram New</Text>
                      <Text style={styles.actionValue}>{newCramTotalCount - newCramCount}/{newCramTotalCount} today</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionCard, { backgroundColor: COLORS.warning }]}
                    onPress={() => router.push({ pathname: '/session/[id]', params: { id: 'review', mode: 'review' } })}
                    activeOpacity={0.85}
                  >
                    <RotateCcw size={22} color="white" />
                    <View style={styles.actionTextWrap}>
                      <Text style={styles.actionLabel}>Review</Text>
                      <Text style={styles.actionValue}>{reviewTotalCount - reviewCount}/{reviewTotalCount} today</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Collections</Text>
                    <TouchableOpacity onPress={() => {
                      setEditTarget(null);
                      setCollectionName('');
                      setCollectionIcon('📚');
                      setAddModalVisible(true);
                    }}>
                      <View style={styles.addBtnSmall}>
                        <Plus size={14} color={COLORS.primary} />
                        <Text style={styles.addBtnTextSmall}>New</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.sectionHeader}>
                  <Text style={styles.subLabel}>COLLECTIONS ({filteredAndSortedCollections.length})</Text>
                  <TouchableOpacity onPress={() => setShowSortMenu(v => !v)}>
                    <ArrowUpDown size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                {showSortMenu && (
                  <View style={styles.sortMenu}>
                    {SORT_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => { setSortBy(opt); setShowSortMenu(false); }}
                        style={[styles.sortChip, sortBy === opt && styles.sortChipActive]}
                      >
                        <Text style={[styles.sortChipText, sortBy === opt && styles.sortChipTextActive]}>
                          {SORT_LABELS[opt]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

              </>
            )}
          </View>
        }
        ListFooterComponent={<View style={{ height: 120 }} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        updateCellsBatchingPeriod={50}
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
            <Text style={styles.multiBarBtnText}>Merge</Text>
          </TouchableOpacity>
          <View style={styles.multiDivider} />
          <TouchableOpacity style={styles.multiBarBtn} onPress={handleDeleteMultiple}>
            <Trash2 size={20} color="#FF5252" />
            <Text style={[styles.multiBarBtnText, { color: '#FF5252' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isMultiSelectMode && !searchQuery && (
        <TouchableOpacity style={styles.fab} onPress={handleOpenAdd} activeOpacity={0.85}>
          <Plus size={28} color="white" />
        </TouchableOpacity>
      )}

      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              if (!saving) setAddModalVisible(false);
            }}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          </TouchableOpacity>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
          >
            <View style={styles.modalSheet}>
              <View style={styles.handleBar} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>{editTarget ? 'Edit Collection' : 'New Collection'}</Text>
                <TouchableOpacity
                  onPress={() => setAddModalVisible(false)}
                  style={styles.closeModalBtn}
                >
                  <X size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.modalScroll}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>NAME</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. TOEIC Vocabulary"
                    placeholderTextColor={COLORS.textMuted}
                    value={collectionName}
                    onChangeText={setCollectionName}
                    autoFocus
                    maxLength={40}
                  />
                </View>

                <View style={styles.iconSection}>
                  <Text style={styles.inputLabel}>ICON</Text>
                  <View style={styles.iconGrid}>
                    {ICON_OPTIONS.map(emoji => (
                      <TouchableOpacity
                        key={emoji}
                        style={[
                          styles.iconOption,
                          collectionIcon === emoji && styles.iconOptionSelected
                        ]}
                        onPress={() => setCollectionIcon(emoji)}
                      >
                        <Text style={{ fontSize: 24 }}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    (!collectionName.trim() || saving) && styles.saveBtnDisabled
                  ]}
                  onPress={handleSaveCollection}
                  disabled={!collectionName.trim() || saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {editTarget ? 'Save Changes' : 'Create Collection'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={isMoveModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsMoveModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.handleBar} />
            <Text style={styles.modalTitle}>Merge into Collection</Text>
            <Text style={styles.modalSubtitle}>All words from selected collections will be moved here.</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {collections.map(d => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.collectionSelectRow, selectedIds.has(d.id) && styles.collectionSelectRowDisabled]}
                  disabled={selectedIds.has(d.id)}
                  onPress={() => handleMoveMultipleCollections(d.id)}
                >
                  <Text style={styles.collectionEmoji}>{d.icon || '📚'}</Text>
                  <Text style={styles.collectionSelectName}>{d.name}</Text>
                  <ChevronRight size={16} color={COLORS.border} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setIsMoveModalVisible(false)}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
                <TouchableOpacity
                  onPress={handleAiReanalyze}
                  disabled={aiLoading}
                  style={styles.aiBadge}
                >
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2,
  },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: COLORS.textPrimary },
  selectAllBtn: { backgroundColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  selectAllText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.textSecondary },
  scroll: { flex: 1, paddingHorizontal: 16 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    borderRadius: LAYOUT.radiusSmall, paddingHorizontal: 12, height: 44,
    marginBottom: 12, marginTop: 4, ...LAYOUT.shadow,
  },
  searchInput: { flex: 1, marginLeft: 8, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textPrimary },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionCard: {
    flex: 1, borderRadius: LAYOUT.radiusMedium,
    paddingVertical: 12, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  actionTextWrap: { marginLeft: 8 },
  actionLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  actionValue: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },
  inboxRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF9F5',
    borderRadius: LAYOUT.radiusMedium, paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#FFE8D6',
  },
  inboxIconBox: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFEBDC',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  inboxTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: '#CC5A00' },
  inboxSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#E87722', marginTop: 1 },
  section: { marginTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontFamily: 'Outfit_700Bold', fontSize: 20, color: COLORS.textPrimary },
  subLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1.1, color: COLORS.textMuted, marginBottom: 8, marginTop: 4 },
  sortMenu: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.border },
  sortChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sortChipText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.textSecondary },
  sortChipTextActive: { color: 'white' },
  searchCollectionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryLight, borderRadius: LAYOUT.radiusSmall, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  searchCollectionName: { flex: 1, fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary, marginLeft: 10 },
  searchCardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: LAYOUT.radiusSmall, padding: 12, marginBottom: 6, ...LAYOUT.shadow },
  searchCardEn: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
  searchCardVi: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  searchCardCollection: { fontFamily: 'Inter_500Medium', fontSize: 9, color: COLORS.primary, marginTop: 3, letterSpacing: 0.4 },
  redirectBtn: { padding: 6, marginLeft: 4, borderRadius: 16, backgroundColor: COLORS.primaryLight },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 32 },
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 18, color: COLORS.textPrimary, marginTop: 12 },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },

  multiBar: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#1A1A1A', borderRadius: 16, flexDirection: 'row', padding: 2, ...LAYOUT.shadow },
  multiBarBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  multiBarBtnText: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },
  multiDivider: { width: 1, height: '50%', backgroundColor: '#333', alignSelf: 'center' },

  fab: { position: 'absolute', right: 16, bottom: 16, width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', ...LAYOUT.shadow, elevation: 4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  keyboardView: { width: '100%' },
  modalSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 12, // Reduced to be closer to edge
    width: '100%',
    maxHeight: '92%', // Increased slightly
    ...LAYOUT.shadow,
    elevation: 20,
  },
  handleBar: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: COLORS.textPrimary },
  modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  closeModalBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  modalScroll: { maxHeight: 500 }, // Increased to show more icons
  inputSection: { marginBottom: 16 },
  iconSection: { marginBottom: 8 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.2, color: COLORS.textMuted, marginBottom: 8 },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 4 },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent'
  },
  iconOptionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  modalFooter: { paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...LAYOUT.shadow
  },
  saveBtnDisabled: { backgroundColor: COLORS.border, shadowOpacity: 0 },
  saveBtnText: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: 'white' },

  collectionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    borderRadius: LAYOUT.radiusMedium, paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 8, ...LAYOUT.shadow, borderWidth: 1.5, borderColor: 'transparent'
  },
  collectionCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.border, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  collectionIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  collectionEmoji: { fontSize: 20 },
  collectionName: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
  collectionCount: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  collectionActions: { flexDirection: 'row' },
  iconBtn: { padding: 4, marginLeft: 2 },
  collectionSelectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  collectionSelectRowDisabled: { opacity: 0.3 },
  collectionSelectName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 16, color: COLORS.textPrimary, marginLeft: 12 },
  closeBtn: { marginTop: 20, paddingVertical: 14, alignItems: 'center', borderRadius: 12, backgroundColor: COLORS.background },
  closeBtnText: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: COLORS.textSecondary },
  // Edit Modal Styles
  modalOverlayEdit: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheetEdit: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeaderEdit: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitleEdit: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.textPrimary },
  aiBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, gap: 4 },
  aiText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.primary },
  inputLabelEdit: { fontFamily: 'Inter_500Medium', fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.8, marginBottom: 4 },
  textInput: { backgroundColor: COLORS.background, borderRadius: LAYOUT.radiusXSmall, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border, textAlignVertical: 'top' },
  saveBtnEdit: { backgroundColor: COLORS.primary, borderRadius: LAYOUT.radiusSmall, paddingVertical: 12, alignItems: 'center' },
  saveBtnTextEdit: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: 'white' },
  addBtnSmall: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4
  },
  addBtnTextSmall: { fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: COLORS.primary },
});
