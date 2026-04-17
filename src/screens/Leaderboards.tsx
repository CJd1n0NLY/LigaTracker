import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { database } from '../db';
import Game from '../db/models/Game';
import Team from '../db/models/Team';
import Player from '../db/models/Player';
import GameEvent from '../db/models/GameEvent';

interface TeamStanding {
  id: string;
  name: string;
  w: number;
  l: number;
  pct: string;
}

interface PlayerRanking {
  id: string;
  name: string;
  teamName: string;
  gamesPlayed: number;
  ptsPerGame: string;
  rebPerGame: string;
  astPerGame: string;
  totalPts: number;
}

interface LeaderboardsProps {
  onBack: () => void;
}

const MVP_RACE_LIMIT = 15;

export default function Leaderboards({ onBack }: LeaderboardsProps) {
  const [activeTab, setActiveTab] = useState<'standings' | 'mvp'>('standings');
  const [isLoading, setIsLoading] = useState(true);
  
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [mvpRace, setMvpRace] = useState<PlayerRanking[]>([]);

  // --- PHASE 17: SHARE REF ---
  const leaderboardRef = useRef<View>(null);

  useEffect(() => {
    const fetchLeaderboards = async () => {
      try {
        const allTeams = await database.get<Team>('teams').query().fetch();
        const allPlayers = await database.get<Player>('players').query().fetch();
        const finishedGames = await database.get<Game>('games').query(Q.where('status', 'finished')).fetch();
        const allEvents = await database.get<GameEvent>('game_events').query().fetch();

        const finishedGameIds = finishedGames.map(g => g.id);

        const teamStats: Record<string, { name: string; w: number; l: number }> = {};
        allTeams.forEach(t => teamStats[t.id] = { name: t.name, w: 0, l: 0 });

        finishedGames.forEach(g => {
          if (g.winnerId && teamStats[g.winnerId]) {
            teamStats[g.winnerId].w += 1;
            const loserId = g.teamAId === g.winnerId ? g.teamBId : g.teamAId;
            if (teamStats[loserId]) teamStats[loserId].l += 1;
          }
        });

        const compiledStandings: TeamStanding[] = Object.entries(teamStats).map(([id, stats]) => {
          const totalGames = stats.w + stats.l;
          const pct = totalGames === 0 ? "0.000" : (stats.w / totalGames).toFixed(3);
          return { id, name: stats.name, w: stats.w, l: stats.l, pct };
        });

        compiledStandings.sort((a, b) => b.w - a.w || a.l - b.l);
        setStandings(compiledStandings);

        const validEvents = allEvents.filter(e => finishedGameIds.includes(e.gameId));
        const playerTally: Record<string, { pts: number; reb: number; ast: number; teamId: string }> = {};

        validEvents.forEach(e => {
          if (!playerTally[e.playerId]) {
            playerTally[e.playerId] = { pts: 0, reb: 0, ast: 0, teamId: e.teamId };
          }
          if (e.eventType === 'Point') playerTally[e.playerId].pts += e.value;
          if (e.eventType === 'Rebound') playerTally[e.playerId].reb += e.value;
          if (e.eventType === 'Assist') playerTally[e.playerId].ast += e.value;
        });

        const compiledMvp: PlayerRanking[] = Object.entries(playerTally).map(([playerId, stats]) => {
          const player = allPlayers.find(p => p.id === playerId);
          const teamGamesPlayed = teamStats[stats.teamId]?.w + teamStats[stats.teamId]?.l || 1; 
          
          return {
            id: playerId,
            name: player?.name || 'Unknown',
            teamName: teamStats[stats.teamId]?.name || 'Unknown Team',
            gamesPlayed: teamGamesPlayed,
            totalPts: stats.pts,
            ptsPerGame: (stats.pts / teamGamesPlayed).toFixed(1),
            rebPerGame: (stats.reb / teamGamesPlayed).toFixed(1),
            astPerGame: (stats.ast / teamGamesPlayed).toFixed(1),
          };
        });

        compiledMvp.sort((a, b) => parseFloat(b.ptsPerGame) - parseFloat(a.ptsPerGame));
        setMvpRace(compiledMvp.filter(p => p.gamesPlayed > 0).slice(0, MVP_RACE_LIMIT));

        setIsLoading(false);
      } catch (error) {
        console.error("Failed to generate leaderboards:", error);
      }
    };
    
    fetchLeaderboards();
  }, []);

  // --- PHASE 17: SHARE FUNCTION ---
  const handleShare = async () => {
    try {
      const uri = await captureRef(leaderboardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: 'Share Leaderboard' });
      } else {
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Snapshot failed", error);
      Alert.alert("Error", "Could not generate screenshot.");
    }
  };

  if (isLoading) return <View style={styles.container}><Text style={styles.loadingText}>Calculating Leaderboards...</Text></View>;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>BACK</Text>
        </TouchableOpacity>
        
        {/* TABS */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'standings' && styles.activeTabBtn]} 
            onPress={() => setActiveTab('standings')}
          >
            <Text style={[styles.tabText, activeTab === 'standings' && styles.activeTabText]}>TEAM STANDINGS</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'mvp' && styles.activeTabBtn]} 
            onPress={() => setActiveTab('mvp')}
          >
            <Text style={[styles.tabText, activeTab === 'mvp' && styles.activeTabText]}>MVP RACE</Text>
          </TouchableOpacity>
        </View>

        {/* SHARE BUTTON */}
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>SHARE</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentContainer}>
        {/* We attach the ref to a View that contains the active table so the screenshot looks clean */}
        <View ref={leaderboardRef} style={{ backgroundColor: '#111', padding: 5 }} collapsable={false}>
          
          {/* Header to show in the screenshot so people know what they are looking at */}
          <Text style={styles.screenshotTitle}>LIGATRACKER {activeTab === 'standings' ? 'STANDINGS' : 'MVP RACE'}</Text>

          {/* VIEW A: STANDINGS */}
          {activeTab === 'standings' && (
            <View style={styles.tableBox}>
              <View style={styles.tableHead}>
                <Text style={[styles.cellText, styles.headerCellText, {flex: 0.5}]}>RK</Text>
                <Text style={[styles.cellText, styles.headerCellText, {flex: 3, textAlign: 'left'}]}>TEAM</Text>
                <Text style={[styles.cellText, styles.headerCellText]}>W</Text>
                <Text style={[styles.cellText, styles.headerCellText]}>L</Text>
                <Text style={[styles.cellText, styles.headerCellText]}>PCT</Text>
              </View>
              {standings.map((team, index) => (
                <View key={team.id} style={styles.tableRow}>
                  <Text style={[styles.cellText, styles.rankText, {flex: 0.5}]}>{index + 1}</Text>
                  <Text style={[styles.cellText, styles.nameText, {flex: 3, textAlign: 'left'}]} numberOfLines={1}>{team.name.toUpperCase()}</Text>
                  <Text style={[styles.cellText, styles.boldCell, {color: '#00cc66'}]}>{team.w}</Text>
                  <Text style={[styles.cellText, styles.boldCell, {color: '#ff4444'}]}>{team.l}</Text>
                  <Text style={[styles.cellText, styles.boldCell]}>{team.pct}</Text>
                </View>
              ))}
            </View>
          )}

          {/* VIEW B: MVP RACE */}
          {activeTab === 'mvp' && (
            <View style={styles.tableBox}>
               <View style={styles.tableHead}>
                <Text style={[styles.cellText, styles.headerCellText, {flex: 0.5}]}>RK</Text>
                <Text style={[styles.cellText, styles.headerCellText, {flex: 3, textAlign: 'left'}]}>PLAYER</Text>
                <Text style={[styles.cellText, styles.headerCellText]}>GP</Text>
                <Text style={[styles.cellText, styles.headerCellText, {color: '#FFE81F'}]}>PPG</Text>
                <Text style={[styles.cellText, styles.headerCellText]}>RPG</Text>
                <Text style={[styles.cellText, styles.headerCellText]}>APG</Text>
              </View>
              {mvpRace.map((player, index) => (
                <View key={player.id} style={styles.tableRow}>
                   <Text style={[styles.cellText, styles.rankText, {flex: 0.5}]}>{index + 1}</Text>
                   <View style={{flex: 3, justifyContent: 'center'}}>
                      <Text style={[styles.cellText, styles.nameText, {textAlign: 'left'}]} numberOfLines={1}>{player.name}</Text>
                      <Text style={[styles.cellText, styles.subNameText, {textAlign: 'left'}]} numberOfLines={1}>{player.teamName}</Text>
                   </View>
                   <Text style={[styles.cellText]}>{player.gamesPlayed}</Text>
                   <Text style={[styles.cellText, styles.boldCell, {color: '#FFE81F', fontSize: 16}]}>{player.ptsPerGame}</Text>
                   <Text style={[styles.cellText, styles.boldCell]}>{player.rebPerGame}</Text>
                   <Text style={[styles.cellText, styles.boldCell]}>{player.astPerGame}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  loadingText: { color: '#fff', textAlign: 'center', marginTop: 50 },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a' },
  backBtn: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5, width: 80, alignItems: 'center' },
  backBtnText: { color: '#fff', fontWeight: 'bold' },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 8, padding: 4, borderWidth: 1, borderColor: '#333' },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 6 },
  activeTabBtn: { backgroundColor: '#333' },
  tabText: { color: '#666', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  activeTabText: { color: '#fff' },

  // Phase 17 Share Button
  shareBtn: { backgroundColor: '#8a2be2', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5, width: 80, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  screenshotTitle: { color: '#888', fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginBottom: 10, fontSize: 16 },

  contentContainer: { padding: 20 },
  
  tableBox: { backgroundColor: '#1a1a1a', borderRadius: 10, borderWidth: 1, borderColor: '#333', overflow: 'hidden' },
  tableHead: { flexDirection: 'row', backgroundColor: '#0d0d0d', paddingVertical: 12, borderBottomWidth: 2, borderColor: '#333', paddingHorizontal: 10 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#222', paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  
  cellText: { flex: 1, color: '#ccc', textAlign: 'center', fontSize: 14 },
  headerCellText: { color: '#888', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  rankText: { color: '#555', fontWeight: 'bold' },
  nameText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  subNameText: { color: '#888', fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  boldCell: { fontWeight: '900' },
});
