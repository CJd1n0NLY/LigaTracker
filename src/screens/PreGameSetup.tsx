import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
} from "react-native";
import { Q } from "@nozbe/watermelondb";

import { database } from "../db";
import Team from "../db/models/Team";
import Player from "../db/models/Player";
import Game from "../db/models/Game";

interface SetupPlayer {
  id: string;
  name: string;
  jersey: string;
  isStarting: boolean;
}

interface PreGameSetupProps {
  onStartGame: (gameId: string) => void;
  onViewHistory: () => void;
  onViewLeaderboards: () => void;
  onManageTeams: () => void; // NEW ROUTE
}

export default function PreGameSetup({
  onStartGame,
  onViewHistory,
  onViewLeaderboards,
  onManageTeams,
}: PreGameSetupProps) {
  const [allTeams, setAllTeams] = useState<Team[]>([]);

  const [selectedTeamA, setSelectedTeamA] = useState<Team | null>(null);
  const [selectedTeamB, setSelectedTeamB] = useState<Team | null>(null);
  const [rosterA, setRosterA] = useState<SetupPlayer[]>([]);
  const [rosterB, setRosterB] = useState<SetupPlayer[]>([]);

  const [isTeamModalVisible, setIsTeamModalVisible] = useState<{
    visible: boolean;
    target: "A" | "B";
  }>({ visible: false, target: "A" });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchTeams = async () => {
      const teams = await database.get<Team>("teams").query().fetch();
      setAllTeams(teams);
    };
    fetchTeams();
  }, []);

  const handleSelectTeam = async (team: Team) => {
    if (isTeamModalVisible.target === "A") {
      if (selectedTeamB?.id === team.id)
        return Alert.alert("Error", "Team B is already using this team!");
      setSelectedTeamA(team);
      const players = await database
        .get<Player>("players")
        .query(Q.where("team_id", team.id))
        .fetch();
      setRosterA(
        players.map((p, i) => ({
          id: p.id,
          name: p.name,
          jersey: p.jerseyNumber,
          isStarting: i < 5,
        })),
      );
    } else {
      if (selectedTeamA?.id === team.id)
        return Alert.alert("Error", "Team A is already using this team!");
      setSelectedTeamB(team);
      const players = await database
        .get<Player>("players")
        .query(Q.where("team_id", team.id))
        .fetch();
      setRosterB(
        players.map((p, i) => ({
          id: p.id,
          name: p.name,
          jersey: p.jerseyNumber,
          isStarting: i < 5,
        })),
      );
    }
    setIsTeamModalVisible({ visible: false, target: "A" });
  };

  const toggleStarter = (playerId: string, team: "A" | "B") => {
    const updateRoster = (prev: SetupPlayer[]) => {
      const targetPlayer = prev.find((p) => p.id === playerId);
      if (!targetPlayer) return prev;

      if (targetPlayer.isStarting) {
        return prev.map((p) =>
          p.id === playerId ? { ...p, isStarting: false } : p,
        );
      }

      const starterCount = prev.filter((p) => p.isStarting).length;
      if (starterCount >= 5) {
        Alert.alert(
          "Starter Limit Reached",
          `Team ${team} can only have 5 starters.`,
        );
        return prev;
      }

      return prev.map((p) =>
        p.id === playerId ? { ...p, isStarting: true } : p,
      );
    };

    if (team === "A") {
      setRosterA(updateRoster);
    } else {
      setRosterB(updateRoster);
    }
  };

  const handleStartMatch = async () => {
    if (!selectedTeamA || !selectedTeamB)
      return Alert.alert("Missing Teams", "Select both teams.");

    const startersA = rosterA.filter((p) => p.isStarting).length;
    const startersB = rosterB.filter((p) => p.isStarting).length;

    if (startersA !== 5 || startersB !== 5) {
      return Alert.alert(
        "Invalid Rosters",
        `Exactly 5 starters required per team.\nTeam A: ${startersA}/5\nTeam B: ${startersB}/5`,
      );
    }

    setIsSaving(true);

    try {
      let newGameId = "";
      await database.write(async () => {
        // Update Team A Activity Status
        for (const p of rosterA) {
          const dbPlayer = await database.get<Player>("players").find(p.id);
          await dbPlayer.update((player) => {
            player.isActive = p.isStarting;
          });
        }
        // Update Team B Activity Status
        for (const p of rosterB) {
          const dbPlayer = await database.get<Player>("players").find(p.id);
          await dbPlayer.update((player) => {
            player.isActive = p.isStarting;
          });
        }
        // Create Game
        const newGame = await database.get<Game>("games").create((game) => {
          game.teamAId = selectedTeamA.id;
          game.teamBId = selectedTeamB.id;
          game.status = "ongoing";
        });
        newGameId = newGame.id;
      });

      onStartGame(newGameId);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to setup game.");
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>GAME SETUP</Text>
          <Text style={styles.headerSub}>
            Select teams and assign 5 starters
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, paddingRight: 15 }}>
          <TouchableOpacity
            style={[styles.devBtn, { backgroundColor: "#ff9933" }]}
            onPress={onManageTeams}
          >
            <Text style={[styles.devBtnText, { color: "#000" }]}>
              ⚙️ MANAGE TEAMS
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.devBtn, { backgroundColor: "#4da6ff" }]}
            onPress={onViewHistory}
          >
            <Text style={[styles.devBtnText, { color: "#fff" }]}>
              📊 HISTORY
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.devBtn, { backgroundColor: "#FFE81F" }]}
            onPress={onViewLeaderboards}
          >
            <Text style={[styles.devBtnText, { color: "#000" }]}>
              🏆 LEADERBOARDS
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.columnsContainer}>
        {/* TEAM A */}
        <View
          style={[
            styles.teamColumn,
            { borderRightWidth: 1, borderColor: "#333" },
          ]}
        >
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() =>
              setIsTeamModalVisible({ visible: true, target: "A" })
            }
          >
            <Text style={styles.selectBtnText}>
              {selectedTeamA
                ? selectedTeamA.name.toUpperCase()
                : "TAP TO SELECT TEAM A"}
            </Text>
          </TouchableOpacity>

          <ScrollView style={styles.rosterList}>
            {rosterA.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.playerRow,
                  p.isStarting ? styles.starterRow : styles.benchRow,
                ]}
                onPress={() => toggleStarter(p.id, "A")}
              >
                <Text style={styles.playerJersey}>#{p.jersey}</Text>
                <Text style={styles.playerName}>{p.name}</Text>
                <Text
                  style={[
                    styles.statusTag,
                    p.isStarting ? { color: "#00cc66" } : { color: "#888" },
                  ]}
                >
                  {p.isStarting ? "STARTER" : "BENCH"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* TEAM B */}
        <View style={styles.teamColumn}>
          <TouchableOpacity
            style={styles.selectBtn}
            onPress={() =>
              setIsTeamModalVisible({ visible: true, target: "B" })
            }
          >
            <Text style={styles.selectBtnText}>
              {selectedTeamB
                ? selectedTeamB.name.toUpperCase()
                : "TAP TO SELECT TEAM B"}
            </Text>
          </TouchableOpacity>

          <ScrollView style={styles.rosterList}>
            {rosterB.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.playerRow,
                  p.isStarting ? styles.starterRow : styles.benchRow,
                ]}
                onPress={() => toggleStarter(p.id, "B")}
              >
                <Text style={styles.playerJersey}>#{p.jersey}</Text>
                <Text style={styles.playerName}>{p.name}</Text>
                <Text
                  style={[
                    styles.statusTag,
                    p.isStarting ? { color: "#00cc66" } : { color: "#888" },
                  ]}
                >
                  {p.isStarting ? "STARTER" : "BENCH"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.startGameBtn,
            (!selectedTeamA || !selectedTeamB || isSaving) &&
              styles.disabledBtn,
          ]}
          onPress={handleStartMatch}
          disabled={!selectedTeamA || !selectedTeamB || isSaving}
        >
          <Text style={styles.startGameText}>
            {isSaving ? "SAVING..." : "START MATCH"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* TEAM SELECTION MODAL */}
      <Modal
        visible={isTeamModalVisible.visible}
        transparent
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>
              SELECT TEAM {isTeamModalVisible.target}
            </Text>
            <ScrollView>
              {allTeams.length === 0 && (
                <Text style={{ color: "#888", textAlign: "center" }}>
                  No teams found. Go to Manage Teams first.
                </Text>
              )}
              {allTeams.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.modalTeamRow}
                  onPress={() => handleSelectTeam(t)}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}
                  >
                    {t.name.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={{ marginTop: 20, alignItems: "center" }}
              onPress={() =>
                setIsTeamModalVisible({ visible: false, target: "A" })
              }
            >
              <Text
                style={{ color: "#ff4444", fontSize: 16, fontWeight: "bold" }}
              >
                CANCEL
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  header: {
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#333",
    flexDirection: "row",
    paddingLeft: 15,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  headerSub: { color: "#888", fontSize: 12 },
  devBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 5 },
  devBtnText: { fontWeight: "bold", fontSize: 12 },

  columnsContainer: { flex: 1, flexDirection: "row" },
  teamColumn: { flex: 1, padding: 15 },

  selectBtn: {
    backgroundColor: "#222",
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#555",
    alignItems: "center",
    marginBottom: 15,
  },
  selectBtnText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 1,
  },

  rosterList: { flex: 1 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    marginBottom: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  starterRow: { backgroundColor: "#1a3320", borderColor: "#00cc66" },
  benchRow: { backgroundColor: "#1a1a1a", borderColor: "#333" },
  playerJersey: { color: "#aaa", fontWeight: "bold", width: 40, fontSize: 16 },
  playerName: { color: "#fff", flex: 1, fontSize: 16 },
  statusTag: { fontWeight: "bold", fontSize: 12 },

  footer: {
    padding: 15,
    borderTopWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  startGameBtn: {
    backgroundColor: "#00cc66",
    width: "60%",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  disabledBtn: { backgroundColor: "#334d3d", opacity: 0.5 },
  startGameText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "50%",
    backgroundColor: "#222",
    borderRadius: 10,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
    letterSpacing: 1,
  },
  modalTeamRow: {
    padding: 15,
    borderBottomWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
});
