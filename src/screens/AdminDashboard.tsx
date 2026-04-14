import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';

// 1. IMPORT WATERMELONDB TOOLS & MODELS (Added GameEvent)
import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import Game from '../db/models/Game';
import Team from '../db/models/Team';
import Player from '../db/models/Player';
import GameEvent from '../db/models/GameEvent'; // NEW

interface ActivePlayer {
  id: string;
  jersey: string;
  name: string;
  pts: number;
  fls: number;
}

interface AdminDashboardProps {
  gameId: string | null;
}

export default function AdminDashboard({ gameId }: AdminDashboardProps) {
  const [isLoading, setIsLoading] = useState(true);
  
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  
  // NEW: State for live team scores
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const [playersA, setPlayersA] = useState<ActivePlayer[]>([]);
  const [playersB, setPlayersB] = useState<ActivePlayer[]>([]);

  const [gameTime, setGameTime] = useState(600);
  const [shotClock, setShotClock] = useState(24);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const gameIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- RECALCULATE ALL STATS FROM DATABASE ---
  // This function reads every event for this game and tallies the scores
  const refreshStats = async (tAId: string, tBId: string, currentPlayersA: ActivePlayer[], currentPlayersB: ActivePlayer[]) => {
    if (!gameId) return;

    try {
      // Fetch all recorded events for this specific game
      const events = await database.get<GameEvent>('game_events').query(
        Q.where('game_id', gameId)
      ).fetch();

      let currentScoreA = 0;
      let currentScoreB = 0;
      
      // Dictionary to track individual player stats
      const playerStats: Record<string, { pts: number; fls: number }> = {};

      events.forEach(event => {
        // Initialize the player in our dictionary if they aren't there yet
        if (!playerStats[event.playerId]) {
          playerStats[event.playerId] = { pts: 0, fls: 0 };
        }

        // Tally Points
        if (event.eventType === 'Point') {
          playerStats[event.playerId].pts += event.value;
          if (event.teamId === tAId) currentScoreA += event.value;
          if (event.teamId === tBId) currentScoreB += event.value;
        } 
        // Tally Fouls
        else if (event.eventType === 'Foul') {
          playerStats[event.playerId].fls += event.value;
        }
      });

      // Update the big scoreboard
      setScoreA(currentScoreA);
      setScoreB(currentScoreB);

      // Map the tallied stats back onto our UI players
      setPlayersA(currentPlayersA.map(p => ({
        ...p,
        pts: playerStats[p.id]?.pts || 0,
        fls: playerStats[p.id]?.fls || 0
      })));
      
      setPlayersB(currentPlayersB.map(p => ({
        ...p,
        pts: playerStats[p.id]?.pts || 0,
        fls: playerStats[p.id]?.fls || 0
      })));

    } catch (error) {
      console.error("Failed to refresh stats:", error);
    }
  };

  // --- INITIAL DATA LOAD ---
  useEffect(() => {
    const loadGameData = async () => {
      if (!gameId) return;

      try {
        const game = await database.get<Game>('games').find(gameId);
        const tA = await database.get<Team>('teams').find(game.teamAId);
        const tB = await database.get<Team>('teams').find(game.teamBId);
        setTeamA(tA);
        setTeamB(tB);

        const dbPlayersA = await database.get<Player>('players').query(Q.where('team_id', tA.id)).fetch();
        const dbPlayersB = await database.get<Player>('players').query(Q.where('team_id', tB.id)).fetch();

        const basePlayersA = dbPlayersA.map(p => ({ id: p.id, jersey: p.jerseyNumber, name: p.name, pts: 0, fls: 0 }));
        const basePlayersB = dbPlayersB.map(p => ({ id: p.id, jersey: p.jerseyNumber, name: p.name, pts: 0, fls: 0 }));

        // Load the initial data, then immediately run the stat tally
        setPlayersA(basePlayersA);
        setPlayersB(basePlayersB);
        await refreshStats(tA.id, tB.id, basePlayersA, basePlayersB);

        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load game data:", error);
      }
    };
    loadGameData();
  }, [gameId]);

  // --- CLOCK ENGINE ---
  useEffect(() => {
    if (isClockRunning) {
      gameIntervalRef.current = setInterval(() => {
        setGameTime((prev) => (prev <= 0 ? 0 : prev - 1));
        setShotClock((prev) => (prev <= 0 ? 0 : prev - 1));
      }, 1000);
    } else {
      if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
    }
    return () => { if (gameIntervalRef.current) clearInterval(gameIntervalRef.current); };
  }, [isClockRunning]);

  const toggleClock = () => setIsClockRunning(!isClockRunning);
  const resetShotClock24 = () => setShotClock(24);
  const resetShotClock14 = () => setShotClock(14);
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // --- THE NEW DATABASE LOGGING FUNCTION ---
  const handleLogStat = async (statName: string, value: number) => {
    if (!selectedPlayer) {
      Alert.alert("Action Required", "Please select a player first!");
      return;
    }
    if (!teamA || !teamB || !gameId) return;

    // Figure out which team the selected player belongs to
    const isTeamA = playersA.some(p => p.id === selectedPlayer);
    const playerTeamId = isTeamA ? teamA.id : teamB.id;

    try {
      // 1. Write the event to the database securely
      await database.write(async () => {
        await database.get<GameEvent>('game_events').create(event => {
          event.gameId = gameId;
          event.playerId = selectedPlayer;
          event.teamId = playerTeamId;
          event.eventType = statName;
          event.value = value;
          event.timestampMs = Date.now();
        });
      });

      // 2. Clear the selection
      setSelectedPlayer(null);

      // 3. Recalculate everything to update the UI
      await refreshStats(teamA.id, teamB.id, playersA, playersB);

    } catch (error) {
      console.error("Failed to log stat:", error);
      Alert.alert("Error", "Could not save the stat.");
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#fff', fontSize: 20 }}>Loading Game Data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.scoreBox}>
          <Text style={styles.teamName}>{teamA?.name.toUpperCase()}</Text>
          {/* Linked to real State */}
          <Text style={styles.scoreText}>{scoreA}</Text> 
        </View>

        <View style={styles.centerClockContainer}>
          <TouchableOpacity onPress={toggleClock} style={styles.gameClockBtn}>
            <Text style={[styles.gameClockText, !isClockRunning && styles.pausedText]}>{formatTime(gameTime)}</Text>
            <Text style={styles.subText}>{isClockRunning ? "TAP TO PAUSE" : "TAP TO START"}</Text>
          </TouchableOpacity>
          <View style={styles.shotClockWrapper}>
            <Text style={styles.shotClockText}>{shotClock}</Text>
            <View style={styles.shotClockControls}>
              <TouchableOpacity onPress={resetShotClock24} style={styles.resetBtn}><Text style={styles.resetBtnText}>24</Text></TouchableOpacity>
              <TouchableOpacity onPress={resetShotClock14} style={styles.resetBtn}><Text style={styles.resetBtnText}>14</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.scoreBox}>
          <Text style={styles.teamName}>{teamB?.name.toUpperCase()}</Text>
          {/* Linked to real State */}
          <Text style={styles.scoreText}>{scoreB}</Text>
        </View>
      </View>

      {/* COURT AREA */}
      <View style={styles.courtArea}>
        {/* TEAM A FLANK */}
        <View style={styles.teamFlank}>
          {playersA.map((player) => (
            <TouchableOpacity 
              key={player.id} 
              style={[styles.playerRow, selectedPlayer === player.id && styles.selectedPlayerA]}
              onPress={() => setSelectedPlayer(player.id)}
            >
              <Text style={styles.jerseyText}>#{player.jersey}</Text>
              <Text style={styles.playerName}>{player.name}</Text>
              <View style={styles.playerStats}>
                <Text style={styles.statMiniText}>{player.pts} pts</Text>
                <Text style={[styles.statMiniText, player.fls >= 4 && styles.foulWarning]}>{player.fls} fls</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* ACTION BAR */}
        <View style={styles.actionBar}>
          <Text style={styles.actionHeader}>RECORD STAT</Text>
          <View style={styles.statGrid}>
            <TouchableOpacity style={styles.statBtn} onPress={() => handleLogStat('Point', 1)}><Text style={styles.statBtnText}>+1 PT</Text></TouchableOpacity>
            <TouchableOpacity style={styles.statBtn} onPress={() => handleLogStat('Point', 2)}><Text style={styles.statBtnText}>+2 PTS</Text></TouchableOpacity>
            <TouchableOpacity style={styles.statBtn} onPress={() => handleLogStat('Point', 3)}><Text style={styles.statBtnText}>+3 PTS</Text></TouchableOpacity>
            <TouchableOpacity style={styles.statBtnOutline} onPress={() => handleLogStat('Rebound', 1)}><Text style={styles.statBtnOutlineText}>REB</Text></TouchableOpacity>
            <TouchableOpacity style={styles.statBtnOutline} onPress={() => handleLogStat('Assist', 1)}><Text style={styles.statBtnOutlineText}>AST</Text></TouchableOpacity>
            <TouchableOpacity style={styles.statBtnOutline} onPress={() => handleLogStat('Steal', 1)}><Text style={styles.statBtnOutlineText}>STL</Text></TouchableOpacity>
            <TouchableOpacity style={styles.statBtnOutline} onPress={() => handleLogStat('Block', 1)}><Text style={styles.statBtnOutlineText}>BLK</Text></TouchableOpacity>
            <TouchableOpacity style={styles.statBtnOutline} onPress={() => handleLogStat('Turnover', 1)}><Text style={styles.statBtnOutlineText}>TO</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.statBtnOutline, {borderColor: '#ff4444'}]} onPress={() => handleLogStat('Foul', 1)}><Text style={[styles.statBtnOutlineText, {color: '#ff4444'}]}>FOUL</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.buzzerBtn}>
            <Text style={styles.buzzerText}>SOUND BUZZER</Text>
          </TouchableOpacity>
        </View>

        {/* TEAM B FLANK */}
        <View style={styles.teamFlank}>
          {playersB.map((player) => (
            <TouchableOpacity 
              key={player.id} 
              style={[styles.playerRow, selectedPlayer === player.id && styles.selectedPlayerB]}
              onPress={() => setSelectedPlayer(player.id)}
            >
              <Text style={styles.jerseyText}>#{player.jersey}</Text>
              <Text style={styles.playerName}>{player.name}</Text>
              <View style={styles.playerStats}>
                <Text style={styles.statMiniText}>{player.pts} pts</Text>
                <Text style={[styles.statMiniText, player.fls >= 4 && styles.foulWarning]}>{player.fls} fls</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flex: 0.25, flexDirection: 'row', borderBottomWidth: 2, borderColor: '#333', padding: 5 },
  scoreBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  teamName: { color: '#aaa', fontSize: 16, fontWeight: 'bold' },
  scoreText: { color: '#fff', fontSize: 50, fontWeight: 'bold' },
  centerClockContainer: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  gameClockBtn: { alignItems: 'center', backgroundColor: '#222', padding: 5, borderRadius: 10, minWidth: 140 },
  gameClockText: { color: '#FFE81F', fontSize: 40, fontWeight: 'bold', fontFamily: 'monospace' },
  pausedText: { color: '#ff4444' },
  subText: { color: '#888', fontSize: 10, marginTop: 2 },
  shotClockWrapper: { alignItems: 'center' },
  shotClockText: { color: '#ff4444', fontSize: 40, fontWeight: 'bold', fontFamily: 'monospace' },
  shotClockControls: { flexDirection: 'row', gap: 5, marginTop: 2 },
  resetBtn: { backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 },
  resetBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  courtArea: { flex: 0.75, flexDirection: 'row' },
  
  // Flanks (Players)
  teamFlank: { flex: 1, backgroundColor: '#1a1a1a', padding: 5 },
  playerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', padding: 10, marginBottom: 5, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  selectedPlayerA: { borderColor: '#4da6ff', backgroundColor: '#1a334d' }, // Blue highlight for Team A
  selectedPlayerB: { borderColor: '#ff9933', backgroundColor: '#4d2e0f' }, // Orange highlight for Team B
  jerseyText: { color: '#aaa', fontSize: 16, fontWeight: 'bold', width: 35 },
  playerName: { color: '#fff', fontSize: 16, flex: 1 },
  playerStats: { alignItems: 'flex-end' },
  statMiniText: { color: '#888', fontSize: 12 },
  foulWarning: { color: '#ff4444', fontWeight: 'bold' },

  // Action Bar (Middle)
  actionBar: { flex: 1.2, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 5, backgroundColor: '#111' },
  actionHeader: { color: '#555', fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, width: '100%' },
  
  statBtn: { backgroundColor: '#fff', width: '30%', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  statBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  
  statBtnOutline: { backgroundColor: '#222', borderWidth: 1, borderColor: '#555', width: '30%', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  statBtnOutlineText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  buzzerBtn: { backgroundColor: '#ff4444', width: '90%', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 'auto', marginBottom: 10 },
  buzzerText: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 2 },
});