import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { database } from '../db';
import Game from '../db/models/Game';
import Team from '../db/models/Team';

interface TeamSeed {
  id: string;
  name: string;
  seed: number;
  w: number;
}

interface Matchup {
  teamA: TeamSeed | null;
  teamB: TeamSeed | null;
  winner?: TeamSeed | null;
}

interface PlayoffsProps {
  onBack: () => void;
}

export default function Playoffs({ onBack }: PlayoffsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [quarterFinals, setQuarterFinals] = useState<Matchup[]>([]);
  const bracketRef = useRef<View>(null);

  useEffect(() => {
    generateBracket();
  }, []);

  const generateBracket = async () => {
    try {
      const allTeams = await database.get<Team>('teams').query().fetch();
      const finishedGames = await database.get<Game>('games').query(Q.where('status', 'finished')).fetch();

      // 1. Calculate Standings
      const teamStats: Record<string, { name: string; w: number }> = {};
      allTeams.forEach(t => teamStats[t.id] = { name: t.name, w: 0 });

      finishedGames.forEach(g => {
        if (g.winnerId && teamStats[g.winnerId]) {
          teamStats[g.winnerId].w += 1;
        }
      });

      const standings: TeamSeed[] = Object.entries(teamStats).map(([id, stats]) => ({
        id, name: stats.name, seed: 0, w: stats.w
      }));

      // Sort by Wins descending
      standings.sort((a, b) => b.w - a.w);
      
      // Assign Seeds to the Top 8
      const top8 = standings.slice(0, 8).map((t, index) => ({ ...t, seed: index + 1 }));

      // 2. Map Classic 8-Team Bracket (1v8, 4v5, 3v6, 2v7)
      if (top8.length === 8) {
        setQuarterFinals([
          { teamA: top8[0], teamB: top8[7] }, // 1 vs 8
          { teamA: top8[3], teamB: top8[4] }, // 4 vs 5
          { teamA: top8[2], teamB: top8[5] }, // 3 vs 6
          { teamA: top8[1], teamB: top8[6] }, // 2 vs 7
        ]);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to generate bracket:", error);
      setIsLoading(false);
    }
  };

  const MatchCard = ({ match, label }: { match?: Matchup, label?: string }) => (
    <View style={styles.matchCardWrapper}>
      {label && <Text style={styles.matchLabel}>{label}</Text>}
      <View style={styles.matchCard}>
        <View style={[styles.teamRow, { borderBottomWidth: 1, borderColor: '#333' }]}>
          <Text style={styles.seedText}>{match?.teamA ? `#${match.teamA.seed}` : '-'}</Text>
          <Text style={styles.teamName} numberOfLines={1}>{match?.teamA ? match.teamA.name.toUpperCase() : 'TBD'}</Text>
        </View>
        <View style={styles.teamRow}>
          <Text style={styles.seedText}>{match?.teamB ? `#${match.teamB.seed}` : '-'}</Text>
          <Text style={styles.teamName} numberOfLines={1}>{match?.teamB ? match.teamB.name.toUpperCase() : 'TBD'}</Text>
        </View>
      </View>
    </View>
  );

  const handleShare = async () => {
    try {
      const uri = await captureRef(bracketRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: 'Share Playoff Bracket' });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (error) {
      console.error('Bracket snapshot failed', error);
      Alert.alert('Error', 'Could not generate screenshot.');
    }
  };

  if (isLoading) return <View style={styles.container}><Text style={styles.loadingText}>Generating Bracket...</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>BACK</Text></TouchableOpacity>
        <Text style={styles.title}>PLAYOFFS BRACKET</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}><Text style={styles.shareBtnText}>SHARE</Text></TouchableOpacity>
      </View>

      {quarterFinals.length < 4 ? (
        <View ref={bracketRef} style={styles.emptyState} collapsable={false}>
          <Text style={styles.screenshotTitle}>LIGATRACKER PLAYOFFS</Text>
          <Text style={styles.emptyText}>Not enough teams to generate an 8-team bracket.</Text>
          <Text style={styles.emptySubText}>Use the Dev Seed button in Team Manager to populate the league.</Text>
        </View>
      ) : (
        // 1. FIXED: Wrapped in a Vertical ScrollView so you can scroll up and down
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
          <View ref={bracketRef} style={styles.shareCaptureArea} collapsable={false}>
            <Text style={styles.screenshotTitle}>LIGATRACKER PLAYOFFS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={styles.bracketContainer}>
            
            {/* COLUMN 1: QUARTERFINALS */}
            <View style={styles.bracketColumn}>
              <Text style={styles.columnTitle}>QUARTERFINALS</Text>
              <View style={styles.columnMatches}>
                <MatchCard match={quarterFinals[0]} />
                <MatchCard match={quarterFinals[1]} />
                <MatchCard match={quarterFinals[2]} />
                <MatchCard match={quarterFinals[3]} />
              </View>
            </View>

            {/* CONNECTING LINES 1 */}
            <View style={styles.linesColumn}>
              <View style={[styles.lineShape, { height: '30%', top: '15%' }]} />
              <View style={[styles.lineShape, { height: '30%', bottom: '15%' }]} />
            </View>

            {/* COLUMN 2: SEMIFINALS */}
            <View style={styles.bracketColumn}>
              <Text style={styles.columnTitle}>SEMIFINALS</Text>
              <View style={[styles.columnMatches, { justifyContent: 'space-around' }]}>
                <MatchCard label="Winner of QF 1 & 2" />
                <MatchCard label="Winner of QF 3 & 4" />
              </View>
            </View>

            {/* CONNECTING LINES 2 */}
            <View style={styles.linesColumn}>
              <View style={[styles.lineShape, { height: '50%', top: '25%' }]} />
            </View>

            {/* COLUMN 3: FINALS */}
            <View style={styles.bracketColumn}>
              <Text style={[styles.columnTitle, { color: '#FFE81F' }]}>THE FINALS</Text>
              <View style={[styles.columnMatches, { justifyContent: 'center' }]}>
                <MatchCard label="Championship Match" />
              </View>
            </View>

            </ScrollView>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  loadingText: { color: '#fff', textAlign: 'center', marginTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a' },
  backBtn: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5, width: 80, alignItems: 'center' },
  backBtnText: { color: '#fff', fontWeight: 'bold' },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', letterSpacing: 2 },
  shareBtn: { backgroundColor: '#8a2be2', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5, width: 80, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  screenshotTitle: { color: '#888', fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 12, fontSize: 16 },
  
  
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  shareCaptureArea: { backgroundColor: '#111', padding: 10 },
  emptyText: { color: '#ff4444', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  emptySubText: { color: '#888' },

  // 2. FIXED: Switched flex:1 to minHeight so the content can stretch correctly inside the ScrollViews
  bracketContainer: { padding: 20, flexDirection: 'row', minHeight: 380 },
  bracketColumn: { width: 220, marginRight: 0 },
  columnTitle: { color: '#888', fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 15 },
  columnMatches: { flex: 1, justifyContent: 'space-between' },
  
  // 3. FIXED: Reduced vertical padding so cards take up less space
  matchCardWrapper: { marginBottom: 8 },
  matchLabel: { color: '#555', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2, textAlign: 'center' },
  matchCard: { backgroundColor: '#222', borderRadius: 8, borderWidth: 1, borderColor: '#444', overflow: 'hidden' },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#1a1a1a' },
  seedText: { color: '#888', fontSize: 10, fontWeight: '900', width: 25 },
  teamName: { color: '#fff', fontSize: 14, fontWeight: 'bold', flex: 1 },

  linesColumn: { width: 40, position: 'relative' },
  lineShape: { position: 'absolute', width: '100%', borderRightWidth: 2, borderTopWidth: 2, borderBottomWidth: 2, borderColor: '#444', borderTopRightRadius: 8, borderBottomRightRadius: 8, left: -20 },
});
