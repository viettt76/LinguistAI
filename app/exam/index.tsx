import { Stack, useRouter } from 'expo-router';
import { AlertCircle, Check, ChevronLeft, RotateCcw, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { COLORS, LAYOUT } from '../../constants/theme';
import { useFlashcardStore } from '../../store/useFlashcardStore';

export default function ExamScreen() {
  const router = useRouter();
  const {
    examQueue, examIndex, examResults, recordExamRep, resetExam, isExamActive
  } = useFlashcardStore();

  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = React.useRef(new Animated.Value(0)).current;

  const currentCard = examQueue[examIndex];
  const isFinished = examIndex >= examQueue.length;

  const flipCard = () => {
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const handleResponse = (isSuccess: boolean) => {
    if (isFlipped) {
      flipCard();
      setTimeout(() => recordExamRep(isSuccess), 150);
    } else {
      recordExamRep(isSuccess);
    }
  };

  const handleReset = () => {
    resetExam();
    router.back();
  };

  if (!isExamActive || examQueue.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.emptyContent}>
          <AlertCircle size={64} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No Exam Session</Text>
          <Text style={styles.emptySub}>Please start an exam from the Progress tab.</Text>
          <Button title="Go Back" onPress={() => router.back()} style={{ marginTop: 20 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (isFinished) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>Exam Completed!</Text>
          <Text style={styles.resultSub}>Here is how you performed across {examQueue.length} words.</Text>
        </View>

        <View style={styles.resultStats}>
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>REMEMBERED</Text>
            <Text style={[styles.resultValue, { color: COLORS.success }]}>{examResults.remember}</Text>
          </View>
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>FORGOTTEN</Text>
            <Text style={[styles.resultValue, { color: COLORS.danger }]}>{examResults.forget}</Text>
          </View>
        </View>

        <View style={styles.scoreCircle}>
          <Text style={styles.scoreText}>
            {Math.round((examResults.remember / examQueue.length) * 100)}%
          </Text>
          <Text style={styles.scoreLabel}>Accuracy</Text>
        </View>

        <View style={styles.resultActions}>
          <Button
            title="Finish & Close"
            onPress={handleReset}
            style={{ flex: 1 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <ChevronLeft size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Mastery Exam</Text>
          <Text style={styles.headerProgress}>{examIndex + 1} / {examQueue.length}</Text>
        </View>
        <TouchableOpacity onPress={handleReset} style={styles.headerBtn}>
          <RotateCcw size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.cardContainer}>
          <TouchableOpacity activeOpacity={1} onPress={flipCard} style={styles.flipTouch}>
            <Animated.View style={[styles.card, styles.cardFront, { transform: [{ rotateY: frontInterpolate }] }]}>
              <Text style={styles.wordEn}>{currentCard.english}</Text>
              {currentCard.phonetic && <Text style={styles.phonetic}>{currentCard.phonetic}</Text>}
              <Text style={styles.hintText}>Tap to reveal meaning</Text>
            </Animated.View>

            <Animated.View style={[styles.card, styles.cardBack, { transform: [{ rotateY: backInterpolate }] }]}>
              <Text style={styles.wordEnSmall}>{currentCard.english}</Text>
              <View style={styles.divider} />
              <Text style={styles.wordVi}>{currentCard.vietnamese}</Text>
              {currentCard.example_en && (
                <View style={styles.exampleWrap}>
                  <Text style={styles.exampleEn}>{currentCard.example_en}</Text>
                  <Text style={styles.exampleVi}>{currentCard.example_vi}</Text>
                </View>
              )}
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View style={styles.examScoreBar}>
          <View style={styles.scoreItem}>
            <Check size={16} color={COLORS.success} />
            <Text style={styles.scoreNum}>{examResults.remember}</Text>
          </View>
          <View style={styles.scoreItem}>
            <X size={16} color={COLORS.danger} />
            <Text style={styles.scoreNum}>{examResults.forget}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.forgotBtn]}
            onPress={() => handleResponse(false)}
          >
            <X size={28} color="white" />
            <Text style={styles.btnText}>Forgot</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.rememberBtn]}
            onPress={() => handleResponse(true)}
          >
            <Check size={28} color="white" />
            <Text style={styles.btnText}>Remember</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { alignItems: 'center' },
  headerTitle: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: COLORS.textPrimary },
  headerProgress: { fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textMuted },

  content: { flex: 1, padding: 20, justifyContent: 'center' },
  cardContainer: { height: 400, width: '100%', marginBottom: 30 },
  flipTouch: { flex: 1 },
  card: {
    position: 'absolute', width: '100%', height: '100%',
    backgroundColor: 'white', borderRadius: 24, padding: 30,
    alignItems: 'center', justifyContent: 'center',
    backfaceVisibility: 'hidden', ...LAYOUT.shadow,
  },
  cardFront: { zIndex: 2 },
  cardBack: { zIndex: 1 },
  wordEn: { fontFamily: 'Outfit_700Bold', fontSize: 36, color: COLORS.textPrimary, textAlign: 'center' },
  wordEnSmall: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: COLORS.primary, textAlign: 'center' },
  phonetic: { fontFamily: 'Inter_400Regular', fontSize: 18, color: COLORS.primary, marginTop: 8 },
  hintText: { position: 'absolute', bottom: 30, fontFamily: 'Inter_500Medium', fontSize: 12, color: COLORS.textMuted },
  divider: { height: 1, width: '40%', backgroundColor: COLORS.border, marginVertical: 20 },
  wordVi: { fontFamily: 'Outfit_600SemiBold', fontSize: 28, color: COLORS.textPrimary, textAlign: 'center' },
  exampleWrap: { marginTop: 24, alignItems: 'center' },
  exampleEn: { fontFamily: 'Inter_400Regular', fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', fontStyle: 'italic' },
  exampleVi: { fontFamily: 'Inter_400Regular', fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },

  examScoreBar: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 20 },
  scoreItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, ...LAYOUT.shadow },
  scoreNum: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: COLORS.textPrimary },

  actions: { flexDirection: 'row', gap: 16 },
  actionBtn: {
    flex: 1, height: 64, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    ...LAYOUT.shadow,
  },
  forgotBtn: { backgroundColor: COLORS.danger },
  rememberBtn: { backgroundColor: COLORS.success },
  btnText: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: 'white' },

  // Result Styles
  resultHeader: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
  resultTitle: { fontFamily: 'Outfit_700Bold', fontSize: 32, color: COLORS.textPrimary },
  resultSub: { fontFamily: 'Inter_400Regular', fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10 },
  resultStats: { flexDirection: 'row', gap: 16, padding: 20, marginTop: 40 },
  resultBox: { flex: 1, backgroundColor: 'white', padding: 20, borderRadius: 20, alignItems: 'center', ...LAYOUT.shadow },
  resultLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, letterSpacing: 1, color: COLORS.textMuted, marginBottom: 8 },
  resultValue: { fontFamily: 'Outfit_700Bold', fontSize: 28 },
  scoreCircle: {
    width: 150, height: 150, borderRadius: 75,
    borderWidth: 10, borderColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginTop: 40
  },
  scoreText: { fontFamily: 'Outfit_700Bold', fontSize: 40, color: COLORS.textPrimary },
  scoreLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: COLORS.textMuted },
  resultActions: { padding: 20, marginTop: 'auto', marginBottom: 40 },

  emptyContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: COLORS.textPrimary, marginTop: 20 },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: 10 },
});
