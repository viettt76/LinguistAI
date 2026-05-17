import React, { useCallback, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WordDetailModal } from '../../components/flashcard/WordDetailModal';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { COLORS, LAYOUT } from '../../constants/theme';
import { getAge, getTargetReps, isOverdue } from '../../lib/algorithm';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { Flashcard } from '../../types';
import { Sparkles, Calendar, ChevronRight, TrendingUp, Book, Clock, Award, RotateCcw } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function ProgressScreen() {
  const router = useRouter();
  const { 
    flashcards, collections, refresh,
    isExamActive, examIndex, examQueue, examResults, startExam, resetExam,
    updateFlashcard, removeFlashcard, moveFlashcard, inboxCollectionId
  } = useFlashcardStore();

  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [showWords, setShowWords] = React.useState(false);
  const [showPicker, setShowPicker] = React.useState(false);

  // Word detail state
  const [selectedCard, setSelectedCard] = React.useState<Flashcard | null>(null);
  const [detailVisible, setDetailVisible] = React.useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = React.useState(false);
  const [editData, setEditData] = React.useState({
    english: '',
    vietnamese: '',
    grammar_note: '',
    example_en: '',
    example_vi: '',
    phonetic: '',
    word_type: '',
  });
  const [aiLoading, setAiLoading] = React.useState(false);

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

  const handleSingleDelete = (card: Flashcard) => {
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }];

    if (card.collection_id !== inboxCollectionId) {
      options.push({
        text: 'Move to Inbox',
        onPress: async () => {
          if (inboxCollectionId) {
            await moveFlashcard(card.id, inboxCollectionId);
            setDetailVisible(false);
            refresh();
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
        refresh();
      },
    });

    Alert.alert('Delete Card', `What would you like to do with "${card.english}"?`, options);
  };

  useFocusEffect(useCallback(() => { refresh(); }, []));

  const stats = useMemo(() => {
    const total = flashcards.length;
    const today = new Date();
    const dayOfWeek = today.getDay();

    const mastered = flashcards.filter(c => getAge(c.created_at) > 35).length;
    const learning = flashcards.filter(c => {
      const age = getAge(c.created_at);
      return age <= 35 && c.total_reps > 0;
    }).length;
    const newCards = flashcards.filter(c => c.total_reps === 0).length;
    
    const dueTodayCount = flashcards.filter(c => {
      const age = getAge(c.created_at);
      const target = getTargetReps(age, dayOfWeek);
      return (target > 0 && c.daily_reps < target) || isOverdue(c, today);
    }).length;

    const masteryPercent = total > 0 ? Math.round((mastered / total) * 100) : 0;

    return { total, mastered, learning, newCards, dueTodayCount, masteryPercent };
  }, [flashcards]);

  const StatBox = ({ title, count, icon: Icon, color, subtitle }: any) => (
    <Card style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '15' }]}>
        <Icon size={24} color={color} />
      </View>
      <Text style={styles.statValue}>{count}</Text>
      <Text style={styles.statLabel}>{title}</Text>
      <Text style={styles.statSub}>{subtitle}</Text>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Learning Progress</Text>
        <Text style={styles.subtitle}>Visualize your journey to mastery.</Text>

        {/* Daily Breakdown Section */}
        <Text style={styles.sectionTitle}>DAILY BREAKDOWN</Text>
        <Card style={styles.breakdownCard}>
          <View style={styles.datePickerContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
                {[-3, -2, -1, 0, 1, 2, 3].map(offset => {
                  const d = new Date();
                  d.setDate(d.getDate() + offset);
                  const isSelected = d.toDateString() === selectedDate.toDateString();
                  const dayName = offset === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
                  const dayNum = d.getDate();
                  
                  return (
                    <TouchableOpacity 
                      key={offset} 
                      onPress={() => setSelectedDate(d)}
                      style={[styles.dateItem, isSelected && styles.dateItemSelected]}
                    >
                      <Text style={[styles.dateDay, isSelected && styles.dateTextSelected]}>{dayName}</Text>
                      <Text style={[styles.dateNum, isSelected && styles.dateTextSelected]}>{dayNum}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.datePickerDivider} />
              <TouchableOpacity 
                style={styles.calendarBtn}
                onPress={() => setShowPicker(true)}
              >
                <Calendar size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            
            {showPicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, date) => {
                  setShowPicker(false);
                  if (date) setSelectedDate(date);
                }}
              />
            )}
          </View>

          <View style={styles.breakdownStats}>
            {(() => {
              const dayCards = flashcards.filter(c => new Date(c.created_at).toDateString() === selectedDate.toDateString());
              const dayOfWeek = selectedDate.getDay();
              const reviewCards = flashcards.filter(c => {
                const age = getAge(c.created_at, selectedDate);
                const target = getTargetReps(age, dayOfWeek);
                return age > 0 && target > 0;
              });

              return (
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedDateLabel}>
                    {selectedDate.toDateString() === new Date().toDateString() ? 'Showing Today' : `Date: ${selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={styles.breakdownStat}>
                      <Text style={styles.breakdownValue}>{dayCards.length}</Text>
                      <Text style={styles.breakdownLabel}>New Words</Text>
                    </View>
                    <View style={styles.breakdownDivider} />
                    <View style={styles.breakdownStat}>
                      <Text style={styles.breakdownValue}>{reviewCards.length}</Text>
                      <Text style={styles.breakdownLabel}>To Review</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.viewWordsBtn}
                      onPress={() => setShowWords(!showWords)}
                    >
                      <Text style={styles.viewWordsText}>{showWords ? 'Hide' : 'View'}</Text>
                      <ChevronRight size={16} color={COLORS.primary} style={{ transform: [{ rotate: showWords ? '90deg' : '0deg' }] }} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}
          </View>

          {showWords && (
            <View style={styles.wordListContainer}>
              {(() => {
                const dayCards = flashcards.filter(c => new Date(c.created_at).toDateString() === selectedDate.toDateString());
                const dayOfWeek = selectedDate.getDay();
                const reviewCards = flashcards.filter(c => {
                  const age = getAge(c.created_at, selectedDate);
                  const target = getTargetReps(age, dayOfWeek);
                  return age > 0 && target > 0;
                });

                if (dayCards.length === 0 && reviewCards.length === 0) {
                  return <Text style={styles.emptyListText}>No vocabulary activity on this day.</Text>;
                }

                return (
                  <>
                    {dayCards.length > 0 && (
                      <View style={[styles.listSection, styles.newWordsSection]}>
                        <View style={styles.sectionHighlightBar} />
                        <Text style={styles.listSectionTitle}>NEW WORDS ({dayCards.length})</Text>
                        {dayCards.map(c => (
                          <TouchableOpacity 
                            key={c.id} 
                            style={styles.wordRow}
                            onPress={() => {
                              setSelectedCard(c);
                              setDetailVisible(true);
                            }}
                          >
                            <Text style={styles.wordEn}>{c.english}</Text>
                            <Text style={styles.wordVi} numberOfLines={1}>{c.vietnamese}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {reviewCards.length > 0 && (
                      <View style={[styles.listSection, styles.reviewWordsSection]}>
                        <View style={[styles.sectionHighlightBar, { backgroundColor: COLORS.warning }]} />
                        <Text style={[styles.listSectionTitle, { color: COLORS.warning }]}>REVIEW WORDS ({reviewCards.length})</Text>
                        {reviewCards.map(c => (
                          <TouchableOpacity 
                            key={c.id} 
                            style={styles.wordRow}
                            onPress={() => {
                              setSelectedCard(c);
                              setDetailVisible(true);
                            }}
                          >
                            <Text style={styles.wordEn}>{c.english}</Text>
                            <Text style={styles.wordVi} numberOfLines={1}>{c.vietnamese}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
          )}
        </Card>

        {/* Master Card */}
        <View style={styles.masterCard}>
          <View style={styles.masterHeader}>
            <View>
              <Text style={styles.masterLabel}>TOTAL VOCABULARY</Text>
              <Text style={styles.masterValue}>{stats.total}</Text>
            </View>
            <TrendingUp size={48} color="rgba(255,255,255,0.2)" />
          </View>
          <View style={styles.masterFooter}>
            <View style={styles.masterProgressWrap}>
              <View style={styles.masterProgressTrack}>
                <View style={[styles.masterProgressFill, { width: `${stats.masteryPercent}%` }]} />
              </View>
              <Text style={styles.masterProgressText}>{stats.masteryPercent}% Mastered</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>MASTERY LEVELS</Text>
        <View style={styles.statsGrid}>
          <StatBox title="New" count={stats.newCards} icon={Book} color="#94A3B8" subtitle="Never studied" />
          <StatBox title="In Review" count={stats.learning} icon={Clock} color="#F97316" subtitle="Current cycle" />
          <StatBox title="Mastered" count={stats.mastered} icon={Award} color={COLORS.success} subtitle="Graduated" />
          <StatBox title="Due Today" count={stats.dueTodayCount} icon={TrendingUp} color={COLORS.primary} subtitle="Tasks for today" />
        </View>

        {/* Mastery Exam Section */}
        <Text style={styles.sectionTitle}>MASTERY EXAM</Text>
        <Card style={styles.examCard}>
          <View style={styles.examHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.examTitle}>Global Knowledge Check</Text>
              <Text style={styles.examSub}>Test all studied words without re-learning cycles.</Text>
            </View>
            <Award size={32} color={COLORS.primary} />
          </View>
          
          {isExamActive ? (
            <View style={styles.examProgressRow}>
              <View style={styles.examProgressInfo}>
                <Text style={styles.examProgressText}>
                  {examIndex >= examQueue.length ? 'Exam Completed' : `Progress: ${examIndex} / ${examQueue.length}`}
                </Text>
                <Text style={styles.examScoreText}>
                  <Text style={{ color: COLORS.success }}>{examResults.remember}</Text> Correct • <Text style={{ color: COLORS.danger }}>{examResults.forget}</Text> Wrong
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity 
                  onPress={() => {
                    Alert.alert("Reset Exam", "Are you sure you want to discard your progress and start over?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Reset", style: "destructive", onPress: resetExam }
                    ]);
                  }}
                  style={styles.resetBtnSmall}
                >
                  <RotateCcw size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <Button 
                  title={examIndex >= examQueue.length ? "Results" : "Continue"} 
                  size="small"
                  onPress={() => router.push('/exam')} 
                />
              </View>
            </View>
          ) : (
            <Button 
              title="Start New Exam" 
              variant="primary"
              onPress={() => {
                if (stats.learning + stats.mastered === 0) {
                  Alert.alert("Notice", "You need to study some words first!");
                } else {
                  startExam();
                  router.push('/exam');
                }
              }} 
              style={{ marginTop: 12 }}
            />
          )}
        </Card>


        <Text style={styles.sectionTitle}>COLLECTION BREAKDOWN</Text>
        {collections.map(collection => {
          const collectionCards = flashcards.filter(c => c.collection_id === collection.id);
          const collectionMastered = collectionCards.filter(c => getAge(c.created_at) > 35).length;
          const percent = collectionCards.length > 0 ? Math.round((collectionMastered / collectionCards.length) * 100) : 0;
          
          return (
            <TouchableOpacity 
              key={collection.id} 
              onPress={() => router.push(`/collection/${collection.id}`)}
              activeOpacity={0.7}
            >
              <Card style={styles.collectionItem}>
                <View style={styles.collectionHeader}>
                  <Text style={styles.collectionName}>{collection.name}</Text>
                  <Text style={styles.collectionPercent}>{percent}%</Text>
                </View>
                <View style={styles.collectionTrack}>
                  <View style={[styles.collectionFill, { width: `${percent}%` }]} />
                </View>
                <View style={styles.collectionFooter}>
                  <Text style={styles.collectionSub}>{collectionMastered} / {collectionCards.length} mastered</Text>
                  <ChevronRight size={16} color={COLORS.textMuted} />
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 100 }} />
      </ScrollView>

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
                <View style={{ height: 40 }} />
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
  title: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: COLORS.textPrimary },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  
  masterCard: {
    backgroundColor: COLORS.primary, borderRadius: 24, padding: 20, marginBottom: 24,
    ...LAYOUT.shadow, shadowColor: COLORS.primary, shadowOpacity: 0.2, elevation: 6,
  },
  masterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  masterLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  masterValue: { fontFamily: 'Outfit_700Bold', fontSize: 40, color: 'white' },
  masterFooter: { marginTop: 20 },
  masterProgressWrap: { gap: 8 },
  masterProgressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' },
  masterProgressFill: { height: '100%', backgroundColor: 'white', borderRadius: 3 },
  masterProgressText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: 'white' },

  sectionTitle: { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1.2, color: COLORS.textMuted, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: { width: (width - 42) / 2, padding: 14, alignItems: 'flex-start' },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontFamily: 'Outfit_700Bold', fontSize: 20, color: COLORS.textPrimary },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  statSub: { fontFamily: 'Inter_400Regular', fontSize: 9, color: COLORS.textMuted, marginTop: 1 },

  collectionItem: { padding: 16, marginBottom: 10 },
  collectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  collectionName: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: COLORS.textPrimary },
  collectionPercent: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: COLORS.primary },
  collectionTrack: { height: 5, backgroundColor: COLORS.border, borderRadius: 2.5, overflow: 'hidden' },
  collectionFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2.5 },
  collectionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  collectionSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: COLORS.textSecondary },
  
  // Exam Styles
  examCard: { padding: 16, marginBottom: 24 },
  examHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  examTitle: { fontFamily: 'Outfit_700Bold', fontSize: 17, color: COLORS.textPrimary },
  examSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  examProgressRow: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.background, padding: 12, borderRadius: 12, marginTop: 8 
  },
  examProgressInfo: { flex: 1 },
  examProgressText: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: COLORS.textPrimary },
  examScoreText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  resetBtnSmall: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: 'white',
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center'
  },
  
  // Breakdown Styles
  breakdownCard: { padding: 0, overflow: 'hidden', marginBottom: 24 },
  datePickerContainer: { backgroundColor: COLORS.background, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dateList: { paddingHorizontal: 12, gap: 8 },
  dateItem: { width: 48, height: 56, borderRadius: 12, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  dateItemSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dateDay: { fontFamily: 'Inter_500Medium', fontSize: 10, color: COLORS.textMuted, marginBottom: 2 },
  dateNum: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: COLORS.textPrimary },
  dateTextSelected: { color: 'white' },
  selectedDateLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: COLORS.primary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  datePickerDivider: { width: 1, height: 32, backgroundColor: COLORS.border, marginHorizontal: 8 },
  calendarBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', marginRight: 12, ...LAYOUT.shadow },
  
  breakdownStats: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  breakdownStat: { flex: 1, alignItems: 'center' },
  breakdownValue: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.textPrimary },
  breakdownLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  breakdownDivider: { width: 1, height: 24, backgroundColor: COLORS.border },
  viewWordsBtn: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: COLORS.border, gap: 4 },
  viewWordsText: { fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: COLORS.primary },
  
  wordListContainer: { padding: 16, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border },
  listSection: { marginBottom: 20, paddingLeft: 12, position: 'relative' },
  newWordsSection: { borderLeftWidth: 0 },
  reviewWordsSection: { borderLeftWidth: 0, marginTop: 10 },
  sectionHighlightBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: COLORS.primary, borderRadius: 2 },
  listSectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 10, color: COLORS.primary, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  wordRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 10, marginBottom: 8, ...LAYOUT.shadow },
  wordEn: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, color: COLORS.textPrimary, flex: 1 },
  wordVi: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textSecondary, flex: 1, textAlign: 'right' },
  emptyListText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 20 },

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
});
