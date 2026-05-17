import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { Check, RotateCcw, Volume2, VolumeX, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, LAYOUT } from '../../constants/theme';
import { getAge, getTargetReps } from '../../lib/algorithm';
import { useFlashcardStore } from '../../store/useFlashcardStore';

export default function SessionScreen() {
  useKeepAwake();
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const {
    sessionQueue, currentSessionIndex, sessionMode, startSession, recordRep, nextCard, collections,
    isAutoPlayEnabled, toggleAutoPlay, undoRep
  } = useFlashcardStore();

  const [isFlipped, setIsFlipped] = useState(false);
  const [studyMode, setStudyMode] = useState<'en-vi' | 'vi-en'>('en-vi');
  const [history, setHistory] = useState<{ index: number; cardId: number; wasSuccess: boolean } | null>(null);
  const flipAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    let collectionId: number | undefined;
    if (id !== 'new' && id !== 'review') collectionId = Number(id);
    startSession(collectionId, (mode as any) || 'review');
  }, [id, mode]);

  useEffect(() => {
    if (isAutoPlayEnabled && currentCard && !isFlipped) {
      if (studyMode === 'en-vi') {
        Speech.speak(currentCard.english, { language: 'en-US' });
      }
    }
  }, [currentSessionIndex, isAutoPlayEnabled]);

  const currentCard = sessionQueue[currentSessionIndex];

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 0 : 180,
      friction: 8, tension: 10, useNativeDriver: true,
    }).start();
    setIsFlipped(v => !v);
  };

  const handleRating = async (isSuccess: boolean) => {
    if (!currentCard) return;
    Haptics.notificationAsync(isSuccess ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);

    setHistory({ index: currentSessionIndex, cardId: currentCard.id, wasSuccess: isSuccess });
    await recordRep(currentCard.id, isSuccess);

    // Reset flip
    Animated.timing(flipAnim, { toValue: 0, duration: 0, useNativeDriver: true }).start();
    setIsFlipped(false);

    nextCard();
  };

  const handleUndo = async () => {
    if (!history) return;
    // Move back and un-flip
    Animated.timing(flipAnim, { toValue: 180, duration: 0, useNativeDriver: true }).start();
    setIsFlipped(true);
    
    // Use the store's undoRep logic
    await undoRep(history.cardId, history.wasSuccess);
    
    // Go back index
    useFlashcardStore.setState({ currentSessionIndex: history.index });
    setHistory(null);
  };

  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] });
  const backInterpolate = flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] });

  if (sessionQueue.length === 0 && currentSessionIndex === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <RotateCcw size={64} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Nothing to review!</Text>
          <Text style={styles.emptySubtitle}>You're all caught up for today.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (currentSessionIndex >= sessionQueue.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Check size={64} color={COLORS.success} />
          <Text style={styles.emptyTitle}>Session Complete!</Text>
          <Text style={styles.emptySubtitle}>Great job! You've finished your review.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Finish</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progress = (currentSessionIndex / sessionQueue.length) * 100;
  const age = currentCard ? getAge(currentCard.created_at) : 0;
  const dayOfWeek = new Date().getDay();
  const targetReps = sessionMode === 'all' ? 3 : (getTargetReps(age, dayOfWeek) || 1);

  const activeCollection = id && id !== 'review' && id !== 'new' 
    ? collections.find(c => c.id === Number(id)) 
    : null;

  const displayTitle = activeCollection 
    ? activeCollection.name 
    : id === 'new' ? 'Cram New' : 'Daily Review';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <X size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>{currentSessionIndex + 1} / {sessionQueue.length}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {history && (
            <TouchableOpacity onPress={handleUndo} style={styles.headerBtn}>
              <RotateCcw size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={toggleAutoPlay}
            style={[styles.headerBtn, { marginRight: 4 }]}
          >
            {isAutoPlayEnabled ? (
              <Volume2 size={20} color={COLORS.primary} />
            ) : (
              <VolumeX size={20} color={COLORS.textMuted} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStudyMode(v => v === 'en-vi' ? 'vi-en' : 'en-vi')}
            style={styles.modeBadge}
          >
            <Text style={styles.modeText}>{studyMode === 'en-vi' ? 'EN→VI' : 'VI→EN'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Age badge */}
      {currentCard && (
        <View style={styles.ageBadge}>
          <Text style={styles.ageText}>
            Day {age} · {currentCard.daily_reps}/{targetReps} reps
          </Text>
        </View>
      )}

      {/* Flip Card */}
      <View style={styles.cardArea}>
        <View style={styles.cardWrapper}>
          {/* Front */}
          <Animated.View
            pointerEvents={isFlipped ? 'none' : 'auto'}
            style={[styles.card, styles.cardFront, { transform: [{ rotateY: frontInterpolate }] }]}
          >
            <TouchableOpacity activeOpacity={1} onPress={handleFlip} style={styles.cardInner}>
              <View style={StyleSheet.absoluteFill} />
              {studyMode === 'en-vi' && (
                <TouchableOpacity
                  onPress={() => currentCard && Speech.speak(currentCard.english, { language: 'en-US' })}
                  style={styles.speakBtn}
                >
                  <Volume2 size={28} color="white" />
                </TouchableOpacity>
              )}
              <View style={styles.wordWrap}>
                {studyMode === 'en-vi' ? (
                  <>
                    <Text style={styles.wordText}>{currentCard?.english}</Text>
                    {currentCard?.word_type && (
                      <View style={styles.wordTypeBadge}>
                        <Text style={styles.wordTypeText}>{currentCard.word_type}</Text>
                      </View>
                    )}
                    {currentCard?.phonetic && (
                      <Text style={styles.phoneticText}>{currentCard.phonetic}</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.wordText}>{currentCard?.vietnamese}</Text>
                )}
              </View>
              <Text style={styles.tapFlip}>TAP TO FLIP</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Back */}
          <Animated.View
            pointerEvents={isFlipped ? 'auto' : 'none'}
            style={[styles.card, styles.cardBack, { transform: [{ rotateY: backInterpolate }], opacity: isFlipped ? 1 : 0 }]}
          >
            <ScrollView contentContainerStyle={styles.cardBackContent} showsVerticalScrollIndicator>
              <TouchableOpacity activeOpacity={1} onPress={handleFlip} style={{ flex: 1, minHeight: 320 }}>
                <View style={StyleSheet.absoluteFill} />
                {studyMode === 'en-vi' ? (
                  <>
                    <Text style={styles.backLabel}>TRANSLATION</Text>
                    <Text style={styles.backMainText}>{currentCard?.vietnamese}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.backLabel}>ENGLISH</Text>
                    <View style={styles.backEnRow}>
                      <Text style={styles.backMainText}>{currentCard?.english}</Text>
                      <TouchableOpacity
                        onPress={() => currentCard && Speech.speak(currentCard.english, { language: 'en-US' })}
                        style={styles.backSpeakBtn}
                      >
                        <Volume2 size={22} color={COLORS.primary} />
                      </TouchableOpacity>
                    </View>
                    {currentCard?.phonetic && (
                      <Text style={styles.backPhonetic}>{currentCard.phonetic}</Text>
                    )}
                  </>
                )}

                {currentCard?.grammar_note ? (
                  <>
                    <Text style={[styles.backLabel, { marginTop: 20 }]}>GRAMMAR</Text>
                    <Text style={styles.backNote}>{currentCard.grammar_note}</Text>
                  </>
                ) : null}

                {(currentCard?.example_en || currentCard?.example_vi) ? (
                  <>
                    <Text style={[styles.backLabel, { marginTop: 20 }]}>EXAMPLE</Text>
                    <Text style={styles.backExampleEn}>{currentCard?.example_en}</Text>
                    <Text style={styles.backExampleVi}>{currentCard?.example_vi}</Text>
                  </>
                ) : null}
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
      </View>

      {/* Rating Buttons */}
      {isFlipped && (
        <View style={styles.ratingRow}>
          <TouchableOpacity onPress={() => handleRating(false)} style={[styles.ratingBtn, styles.ratingForgot]}>
            <Text style={styles.ratingText}>Forgot</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleRating(true)} style={[styles.ratingBtn, styles.ratingRemembered]}>
            <Text style={styles.ratingText}>Remembered</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 16,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: COLORS.textPrimary, marginBottom: 4 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', paddingHorizontal: 16 },
  progressTrack: {
    flex: 1, height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  progressText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: COLORS.textMuted },
  modeBadge: {
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  modeText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: COLORS.primary },

  ageBadge: { alignSelf: 'center', backgroundColor: 'rgba(0,82,204,0.08)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  ageText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.primary },

  cardArea: { flex: 1, padding: 20, justifyContent: 'center' },
  cardWrapper: { width: '100%', height: 380 },
  card: {
    width: '100%', height: '100%', position: 'absolute',
    borderRadius: 32, backfaceVisibility: 'hidden', overflow: 'hidden',
  },
  cardFront: { backgroundColor: COLORS.primary },
  cardBack: { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.border, ...LAYOUT.shadow },
  cardInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  speakBtn: { marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.2)', padding: 14, borderRadius: 40 },
  wordWrap: { alignItems: 'center' },
  wordText: { fontFamily: 'Outfit_700Bold', fontSize: 38, color: 'white', textAlign: 'center', lineHeight: 48 },
  wordTypeBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  wordTypeText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: 'white' },
  phoneticText: { fontFamily: 'Inter_400Regular', fontSize: 18, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic', marginTop: 8 },
  tapFlip: {
    position: 'absolute', bottom: 24,
    fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 2, color: 'rgba(255,255,255,0.6)',
  },
  cardBackContent: { padding: 28, flexGrow: 1 },
  backLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, letterSpacing: 1.5, color: COLORS.textMuted, marginBottom: 8 },
  backMainText: { fontFamily: 'Outfit_700Bold', fontSize: 30, color: COLORS.textPrimary, flex: 1 },
  backEnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  backSpeakBtn: { padding: 8, borderRadius: 20, backgroundColor: COLORS.primaryLight },
  backPhonetic: { fontFamily: 'Inter_400Regular', fontSize: 16, color: COLORS.primary, fontStyle: 'italic', marginTop: 4 },
  backNote: { fontFamily: 'Inter_400Regular', fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, fontStyle: 'italic' },
  backExampleEn: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: COLORS.textPrimary, lineHeight: 24 },
  backExampleVi: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, marginTop: 6 },

  ratingRow: { flexDirection: 'row', paddingHorizontal: 24, paddingBottom: 40, gap: 16 },
  ratingBtn: { flex: 1, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', ...LAYOUT.shadow },
  ratingForgot: { backgroundColor: '#EF4444' },
  ratingRemembered: { backgroundColor: COLORS.success },
  ratingText: { fontFamily: 'Outfit_700Bold', fontSize: 15, color: 'white' },

  // Empty states
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: COLORS.textPrimary, marginTop: 24, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 16, color: COLORS.textSecondary, marginTop: 8, textAlign: 'center' },
  backBtn: {
    backgroundColor: COLORS.primary, borderRadius: LAYOUT.radiusSmall,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 32,
  },
  backBtnText: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: 'white' },
});
