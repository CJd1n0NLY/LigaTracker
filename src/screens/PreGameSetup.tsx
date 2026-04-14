import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';

import { database } from '../db';
import Team from '../db/models/Team';
import Player from '../db/models/Player';
import Game from '../db/models/Game';

interface TempPlayer {
  id: string;
  name: string;
  jersey: string;
}

interface PreGameSetupProps {
  onStartGame: (gameId: string) => void;
}

export default function PreGameSetup({ onStartGame }: PreGameSetupProps) {
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamAPlayers, setTeamAPlayers] = useState<TempPlayer[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<TempPlayer[]>([]);
  const [draftPlayerA, setDraftPlayerA] = useState({ name: '', jersey: '' });
  const [draftPlayerB, setDraftPlayerB] = useState({ name: '', jersey: '' });
  const [isSaving, setIsSaving] = useState(false);

  const handleDevAutoFill = () => {
    setTeamAName("Tondo Kings");
    setTeamBName("Caloocan Shooters");
    setTeamAPlayers([
      { id: 'dev_a1', jersey: '0', name: 'Postrado' },
      { id: 'dev_a2', jersey: '23', name: 'Alamil' },
      { id: 'dev_a3', jersey: '24', name: 'Quiben' },
      { id: 'dev_a4', jersey: '7', name: 'Cruz' },
      { id: 'dev_a5', jersey: '11', name: 'Reyes' },
      { id: 'dev_a6', jersey: '13', name: 'Santos' },
      { id: 'dev_a7', jersey: '99', name: 'Garcia' },
    ]);
    setTeamBPlayers([
      { id: 'dev_b1', jersey: '1', name: 'Mendoza' },
      { id: 'dev_b2', jersey: '3', name: 'Torres' },
      { id: 'dev_b3', jersey: '8', name: 'Bautista' },
      { id: 'dev_b4', jersey: '15', name: 'Villanueva' },
      { id: 'dev_b5', jersey: '33', name: 'Ramos' },
      { id: 'dev_b6', jersey: '00', name: 'Flores' },
      { id: 'dev_b7', jersey: '55', name: 'Del Rosario' },
    ]);
  };

  const addPlayerToTeamA = () => {
    if (!draftPlayerA.name || !draftPlayerA.jersey) return;
    setTeamAPlayers([...teamAPlayers, { id: Date.now().toString(), ...draftPlayerA }]);
    setDraftPlayerA({ name: '', jersey: '' });
  };

  const addPlayerToTeamB = () => {
    if (!draftPlayerB.name || !draftPlayerB.jersey) return;
    setTeamBPlayers([...teamBPlayers, { id: Date.now().toString(), ...draftPlayerB }]);
    setDraftPlayerB({ name: '', jersey: '' });
  };

  const removePlayerA = (id: string) => setTeamAPlayers(teamAPlayers.filter(p => p.id !== id));
  const removePlayerB = (id: string) => setTeamBPlayers(teamBPlayers.filter(p => p.id !== id));

  const handleStartMatch = async () => {
    if (!teamAName || !teamBName) {
      Alert.alert("Missing Info", "Please enter names for both teams.");
      return;
    }
    if (teamAPlayers.length < 5 || teamBPlayers.length < 5) {
      Alert.alert("Missing Players", "Both teams must have at least 5 players.");
      return;
    }
    setIsSaving(true);
    try {
      let newGameId = '';
      await database.write(async () => {
        const newTeamA = await database.get<Team>('teams').create(team => {
          team.name = teamAName;
          team.isEliminated = false;
        });
        const newTeamB = await database.get<Team>('teams').create(team => {
          team.name = teamBName;
          team.isEliminated = false;
        });
        for (let i = 0; i < teamAPlayers.length; i++) {
          const p = teamAPlayers[i];
          await database.get<Player>('players').create(player => {
            player.team.set(newTeamA);
            player.name = p.name;
            player.jerseyNumber = p.jersey;
            player.isActive = i < 5;
          });
        }
        for (let i = 0; i < teamBPlayers.length; i++) {
          const p = teamBPlayers[i];
          await database.get<Player>('players').create(player => {
            player.team.set(newTeamB);
            player.name = p.name;
            player.jerseyNumber = p.jersey;
            player.isActive = i < 5;
          });
        }
        const newGame = await database.get<Game>('games').create(game => {
          game.teamAId = newTeamA.id;
          game.teamBId = newTeamB.id;
          game.status = 'ongoing';
        });
        newGameId = newGame.id;
      });
      onStartGame(newGameId);
    } catch (error) {
      console.error("Database Write Error:", error);
      Alert.alert("Error", "Failed to setup the game.");
      setIsSaving(false);
    }
  };

  const renderTeamColumn = (
    side: 'A' | 'B',
    teamName: string,
    setTeamName: (v: string) => void,
    players: TempPlayer[],
    draft: { name: string; jersey: string },
    setDraft: (v: { name: string; jersey: string }) => void,
    addPlayer: () => void,
    removePlayer: (id: string) => void,
  ) => (
    <View style={[styles.teamColumn, side === 'A' && styles.teamColumnBorderRight]}>
      {/* Team Name */}
      <View style={styles.teamNameRow}>
        <View style={[styles.teamIndicator, side === 'A' ? styles.indicatorA : styles.indicatorB]} />
        <TextInput
          style={styles.teamNameInput}
          placeholder={`Team ${side} Name`}
          placeholderTextColor="#444"
          value={teamName}
          onChangeText={setTeamName}
        />
      </View>

      {/* Add Player Row */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.jerseyInput}
          placeholder="#"
          placeholderTextColor="#444"
          keyboardType="numeric"
          value={draft.jersey}
          onChangeText={(text) => setDraft({ ...draft, jersey: text })}
        />
        <TextInput
          style={styles.nameInput}
          placeholder="Last Name"
          placeholderTextColor="#444"
          value={draft.name}
          onChangeText={(text) => setDraft({ ...draft, name: text })}
        />
        <TouchableOpacity
          style={[styles.addBtn, side === 'A' ? styles.addBtnA : styles.addBtnB]}
          onPress={addPlayer}
        >
          <Text style={styles.addBtnText}>ADD</Text>
        </TouchableOpacity>
      </View>

      {/* Player Count */}
      <View style={styles.rosterMeta}>
        <Text style={styles.rosterCountText}>
          {players.length} player{players.length !== 1 ? 's' : ''}
        </Text>
        <Text style={[styles.rosterCountText, players.length >= 5 ? styles.readyText : styles.notReadyText]}>
          {players.length >= 5 ? '✓ READY' : `Need ${5 - players.length} more`}
        </Text>
      </View>

      {/* Divider between starters/bench */}
      <ScrollView style={styles.rosterList} showsVerticalScrollIndicator={false}>
        {players.map((player, index) => (
          <View key={player.id}>
            {index === 5 && (
              <View style={styles.benchDivider}>
                <View style={styles.benchDividerLine} />
                <Text style={styles.benchDividerText}>BENCH</Text>
                <View style={styles.benchDividerLine} />
              </View>
            )}
            <View style={[styles.playerRow, index >= 5 && styles.playerRowBench]}>
              <View style={[styles.jerseyTag, side === 'A' ? styles.jerseyTagA : styles.jerseyTagB]}>
                <Text style={styles.jerseyTagText}>{player.jersey}</Text>
              </View>
              <Text style={[styles.playerNameText, index >= 5 && styles.playerNameBench]}>
                {player.name}
              </Text>
              {index < 5 && (
                <View style={styles.starterDot} />
              )}
              <TouchableOpacity onPress={() => removePlayer(player.id)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const canStart = teamAName && teamBName && teamAPlayers.length >= 5 && teamBPlayers.length >= 5;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>GAME SETUP</Text>
          <Text style={styles.headerSub}>Create rosters · Min. 5 players per team</Text>
        </View>
        <TouchableOpacity style={styles.devBtn} onPress={handleDevAutoFill}>
          <Text style={styles.devBtnText}>⚡ AUTO-FILL</Text>
        </TouchableOpacity>
      </View>

      {/* Teams */}
      <View style={styles.columnsContainer}>
        {renderTeamColumn('A', teamAName, setTeamAName, teamAPlayers, draftPlayerA, setDraftPlayerA, addPlayerToTeamA, removePlayerA)}
        {renderTeamColumn('B', teamBName, setTeamBName, teamBPlayers, draftPlayerB, setDraftPlayerB, addPlayerToTeamB, removePlayerB)}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.startBtn, !canStart && styles.startBtnDisabled]}
          onPress={handleStartMatch}
          disabled={!canStart || isSaving}
        >
          <Text style={styles.startBtnText}>{isSaving ? "SAVING..." : "▶  START MATCH"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const ACCENT_A = "#4da6ff";
const ACCENT_B = "#ff9933";
const BG = "#0d0d0d";
const SURFACE = "#161616";
const BORDER = "#252525";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  headerLeft: {},
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 3,
  },
  headerSub: { color: "#555", fontSize: 11, marginTop: 2 },
  devBtn: {
    backgroundColor: "#2a2200",
    borderWidth: 1,
    borderColor: "#FFD700",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  devBtnText: { color: "#FFD700", fontWeight: "700", fontSize: 12 },

  // Columns
  columnsContainer: { flex: 1, flexDirection: "row" },
  teamColumn: { flex: 1, padding: 14 },
  teamColumnBorderRight: { borderRightWidth: 1, borderColor: BORDER },

  // Team name row
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  teamIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
  },
  indicatorA: { backgroundColor: ACCENT_A },
  indicatorB: { backgroundColor: ACCENT_B },
  teamNameInput: {
    flex: 1,
    backgroundColor: SURFACE,
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    letterSpacing: 1,
  },

  // Add row
  addRow: { flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" },
  jerseyInput: {
    width: 52,
    backgroundColor: SURFACE,
    color: "#fff",
    padding: 10,
    borderRadius: 7,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  nameInput: {
    flex: 1,
    backgroundColor: SURFACE,
    color: "#fff",
    padding: 10,
    borderRadius: 7,
    fontSize: 15,
    borderWidth: 1,
    borderColor: BORDER,
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 7,
  },
  addBtnA: { backgroundColor: ACCENT_A },
  addBtnB: { backgroundColor: ACCENT_B },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // Roster meta
  rosterMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  rosterCountText: { color: "#555", fontSize: 11, fontWeight: "600" },
  readyText: { color: "#00cc66" },
  notReadyText: { color: "#ff9933" },

  // Player list
  rosterList: { flex: 1 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderRadius: 7,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  playerRowBench: { opacity: 0.65 },

  jerseyTag: {
    width: 30,
    height: 30,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  jerseyTagA: { backgroundColor: "#0e2040" },
  jerseyTagB: { backgroundColor: "#3d1a00" },
  jerseyTagText: { color: "#ccc", fontWeight: "800", fontSize: 12 },

  playerNameText: { flex: 1, color: "#e8e8e8", fontSize: 14, fontWeight: "600" },
  playerNameBench: { color: "#888" },

  starterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#00cc66",
    marginRight: 4,
  },

  removeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  removeBtnText: { color: "#444", fontSize: 14, fontWeight: "700" },

  benchDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    marginTop: 4,
    gap: 8,
  },
  benchDividerLine: { flex: 1, height: 1, backgroundColor: "#222" },
  benchDividerText: { color: "#444", fontSize: 10, fontWeight: "700", letterSpacing: 2 },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    backgroundColor: SURFACE,
  },
  startBtn: {
    backgroundColor: "#00cc66",
    paddingHorizontal: 60,
    paddingVertical: 13,
    borderRadius: 10,
  },
  startBtnDisabled: { backgroundColor: "#1a3326", opacity: 0.5 },
  startBtnText: { color: "#fff", fontSize: 17, fontWeight: "900", letterSpacing: 2 },
});