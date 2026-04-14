import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';

// 1. IMPORT WATERMELONDB AND MODELS
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
  onStartGame: (gameId: string) => void; // Now requires a Game ID
}

export default function PreGameSetup({ onStartGame }: PreGameSetupProps) {
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamAPlayers, setTeamAPlayers] = useState<TempPlayer[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<TempPlayer[]>([]);
  const [draftPlayerA, setDraftPlayerA] = useState({ name: '', jersey: '' });
  const [draftPlayerB, setDraftPlayerB] = useState({ name: '', jersey: '' });
  
  // Prevent double-tapping while the database is saving
  const [isSaving, setIsSaving] = useState(false);

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

  // 2. THE WATERMELONDB SAVE LOGIC
  const handleStartMatch = async () => {
    if (!teamAName || !teamBName) {
      Alert.alert("Missing Info", "Please enter names for both teams.");
      return;
    }

    setIsSaving(true);

    try {
      let newGameId = '';

      // Wrap all creates in a single database.write block
      await database.write(async () => {
        // A. Create Teams
        const newTeamA = await database.get<Team>('teams').create(team => {
          team.name = teamAName;
          team.isEliminated = false;
        });
        
        const newTeamB = await database.get<Team>('teams').create(team => {
          team.name = teamBName;
          team.isEliminated = false;
        });

        // B. Create Players for Team A
        for (const p of teamAPlayers) {
          await database.get<Player>('players').create(player => {
            player.team.set(newTeamA); // Link to Team A
            player.name = p.name;
            player.jerseyNumber = p.jersey;
            player.isActive = true;
          });
        }

        // C. Create Players for Team B
        for (const p of teamBPlayers) {
          await database.get<Player>('players').create(player => {
            player.team.set(newTeamB); // Link to Team B
            player.name = p.name;
            player.jerseyNumber = p.jersey;
            player.isActive = true;
          });
        }

        // D. Create the Game Record
        const newGame = await database.get<Game>('games').create(game => {
          game.teamAId = newTeamA.id;
          game.teamBId = newTeamB.id;
          game.status = 'ongoing';
        });

        newGameId = newGame.id;
      });

      // 3. PASS THE NEW GAME ID TO THE APP
      onStartGame(newGameId);

    } catch (error) {
      console.error("Database Write Error:", error);
      Alert.alert("Error", "Failed to setup the game in the database.");
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GAME SETUP</Text>
        <Text style={styles.headerSub}>Create teams and add starting rosters</Text>
      </View>

      <View style={styles.columnsContainer}>
        {/* TEAM A */}
        <View style={[styles.teamColumn, { borderRightWidth: 1, borderColor: '#333' }]}>
          <TextInput style={styles.teamNameInput} placeholder="Enter Team A Name..." placeholderTextColor="#666" value={teamAName} onChangeText={setTeamAName} />
          <View style={styles.addPlayerForm}>
            <TextInput style={[styles.input, { flex: 0.3 }]} placeholder="Jer #" placeholderTextColor="#666" keyboardType="numeric" value={draftPlayerA.jersey} onChangeText={(text) => setDraftPlayerA({...draftPlayerA, jersey: text})} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Player Last Name" placeholderTextColor="#666" value={draftPlayerA.name} onChangeText={(text) => setDraftPlayerA({...draftPlayerA, name: text})} />
            <TouchableOpacity style={styles.addBtn} onPress={addPlayerToTeamA}><Text style={styles.addBtnText}>ADD</Text></TouchableOpacity>
          </View>
          <ScrollView style={styles.rosterList}>
            {teamAPlayers.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <Text style={styles.playerJersey}>#{player.jersey}</Text>
                <Text style={styles.playerName}>{player.name}</Text>
                <TouchableOpacity onPress={() => removePlayerA(player.id)}><Text style={styles.removeText}>X</Text></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* TEAM B */}
        <View style={styles.teamColumn}>
          <TextInput style={styles.teamNameInput} placeholder="Enter Team B Name..." placeholderTextColor="#666" value={teamBName} onChangeText={setTeamBName} />
          <View style={styles.addPlayerForm}>
            <TextInput style={[styles.input, { flex: 0.3 }]} placeholder="Jer #" placeholderTextColor="#666" keyboardType="numeric" value={draftPlayerB.jersey} onChangeText={(text) => setDraftPlayerB({...draftPlayerB, jersey: text})} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Player Last Name" placeholderTextColor="#666" value={draftPlayerB.name} onChangeText={(text) => setDraftPlayerB({...draftPlayerB, name: text})} />
            <TouchableOpacity style={styles.addBtn} onPress={addPlayerToTeamB}><Text style={styles.addBtnText}>ADD</Text></TouchableOpacity>
          </View>
          <ScrollView style={styles.rosterList}>
            {teamBPlayers.map((player) => (
              <View key={player.id} style={styles.playerRow}>
                <Text style={styles.playerJersey}>#{player.jersey}</Text>
                <Text style={styles.playerName}>{player.name}</Text>
                <TouchableOpacity onPress={() => removePlayerB(player.id)}><Text style={styles.removeText}>X</Text></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.startGameBtn, (!teamAName || !teamBName || isSaving) && styles.disabledBtn]} 
          onPress={handleStartMatch}
          disabled={!teamAName || !teamBName || isSaving}
        >
          <Text style={styles.startGameText}>{isSaving ? "SAVING..." : "START MATCH"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ... (Keep your exact same styles array here from Phase 6) ...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#333' },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', letterSpacing: 2 },
  headerSub: { color: '#888', fontSize: 12 },
  columnsContainer: { flex: 1, flexDirection: 'row' },
  teamColumn: { flex: 1, padding: 15 },
  teamNameInput: { backgroundColor: '#222', color: '#fff', fontSize: 20, fontWeight: 'bold', padding: 15, borderRadius: 8, textAlign: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#444' },
  addPlayerForm: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  input: { backgroundColor: '#222', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16 },
  addBtn: { backgroundColor: '#4da6ff', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: 'bold' },
  rosterList: { flex: 1 },
  playerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 12, marginBottom: 5, borderRadius: 8 },
  playerJersey: { color: '#aaa', fontWeight: 'bold', width: 40, fontSize: 16 },
  playerName: { color: '#fff', flex: 1, fontSize: 16 },
  removeText: { color: '#ff4444', fontWeight: 'bold', fontSize: 18, paddingHorizontal: 10 },
  footer: { padding: 15, borderTopWidth: 1, borderColor: '#333', alignItems: 'center' },
  startGameBtn: { backgroundColor: '#00cc66', width: '60%', padding: 15, borderRadius: 10, alignItems: 'center' },
  disabledBtn: { backgroundColor: '#334d3d', opacity: 0.5 },
  startGameText: { color: '#fff', fontSize: 20, fontWeight: 'bold', letterSpacing: 2 },
});