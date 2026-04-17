import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { database } from '../db';
import Game from '../db/models/Game';
import Team from '../db/models/Team';
import Player from '../db/models/Player';
import GameEvent from '../db/models/GameEvent';

interface HistoryRow {
  game: Game;
  teamA: Team;
  teamB: Team;
  scoreA: number;
  scoreB: number;
  date: string;
}

interface PlayerStatLine {
  id: string;      
  teamId: string;  
  name: string;
  jersey: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  fls: number;
}

type SortKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'to' | 'fls';

interface MatchHistoryProps {
  onBack: () => void;
}

export default function MatchHistory({ onBack }: MatchHistoryProps) {
  const [historyDocs, setHistoryDocs] = useState<HistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Box Score State
  const [selectedGame, setSelectedGame] = useState<HistoryRow | null>(null);
  const [boxScoreA, setBoxScoreA] = useState<PlayerStatLine[]>([]);
  const [boxScoreB, setBoxScoreB] = useState<PlayerStatLine[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'pts', direction: 'desc' });

  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [editPlayerId, setEditPlayerId] = useState<string | null>(null);

  // --- PHASE 17: SHARE REF ---
  const boxScoreRef = useRef<View>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const games = await database.get<Game>('games').query(Q.where('status', 'finished')).fetch();
      const sortedGames = games.sort((a, b) => b.createdAt - a.createdAt);
      const fullHistory: HistoryRow[] = [];

      for (const g of sortedGames) {
        const tA = await database.get<Team>('teams').find(g.teamAId);
        const tB = await database.get<Team>('teams').find(g.teamBId);
        
        const events = await database.get<GameEvent>('game_events').query(
          Q.where('game_id', g.id), 
          Q.where('event_type', 'Point')
        ).fetch();
        
        let sA = 0; let sB = 0;
        events.forEach(e => {
          if (e.teamId === tA.id) sA += e.value;
          if (e.teamId === tB.id) sB += e.value;
        });

        fullHistory.push({
          game: g, teamA: tA, teamB: tB, scoreA: sA, scoreB: sB, date: new Date(g.createdAt).toLocaleDateString(),
        });
      }
      setHistoryDocs(fullHistory);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const reloadBoxScoreData = async (gameRow: HistoryRow) => {
    const events = await database.get<GameEvent>('game_events').query(Q.where('game_id', gameRow.game.id)).fetch();
    const playersA = await database.get<Player>('players').query(Q.where('team_id', gameRow.teamA.id)).fetch();
    const playersB = await database.get<Player>('players').query(Q.where('team_id', gameRow.teamB.id)).fetch();

    const statsA: Record<string, PlayerStatLine> = {};
    const statsB: Record<string, PlayerStatLine> = {};

    playersA.forEach(p => statsA[p.id] = { id: p.id, teamId: p.team.id, name: p.name, jersey: p.jerseyNumber, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fls: 0 });
    playersB.forEach(p => statsB[p.id] = { id: p.id, teamId: p.team.id, name: p.name, jersey: p.jerseyNumber, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fls: 0 });

    events.forEach(e => {
      const isTeamA = statsA[e.playerId] !== undefined;
      const target = isTeamA ? statsA[e.playerId] : statsB[e.playerId];
      if (!target) return;

      if (e.eventType === 'Point') target.pts += e.value;
      else if (e.eventType === 'Rebound') target.reb += e.value;
      else if (e.eventType === 'Assist') target.ast += e.value;
      else if (e.eventType === 'Steal') target.stl += e.value;
      else if (e.eventType === 'Block') target.blk += e.value;
      else if (e.eventType === 'Turnover') target.to += e.value;
      else if (e.eventType === 'Foul') target.fls += e.value;
    });

    setBoxScoreA(Object.values(statsA));
    setBoxScoreB(Object.values(statsB));
  };

  const openBoxScore = async (row: HistoryRow) => {
    try {
      await reloadBoxScoreData(row);
      setSortConfig({ key: 'pts', direction: 'desc' });
      setIsEditMode(false);
      setSelectedGame(row);
    } catch (error) { console.error("Failed to generate box score:", error); }
  };

  const handleAdjustStat = async (eventType: string, amount: number) => {
    if (!selectedGame || !editPlayerId) return;

    const activeEditPlayer = boxScoreA.find(p => p.id === editPlayerId) || boxScoreB.find(p => p.id === editPlayerId);
    if (!activeEditPlayer) return;

    if (amount < 0) {
      let currentVal = 0;
      if (eventType === 'Point') currentVal = activeEditPlayer.pts;
      else if (eventType === 'Rebound') currentVal = activeEditPlayer.reb;
      else if (eventType === 'Assist') currentVal = activeEditPlayer.ast;
      else if (eventType === 'Steal') currentVal = activeEditPlayer.stl;
      else if (eventType === 'Block') currentVal = activeEditPlayer.blk;
      else if (eventType === 'Turnover') currentVal = activeEditPlayer.to;
      else if (eventType === 'Foul') currentVal = activeEditPlayer.fls;
      
      if (currentVal <= 0) return; 
    }

    try {
      await database.write(async () => {
        await database.get<GameEvent>('game_events').create(event => {
          event.gameId = selectedGame.game.id;
          event.playerId = editPlayerId;
          event.teamId = activeEditPlayer.teamId;
          event.eventType = eventType;
          event.value = amount;
          event.timestampMs = Date.now();
        });
      });

      await reloadBoxScoreData(selectedGame);
      fetchHistory();

    } catch (error) {
      console.error("Failed to inject correction:", error);
      Alert.alert("Error", "Could not save edit.");
    }
  };

  // --- PHASE 17: SHARE FUNCTION ---
  const handleShare = async () => {
    try {
      const uri = await captureRef(boxScoreRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: 'Share Box Score' });
      } else {
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Snapshot failed", error);
      Alert.alert("Error", "Could not generate screenshot.");
    }
  };

  const handleSort = (key: SortKey) => { setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' })); };
  const getSortedData = (data: PlayerStatLine[]) => {
    return [...data].sort((a, b) => {
      const valA = a[sortConfig.key]; const valB = b[sortConfig.key];
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const SortHeader = ({ label, sortKey }: { label: string, sortKey: SortKey }) => (
    <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => handleSort(sortKey)}>
      <Text style={[styles.headerCellText, sortConfig.key === sortKey && styles.activeSortText]}>
        {label} {sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
      </Text>
    </TouchableOpacity>
  );

  const renderBoxScoreTable = (teamName: string, players: PlayerStatLine[], teamScore: number) => {
    const sortedPlayers = getSortedData(players);

    return (
      <View style={[styles.tableContainer, isEditMode && {borderColor: '#ff9933', borderWidth: 2}]}>
        <Text style={[styles.tableHeader, isEditMode && {backgroundColor: '#ff9933', color: '#000'}]}>{teamName.toUpperCase()} - {teamScore} PTS</Text>
        <View style={styles.tableHead}>
          <Text style={[styles.cellText, {flex: 2, textAlign: 'left', paddingLeft: 10, color: '#888'}]}>PLAYER</Text>
          <SortHeader label="PTS" sortKey="pts" />
          <SortHeader label="REB" sortKey="reb" />
          <SortHeader label="AST" sortKey="ast" />
          <SortHeader label="STL" sortKey="stl" />
          <SortHeader label="BLK" sortKey="blk" />
          <SortHeader label="TO" sortKey="to" />
          <SortHeader label="FLS" sortKey="fls" />
        </View>
        {sortedPlayers.map((p, i) => (
          <TouchableOpacity 
            key={i} 
            style={[styles.tableRow, isEditMode && {backgroundColor: '#1a140d'}]} 
            disabled={!isEditMode}
            onPress={() => setEditPlayerId(p.id)}
          >
            <Text style={[styles.cellText, styles.playerName, {flex: 2}]} numberOfLines={1}>#{p.jersey} {p.name}</Text>
            <Text style={[styles.cellText, sortConfig.key === 'pts' && styles.boldCell]}>{p.pts}</Text>
            <Text style={[styles.cellText, sortConfig.key === 'reb' && styles.boldCell]}>{p.reb}</Text>
            <Text style={[styles.cellText, sortConfig.key === 'ast' && styles.boldCell]}>{p.ast}</Text>
            <Text style={[styles.cellText, sortConfig.key === 'stl' && styles.boldCell]}>{p.stl}</Text>
            <Text style={[styles.cellText, sortConfig.key === 'blk' && styles.boldCell]}>{p.blk}</Text>
            <Text style={[styles.cellText, sortConfig.key === 'to' && styles.boldCell]}>{p.to}</Text>
            <Text style={[styles.cellText, p.fls >= 4 && styles.foulWarning, sortConfig.key === 'fls' && styles.boldCell]}>{p.fls}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const activeEditPlayer = editPlayerId ? (boxScoreA.find(p => p.id === editPlayerId) || boxScoreB.find(p => p.id === editPlayerId)) : null;

  const StatAdjuster = ({ label, value, eventType }: { label: string, value: number, eventType: string }) => (
    <View style={styles.adjRow}>
      <Text style={styles.adjLabel}>{label}</Text>
      <TouchableOpacity style={styles.adjBtnSub} onPress={() => handleAdjustStat(eventType, -1)}><Text style={styles.adjBtnText}>-</Text></TouchableOpacity>
      <Text style={styles.adjValue}>{value}</Text>
      <TouchableOpacity style={styles.adjBtnAdd} onPress={() => handleAdjustStat(eventType, 1)}><Text style={styles.adjBtnText}>+</Text></TouchableOpacity>
    </View>
  );

  if (isLoading) return <View style={styles.container}><Text style={styles.loadingText}>Loading History...</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>← BACK</Text></TouchableOpacity>
        <Text style={styles.title}>MATCH HISTORY</Text>
        <View style={{width: 60}} /> 
      </View>

      <ScrollView style={styles.listContainer}>
        {historyDocs.length === 0 ? (
          <Text style={styles.emptyText}>No finished games found.</Text>
        ) : (
          historyDocs.map((row) => {
            const teamAWon = row.game.winnerId === row.teamA.id;
            const teamBWon = row.game.winnerId === row.teamB.id;

            return (
              <TouchableOpacity key={row.game.id} style={styles.historyCard} onPress={() => openBoxScore(row)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.dateText}>{row.date}</Text>
                  <Text style={styles.winnerText}>Final</Text>
                </View>
                
                <View style={styles.matchupRow}>
                  <View style={styles.teamCol}>
                    <Text style={[styles.teamText, teamAWon && styles.winnerBold]}>{row.teamA.name.toUpperCase()}</Text>
                    <View style={styles.scoreRow}>
                      <Text style={[styles.wlBadge, teamAWon ? styles.winBadge : styles.loseBadge]}>{teamAWon ? 'WIN' : 'LOSE'}</Text>
                      <Text style={[styles.bigScore, teamAWon && styles.winnerBold]}>{row.scoreA}</Text>
                    </View>
                  </View>
                  <Text style={styles.vsText}>VS</Text>
                  <View style={styles.teamCol}>
                    <Text style={[styles.teamText, teamBWon && styles.winnerBold]}>{row.teamB.name.toUpperCase()}</Text>
                    <View style={styles.scoreRow}>
                      <Text style={[styles.bigScore, teamBWon && styles.winnerBold]}>{row.scoreB}</Text>
                      <Text style={[styles.wlBadge, teamBWon ? styles.winBadge : styles.loseBadge]}>{teamBWon ? 'WIN' : 'LOSE'}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.viewStatsText}>Tap to view Box Score →</Text>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* BOX SCORE MODAL */}
      <Modal visible={selectedGame !== null} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedGame(null)}>
              <Text style={styles.closeBtnText}>CLOSE</Text>
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>{isEditMode ? "EDITING BOX SCORE" : "OFFICIAL BOX SCORE"}</Text>
            
            <View style={{flexDirection: 'row', gap: 10}}>
              {/* NEW SHARE BUTTON */}
              {!isEditMode && (
                <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                  <Text style={styles.shareBtnText}>📸 SHARE</Text>
                </TouchableOpacity>
              )}
              {/* EDIT MODE TOGGLE */}
              <TouchableOpacity style={[styles.editToggleBtn, isEditMode && styles.editToggleActive]} onPress={() => setIsEditMode(!isEditMode)}>
                <Text style={[styles.editToggleText, isEditMode && {color: '#000'}]}>{isEditMode ? "DONE EDITING" : "EDIT MODE"}</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <ScrollView style={styles.modalBody}>
            {selectedGame && (
              <>
                {/* 1. Moved Edit Hint OUTSIDE the screenshot ref */}
                {isEditMode && <Text style={styles.editHintText}>Tap any player below to adjust their stats.</Text>}
                
                {/* 2. The Capture Area */}
                <View ref={boxScoreRef} style={{ backgroundColor: '#0d0d0d', padding: 15, borderRadius: 10 }} collapsable={false}>
                  
                  {/* Graphic Header */}
                  <View style={{ alignItems: 'center', marginBottom: 15 }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 2 }}>OFFICIAL BOX SCORE</Text>
                    <Text style={{ color: '#888', fontSize: 12, fontWeight: 'bold', marginTop: 2 }}>{selectedGame.date}</Text>
                  </View>

                  {(() => {
                    const liveGameRecord = historyDocs.find(h => h.game.id === selectedGame.game.id);
                    return (
                      /* 3. SIDE-BY-SIDE FLEX ROW */
                      <View style={{ flexDirection: 'row', gap: 15 }}>
                        <View style={{ flex: 1 }}>
                          {renderBoxScoreTable(selectedGame.teamA.name, boxScoreA, liveGameRecord?.scoreA || selectedGame.scoreA)}
                        </View>
                        <View style={{ flex: 1 }}>
                          {renderBoxScoreTable(selectedGame.teamB.name, boxScoreB, liveGameRecord?.scoreB || selectedGame.scoreB)}
                        </View>
                      </View>
                    );
                  })()}
                </View>
                
                <View style={{height: 40}} />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* EDIT PLAYER STATS MODAL */}
      <Modal visible={!!activeEditPlayer} transparent animationType="fade">
        <View style={styles.editOverlay}>
          <View style={styles.editBox}>
            <Text style={styles.editBoxTitle}>CORRECT PLAYER STATS</Text>
            <Text style={styles.editBoxName}>#{activeEditPlayer?.jersey} {activeEditPlayer?.name}</Text>
            
            <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
              <View style={styles.adjusterGrid}>
                <StatAdjuster label="POINTS" value={activeEditPlayer?.pts || 0} eventType="Point" />
                <StatAdjuster label="REBOUNDS" value={activeEditPlayer?.reb || 0} eventType="Rebound" />
                <StatAdjuster label="ASSISTS" value={activeEditPlayer?.ast || 0} eventType="Assist" />
                <StatAdjuster label="STEALS" value={activeEditPlayer?.stl || 0} eventType="Steal" />
                <StatAdjuster label="BLOCKS" value={activeEditPlayer?.blk || 0} eventType="Block" />
                <StatAdjuster label="TURNOVERS" value={activeEditPlayer?.to || 0} eventType="Turnover" />
                <StatAdjuster label="FOULS" value={activeEditPlayer?.fls || 0} eventType="Foul" />
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.doneEditBtn} onPress={() => setEditPlayerId(null)}>
              <Text style={styles.doneEditBtnText}>FINISH</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  loadingText: { color: '#fff', textAlign: 'center', marginTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a' },
  backBtn: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5 },
  backBtnText: { color: '#fff', fontWeight: 'bold' },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', letterSpacing: 2 },
  
  listContainer: { padding: 15 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 50 },
  
  historyCard: { backgroundColor: '#222', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  dateText: { color: '#888', fontSize: 12 },
  winnerText: { color: '#00cc66', fontSize: 12, fontWeight: 'bold' },
  matchupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamCol: { flex: 1, alignItems: 'center', gap: 5 },
  teamText: { color: '#fff', fontSize: 16, textAlign: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bigScore: { color: '#ccc', fontSize: 24, fontWeight: '900' },
  winnerBold: { color: '#FFE81F', fontWeight: '900' },
  wlBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, fontSize: 10, fontWeight: 'bold', overflow: 'hidden' },
  winBadge: { backgroundColor: '#00cc66', color: '#000' },
  loseBadge: { backgroundColor: '#ff4444', color: '#fff' },
  vsText: { color: '#555', fontSize: 14, fontWeight: 'bold', marginHorizontal: 15 },
  viewStatsText: { color: '#4da6ff', fontSize: 12, textAlign: 'right', marginTop: 15, fontWeight: 'bold' },

  modalContainer: { flex: 1, backgroundColor: '#0d0d0d' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a' },
  closeBtn: { backgroundColor: '#ff4444', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5 },
  closeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  
  // Phase 17 Share Button Update
  shareBtn: { backgroundColor: '#8a2be2', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5 },
  shareBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  editToggleBtn: { borderWidth: 1, borderColor: '#ff9933', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5 },
  editToggleActive: { backgroundColor: '#ff9933' },
  editToggleText: { color: '#ff9933', fontWeight: 'bold', fontSize: 12 },
  editHintText: { color: '#ff9933', textAlign: 'center', marginBottom: 15, fontWeight: 'bold' },

  modalBody: { padding: 15 },
  tableContainer: { backgroundColor: '#1a1a1a', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  tableHeader: { color: '#fff', fontSize: 16, fontWeight: '900', padding: 12, backgroundColor: '#222', textAlign: 'center', letterSpacing: 1 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 2, borderColor: '#333', backgroundColor: '#111', paddingVertical: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#222', paddingVertical: 8 },
  cellText: { flex: 1, color: '#ccc', textAlign: 'center', fontSize: 12 },
  headerCellText: { color: '#888', fontSize: 12, fontWeight: 'bold' },
  activeSortText: { color: '#4da6ff', fontWeight: '900' },
  playerName: { textAlign: 'left', paddingLeft: 10, color: '#fff', fontWeight: 'bold', fontSize: 12 },
  boldCell: { color: '#fff', fontWeight: '900' },
  foulWarning: { color: '#ff4444', fontWeight: 'bold' },

  editOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  editBox: { width: '60%', maxHeight: '90%', backgroundColor: '#222', borderRadius: 10, padding: 20, borderWidth: 2, borderColor: '#ff9933' },
  editBoxTitle: { color: '#ff9933', fontWeight: 'bold', fontSize: 14, textAlign: 'center', letterSpacing: 1 },
  editBoxName: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 10 }, 
  
  adjusterGrid: { gap: 8 },
  adjRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 8, overflow: 'hidden' },
  adjLabel: { flex: 1, color: '#aaa', fontWeight: 'bold', paddingLeft: 15 },
  adjBtnSub: { backgroundColor: '#ff4444', paddingHorizontal: 20, paddingVertical: 8 },
  adjBtnAdd: { backgroundColor: '#00cc66', paddingHorizontal: 20, paddingVertical: 8 },
  adjBtnText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  adjValue: { width: 50, color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },

  doneEditBtn: { backgroundColor: '#ff9933', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 }, 
  doneEditBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 1 }
});