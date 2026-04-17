import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import Team from '../db/models/Team';
import Player from '../db/models/Player';
import Game from '../db/models/Game';
import GameEvent from '../db/models/GameEvent';

interface DraftPlayer { id: string; name: string; jersey: string; }

interface TeamManagerProps {
  onBack: () => void;
}

export default function TeamManager({ onBack }: TeamManagerProps) {
  const [teamName, setTeamName] = useState('');
  const [draftPlayer, setDraftPlayer] = useState({ name: '', jersey: '' });
  const [roster, setRoster] = useState<DraftPlayer[]>([]);
  const [existingTeams, setExistingTeams] = useState<{name: string, count: number}[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadExistingTeams();
  }, []);

  const loadExistingTeams = async () => {
    const teams = await database.get<Team>('teams').query().fetch();
    const teamData = await Promise.all(teams.map(async (t) => {
      const players = await database.get<Player>('players').query(Q.where('team_id', t.id)).fetch();
      return { name: t.name, count: players.length };
    }));
    setExistingTeams(teamData);
  };

  const addPlayerToDraft = () => {
    if (!draftPlayer.name || !draftPlayer.jersey) return;
    setRoster([...roster, { id: Date.now().toString(), ...draftPlayer }]);
    setDraftPlayer({ name: '', jersey: '' });
  };

  const removeDraftPlayer = (id: string) => setRoster(roster.filter(p => p.id !== id));

  const handleSaveTeam = async () => {
    if (!teamName) return Alert.alert("Missing Info", "Please enter a team name.");
    if (roster.length < 5) return Alert.alert("Not Enough Players", "A team must have at least 5 players.");

    try {
      setIsSaving(true);
      await database.write(async () => {
        const newTeam = await database.get<Team>('teams').create(team => {
          team.name = teamName;
          team.isEliminated = false;
        });

        for (const p of roster) {
          await database.get<Player>('players').create(player => {
            player.team.set(newTeam);
            player.name = p.name;
            player.jerseyNumber = p.jersey;
            player.isActive = false; 
          });
        }
      });

      Alert.alert("Success", `${teamName.toUpperCase()} has been added to the league!`);
      setTeamName('');
      setRoster([]);
      loadExistingTeams();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to save team.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- ⚡ DEV SKIP: MASS GENERATOR (TEAMS + GAMES + STATS) ---
  const handleDevSeedTeams = async () => {
    Alert.alert(
      "Seed League Database",
      "This will generate 10 teams, 100 players, and simulate 32 finished games with random stats. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Generate", style: "destructive", onPress: executeSeed }
      ]
    );
  };

  const executeSeed = async () => {
    setIsSaving(true);
    try {
      const dummyTeams = [
        "QC Capitals", "Makati Bosses", "Manila Stars", "Pasay Pirates", "Pangasinan Waves", "Bulacan Warriors",
        "Taguig Pilots", "San Juan Knights", "Marikina Shoemakers", "Valenzuela Vanguards"
      ];
      const lastNames = ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Tomas", "Andrada", "Perez", "Legaspi", "Villanueva", "Ramos"];

      await database.write(async () => {
        const createdTeams: Team[] = [];
        const teamPlayers: Record<string, Player[]> = {};

        // 1. Create Teams & Players
        for (const tName of dummyTeams) {
          const newTeam = await database.get<Team>('teams').create(team => {
            team.name = tName;
            team.isEliminated = false;
          });
          createdTeams.push(newTeam);
          teamPlayers[newTeam.id] = [];

          for (let i = 0; i < 10; i++) {
            const newPlayer = await database.get<Player>('players').create(player => {
              player.team.set(newTeam);
              const randomName = lastNames[Math.floor(Math.random() * lastNames.length)];
              player.name = `${randomName} ${String.fromCharCode(65 + i)}`; 
              player.jerseyNumber = Math.floor(Math.random() * 99).toString();
              player.isActive = false;
            });
            teamPlayers[newTeam.id].push(newPlayer);
          }
        }

        // 2. Simulate 32 Finished Games
        for (let i = 0; i < 32; i++) {
          // Pick two random distinct teams
          const tA = createdTeams[Math.floor(Math.random() * createdTeams.length)];
          let tB = createdTeams[Math.floor(Math.random() * createdTeams.length)];
          while (tA.id === tB.id) {
            tB = createdTeams[Math.floor(Math.random() * createdTeams.length)];
          }

          const winner = Math.random() > 0.5 ? tA : tB;

          // Create the game record
          const newGame = await database.get<Game>('games').create(game => {
            game.teamAId = tA.id;
            game.teamBId = tB.id;
            game.status = 'finished';
            game.winnerId = winner.id;
          });

          // 3. Generate Fake Box Score Stats for Team A (15 random actions)
          const playersA = teamPlayers[tA.id];
          for (let j = 0; j < 15; j++) {
            const p = playersA[Math.floor(Math.random() * playersA.length)];
            const eventType = Math.random() > 0.4 ? 'Point' : (Math.random() > 0.5 ? 'Rebound' : 'Assist');
            const value = eventType === 'Point' ? (Math.random() > 0.5 ? 2 : 3) : 1; 
            
            await database.get<GameEvent>('game_events').create(e => {
              e.gameId = newGame.id;
              e.teamId = tA.id;
              e.playerId = p.id;
              e.eventType = eventType;
              e.value = value;
              e.timestampMs = Date.now() - (Math.random() * 100000);
            });
          }

          // 4. Generate Fake Box Score Stats for Team B (15 random actions)
          const playersB = teamPlayers[tB.id];
          for (let j = 0; j < 15; j++) {
            const p = playersB[Math.floor(Math.random() * playersB.length)];
            const eventType = Math.random() > 0.4 ? 'Point' : (Math.random() > 0.5 ? 'Rebound' : 'Assist');
            const value = eventType === 'Point' ? (Math.random() > 0.5 ? 2 : 3) : 1;
            
            await database.get<GameEvent>('game_events').create(e => {
              e.gameId = newGame.id;
              e.teamId = tB.id;
              e.playerId = p.id;
              e.eventType = eventType;
              e.value = value;
              e.timestampMs = Date.now() - (Math.random() * 100000);
            });
          }
        }
      });

      Alert.alert("Dev Magic Complete", "10 Teams, 100 Players, and 32 Finished Games generated successfully!");
      loadExistingTeams();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to seed database.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>← BACK</Text></TouchableOpacity>
        <Text style={styles.title}>LEAGUE MANAGER</Text>
        
        <TouchableOpacity style={styles.devBtn} onPress={handleDevSeedTeams} disabled={isSaving}>
          <Text style={styles.devBtnText}>{isSaving ? "SEEDING..." : "⚡ SEED GAMES"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.splitView}>
        <View style={styles.createSection}>
          <Text style={styles.sectionTitle}>CREATE NEW TEAM</Text>
          <TextInput style={styles.teamInput} placeholder="Enter Team Name..." placeholderTextColor="#666" value={teamName} onChangeText={setTeamName} />
          
          <View style={styles.addPlayerRow}>
            <TextInput style={[styles.input, { flex: 0.3 }]} placeholder="Jer #" placeholderTextColor="#666" keyboardType="numeric" value={draftPlayer.jersey} onChangeText={(text) => setDraftPlayer({...draftPlayer, jersey: text})} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Player Last Name" placeholderTextColor="#666" value={draftPlayer.name} onChangeText={(text) => setDraftPlayer({...draftPlayer, name: text})} />
            <TouchableOpacity style={styles.addBtn} onPress={addPlayerToDraft}><Text style={styles.addBtnText}>ADD</Text></TouchableOpacity>
          </View>

          <ScrollView style={styles.rosterList}>
            {roster.map(p => (
              <View key={p.id} style={styles.playerRow}>
                <Text style={styles.jerseyText}>#{p.jersey}</Text>
                <Text style={styles.nameText}>{p.name}</Text>
                <TouchableOpacity onPress={() => removeDraftPlayer(p.id)}><Text style={styles.removeText}>X</Text></TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={[styles.saveBtn, isSaving && {opacity: 0.5}]} onPress={handleSaveTeam} disabled={isSaving}>
            <Text style={styles.saveBtnText}>{isSaving ? "SAVING..." : "SAVE TEAM TO LEAGUE"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.existingSection}>
          <Text style={styles.sectionTitle}>REGISTERED TEAMS</Text>
          <ScrollView>
            {existingTeams.length === 0 ? <Text style={styles.emptyText}>No teams registered yet.</Text> : null}
            {existingTeams.map((t, i) => (
              <View key={i} style={styles.existingTeamCard}>
                <Text style={styles.existingTeamName}>{t.name.toUpperCase()}</Text>
                <Text style={styles.existingTeamCount}>{t.count} Players</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a' },
  backBtn: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 5 },
  backBtnText: { color: '#fff', fontWeight: 'bold' },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', letterSpacing: 2 },
  
  devBtn: { backgroundColor: '#FFD700', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 5 },
  devBtnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },

  splitView: { flex: 1, flexDirection: 'row' },
  sectionTitle: { color: '#888', fontWeight: 'bold', letterSpacing: 1, marginBottom: 15 },
  
  createSection: { flex: 1.5, padding: 20, borderRightWidth: 1, borderColor: '#333' },
  teamInput: { backgroundColor: '#222', color: '#fff', fontSize: 20, fontWeight: 'bold', padding: 15, borderRadius: 8, textAlign: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#444' },
  addPlayerRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  input: { backgroundColor: '#222', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16 },
  addBtn: { backgroundColor: '#4da6ff', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: 'bold' },
  rosterList: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#333' },
  jerseyText: { color: '#aaa', width: 40, fontWeight: 'bold' },
  nameText: { color: '#fff', flex: 1 },
  removeText: { color: '#ff4444', fontWeight: 'bold', paddingHorizontal: 10 },
  saveBtn: { backgroundColor: '#00cc66', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', letterSpacing: 1, fontSize: 16 },

  existingSection: { flex: 1, padding: 20, backgroundColor: '#141414' },
  emptyText: { color: '#555', fontStyle: 'italic' },
  existingTeamCard: { backgroundColor: '#222', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 4, borderColor: '#FFE81F' },
  existingTeamName: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  existingTeamCount: { color: '#888', fontSize: 12, marginTop: 4 },
});