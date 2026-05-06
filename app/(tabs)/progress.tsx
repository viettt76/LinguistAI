import { useFocusEffect, useRouter } from 'expo-router';
import { Award, Book, ChevronRight, Clock, RotateCcw, TrendingUp } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { COLORS, LAYOUT } from '../../constants/theme';
import { getAge, getTargetReps, isOverdue } from '../../lib/algorithm';
import { useFlashcardStore } from '../../store/useFlashcardStore';

const { width } = Dimensions.get('window');

export default function ProgressScreen() {
  const router = useRouter();
  const { 
    flashcards, collections, refresh,
    isExamActive, examIndex, examQueue, examResults, startExam, resetExam
  } = useFlashcardStore();

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
});
