import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import Team from '../db/models/Team';
import Player from '../db/models/Player';

interface DraftPlayer { id: string; name: string; jersey: string; }

interface TeamManagerProps {
  onBack: () => void;
}

export default function TeamManager({ onBack }: TeamManagerProps) {
  const [teamName, setTeamName] = useState('');
  const [draftPlayer, setDraftPlayer] = useState({ name: '', jersey: '' });
  const [roster, setRoster] = useState<DraftPlayer[]>([]);
  const [existingTeams, setExistingTeams] = useState<{name: string, count: number}[]>([]);

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
      await database.write(async () => {
        // 1. Save the Team
        const newTeam = await database.get<Team>('teams').create(team => {
          team.name = teamName;
          team.isEliminated = false;
        });

        // 2. Save all Players linked to this Team
        for (const p of roster) {
          await database.get<Player>('players').create(player => {
            player.team.set(newTeam);
            player.name = p.name;
            player.jerseyNumber = p.jersey;
            player.isActive = false; // Default to bench, chosen at game time
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
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>← BACK</Text></TouchableOpacity>
        <Text style={styles.title}>LEAGUE MANAGER</Text>
        <View style={{width: 80}} />
      </View>

      <View style={styles.splitView}>
        {/* LEFT: CREATE TEAM */}
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

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTeam}>
            <Text style={styles.saveBtnText}>SAVE TEAM TO LEAGUE</Text>
          </TouchableOpacity>
        </View>

        {/* RIGHT: EXISTING TEAMS */}
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
