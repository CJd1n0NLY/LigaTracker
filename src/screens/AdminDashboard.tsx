import React, { useState, useEffect, useRef } from "react";
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
import Game from "../db/models/Game";
import Team from "../db/models/Team";
import Player from "../db/models/Player";
import GameEvent from "../db/models/GameEvent";

interface ActivePlayer {
  id: string;
  jersey: string;
  name: string;
  pts: number;
  fls: number;
  isActive: boolean;
}
interface LogEntry {
  id: string;
  text: string;
  timestampMs: number;
}

interface AdminDashboardProps {
  gameId: string | null;
  onEndGame: () => void;
}

export default function AdminDashboard({
  gameId,
  onEndGame,
}: AdminDashboardProps) {
  const [isLoading, setIsLoading] = useState(true);

  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  // --- PHASE 15: TEAM FOULS STATE ---
  const [teamFoulsA, setTeamFoulsA] = useState(0);
  const [teamFoulsB, setTeamFoulsB] = useState(0);

  const [activePlayersA, setActivePlayersA] = useState<ActivePlayer[]>([]);
  const [activePlayersB, setActivePlayersB] = useState<ActivePlayer[]>([]);
  const [benchPlayersA, setBenchPlayersA] = useState<ActivePlayer[]>([]);
  const [benchPlayersB, setBenchPlayersB] = useState<ActivePlayer[]>([]);

  const [playByPlayLogs, setPlayByPlayLogs] = useState<LogEntry[]>([]);
  const [isSubModalVisible, setIsSubModalVisible] = useState(false);

  const [quarter, setQuarter] = useState(1);
  const [isGameOver, setIsGameOver] = useState(false);

  const [gameTime, setGameTime] = useState(600);
  const [shotClock, setShotClock] = useState(24);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const gameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStats = async (
    tAId: string,
    tBId: string,
    allPlayersA: ActivePlayer[],
    allPlayersB: ActivePlayer[],
  ) => {
    if (!gameId) return;
    try {
      const events = await database
        .get<GameEvent>("game_events")
        .query(Q.where("game_id", gameId))
        .fetch();

      let currentScoreA = 0;
      let currentScoreB = 0;
      const playerStats: Record<string, { pts: number; fls: number }> = {};
      const combinedPlayers = [...allPlayersA, ...allPlayersB];

      events.forEach((event) => {
        if (!playerStats[event.playerId])
          playerStats[event.playerId] = { pts: 0, fls: 0 };
        if (event.eventType === "Point") {
          playerStats[event.playerId].pts += event.value;
          if (event.teamId === tAId) currentScoreA += event.value;
          if (event.teamId === tBId) currentScoreB += event.value;
        } else if (event.eventType === "Foul") {
          playerStats[event.playerId].fls += event.value;
        }
      });

      const sortedEvents = events.sort((a, b) => b.timestampMs - a.timestampMs);
      const generatedLogs = sortedEvents.slice(0, 5).map((event) => {
        const player = combinedPlayers.find((p) => p.id === event.playerId);
        const actionText =
          event.eventType === "Point"
            ? `scored +${event.value} PTS`
            : `recorded a ${event.eventType.toUpperCase()}`;
        return {
          id: event.id,
          text: `${player?.name || "Unknown"} ${actionText}`,
          timestampMs: event.timestampMs,
        };
      });

      setScoreA(currentScoreA);
      setScoreB(currentScoreB);
      setPlayByPlayLogs(generatedLogs);

      const mappedA = allPlayersA.map((p) => ({
        ...p,
        pts: playerStats[p.id]?.pts || 0,
        fls: playerStats[p.id]?.fls || 0,
      }));
      const mappedB = allPlayersB.map((p) => ({
        ...p,
        pts: playerStats[p.id]?.pts || 0,
        fls: playerStats[p.id]?.fls || 0,
      }));

      setActivePlayersA(mappedA.filter((p) => p.isActive));
      setActivePlayersB(mappedB.filter((p) => p.isActive));
      setBenchPlayersA(mappedA.filter((p) => !p.isActive));
      setBenchPlayersB(mappedB.filter((p) => !p.isActive));
    } catch (error) {
      console.error("Failed to refresh stats:", error);
    }
  };

  const loadGameData = async () => {
    if (!gameId) {
      onEndGame();
      return;
    }

    try {
      const game = await database.get<Game>("games").find(gameId);
      if (game.status === "finished") {
        setIsGameOver(true);
        setIsLoading(false);
        return;
      }

      const tA = await database.get<Team>("teams").find(game.teamAId);
      const tB = await database.get<Team>("teams").find(game.teamBId);
      setTeamA(tA);
      setTeamB(tB);

      const dbPlayersA = await database
        .get<Player>("players")
        .query(Q.where("team_id", tA.id))
        .fetch();
      const dbPlayersB = await database
        .get<Player>("players")
        .query(Q.where("team_id", tB.id))
        .fetch();

      const basePlayersA = dbPlayersA.map((p) => ({
        id: p.id,
        jersey: p.jerseyNumber,
        name: p.name,
        pts: 0,
        fls: 0,
        isActive: p.isActive,
      }));
      const basePlayersB = dbPlayersB.map((p) => ({
        id: p.id,
        jersey: p.jerseyNumber,
        name: p.name,
        pts: 0,
        fls: 0,
        isActive: p.isActive,
      }));

      await refreshStats(tA.id, tB.id, basePlayersA, basePlayersB);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      onEndGame();
    }
  };

  useEffect(() => {
    loadGameData();
  }, [gameId]);

  useEffect(() => {
    if (isClockRunning) {
      gameIntervalRef.current = setInterval(() => {
        setGameTime((prev) => (prev <= 0 ? 0 : prev - 1));
        setShotClock((prev) => (prev <= 0 ? 0 : prev - 1));
      }, 1000);
    } else {
      if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
    }
    return () => {
      if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
    };
  }, [isClockRunning]);

  const toggleClock = () => {
    if (isClockRunning) {
      setIsClockRunning(false);
      return;
    }

    const hasFouledOutActivePlayer =
      activePlayersA.some((player) => player.fls >= 5) ||
      activePlayersB.some((player) => player.fls >= 5);

    if (hasFouledOutActivePlayer) {
      return Alert.alert(
        "Clock Start Blocked",
        "A fouled out player is still on the court. Make a substitution before starting the game clock.",
      );
    }

    setIsClockRunning(true);
  };
  const resetShotClock24 = () => setShotClock(24);
  const resetShotClock14 = () => setShotClock(14);
  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const executeAdvanceQuarter = () => {
    setQuarter((prev) => prev + 1);
    setGameTime(600);
    setShotClock(24);
    setIsClockRunning(false);
    // PHASE 15: Reset Team Fouls at the start of a new quarter
    setTeamFoulsA(0);
    setTeamFoulsB(0);
  };

  const handleAdvanceQuarter = () => {
    Alert.alert("Advance Quarter", "Move to the next quarter?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Advance",
        onPress: executeAdvanceQuarter,
      },
    ]);
  };

  const getQuarterText = () => {
    if (quarter === 1) return "1ST QTR";
    if (quarter === 2) return "2ND QTR";
    if (quarter === 3) return "3RD QTR";
    if (quarter === 4) return "4TH QTR";
    return "OT";
  };

  const handleEndMatch = () => {
    if (scoreA === scoreB)
      return Alert.alert(
        "Tie Game!",
        "Advance to Overtime to declare a winner.",
      );
    Alert.alert("End Match", "Are you sure? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "End Game", style: "destructive", onPress: executeEndMatch },
    ]);
  };

  const executeEndMatch = async () => {
    if (!gameId || !teamA || !teamB) return;
    const winningTeamId = scoreA > scoreB ? teamA.id : teamB.id;
    try {
      const game = await database.get<Game>("games").find(gameId);
      await database.write(async () => {
        await game.update((g) => {
          g.status = "finished";
          g.winnerId = winningTeamId;
        });
      });
      setIsGameOver(true);
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogStat = async (statName: string, value: number) => {
    if (!selectedPlayer)
      return Alert.alert("Action Required", "Please select a player first!");
    if (!teamA || !teamB || !gameId) return;

    // Identify player and team
    const isTeamA = activePlayersA.some((p) => p.id === selectedPlayer);
    const playerTeamId = isTeamA ? teamA.id : teamB.id;
    const playerObj = isTeamA
      ? activePlayersA.find((p) => p.id === selectedPlayer)
      : activePlayersB.find((p) => p.id === selectedPlayer);

    // PHASE 15: FOUL OUT BLOCKER
    if (playerObj && playerObj.fls >= 5) {
      return Alert.alert(
        "Fouled Out",
        "This player has 5 fouls and cannot commit any more actions. Please substitute them immediately.",
      );
    }

    try {
      await database.write(async () => {
        await database.get<GameEvent>("game_events").create((event) => {
          event.gameId = gameId;
          event.playerId = selectedPlayer;
          event.teamId = playerTeamId;
          event.eventType = statName;
          event.value = value;
          event.timestampMs = Date.now();
        });
      });

      // PHASE 15: INCREMENT TEAM FOULS
      if (statName === "Foul") {
        if (isTeamA) setTeamFoulsA((prev) => prev + 1);
        else setTeamFoulsB((prev) => prev + 1);
      }

      setSelectedPlayer(null);
      loadGameData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleUndo = async () => {
    if (!gameId) return;
    try {
      const events = await database
        .get<GameEvent>("game_events")
        .query(Q.where("game_id", gameId))
        .fetch();
      if (events.length === 0) return Alert.alert("Nothing to undo!");

      const latestEvent = events.sort(
        (a, b) => b.timestampMs - a.timestampMs,
      )[0];

      // PHASE 15: DECREMENT TEAM FOUL ON UNDO
      if (latestEvent.eventType === "Foul") {
        if (latestEvent.teamId === teamA?.id)
          setTeamFoulsA((prev) => Math.max(0, prev - 1));
        else setTeamFoulsB((prev) => Math.max(0, prev - 1));
      }

      await database.write(async () => {
        await latestEvent.destroyPermanently();
      });
      loadGameData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleOpenSubMenu = () => {
    if (!selectedPlayer)
      return Alert.alert(
        "Action Required",
        "Select an active player to substitute out.",
      );
    setIsSubModalVisible(true);
  };

  const executeSubstitution = async (benchPlayerId: string) => {
    if (!selectedPlayer) return;
    try {
      const playerGoingToBench = await database
        .get<Player>("players")
        .find(selectedPlayer);
      const playerGoingToCourt = await database
        .get<Player>("players")
        .find(benchPlayerId);
      await database.write(async () => {
        await playerGoingToBench.update((p) => {
          p.isActive = false;
        });
        await playerGoingToCourt.update((p) => {
          p.isActive = true;
        });
      });
      setIsSubModalVisible(false);
      setSelectedPlayer(null);
      loadGameData();
    } catch (error) {
      console.error(error);
    }
  };

  // Manual fallback override for team fouls just in case the official makes a mistake
  const manualAdjustFouls = (team: "A" | "B") => {
    if (team === "A") setTeamFoulsA((prev) => (prev >= 5 ? 0 : prev + 1));
    else setTeamFoulsB((prev) => (prev >= 5 ? 0 : prev + 1));
  };

  if (isLoading)
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Text style={{ color: "#fff", fontSize: 18, letterSpacing: 2 }}>
          LOADING...
        </Text>
      </View>
    );

  if (isGameOver) {
    const winnerName = scoreA > scoreB ? teamA?.name : teamB?.name;
    const loserScore = scoreA > scoreB ? scoreB : scoreA;
    const winnerScore = scoreA > scoreB ? scoreA : scoreB;
    return (
      <View style={styles.gameOverContainer}>
        <Text style={styles.gameOverLabel}>MATCH FINISHED</Text>
        <Text style={styles.gameOverWinner}>
          {winnerName?.toUpperCase()} WINS!
        </Text>
        <Text style={styles.gameOverScore}>
          {winnerScore} — {loserScore}
        </Text>
        <TouchableOpacity style={styles.returnBtn} onPress={onEndGame}>
          <Text style={styles.returnBtnText}>RETURN TO SETUP</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        {/* Team A Score & Fouls */}
        <View style={styles.scoreBox}>
          <Text style={styles.teamNameText} numberOfLines={1}>
            {teamA?.name.toUpperCase()}
          </Text>
          <Text style={styles.scoreText}>{scoreA}</Text>
          <TouchableOpacity
            onPress={() => manualAdjustFouls("A")}
            style={styles.teamFoulContainer}
          >
            {teamFoulsA >= 5 ? (
              <Text style={styles.bonusText}>BONUS</Text>
            ) : (
              <Text style={styles.teamFoulText}>FOULS: {teamFoulsA}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Center Clock */}
        <View style={styles.centerSection}>
          <View style={styles.quarterBlock}>
            <Text style={styles.quarterLabel}>QUARTER</Text>
            <TouchableOpacity
              onPress={handleAdvanceQuarter}
              style={styles.quarterBadge}
            >
              <Text style={styles.quarterText}>{getQuarterText()}</Text>
            </TouchableOpacity>
            <Text style={styles.quarterHint}>tap to advance</Text>
          </View>

          <TouchableOpacity onPress={toggleClock} style={styles.gameClockBtn}>
            <Text
              style={[
                styles.gameClockText,
                !isClockRunning && styles.clockPaused,
              ]}
            >
              {formatTime(gameTime)}
            </Text>
            <Text style={styles.clockHint}>
              {isClockRunning ? "TAP TO PAUSE" : "TAP TO START"}
            </Text>
          </TouchableOpacity>

          <View style={styles.shotClockWrapper}>
            <Text
              style={[
                styles.shotClockText,
                shotClock <= 5 && styles.shotClockUrgent,
              ]}
            >
              {shotClock}
            </Text>
            <View style={styles.shotClockBtns}>
              <TouchableOpacity onPress={resetShotClock24} style={styles.scBtn}>
                <Text style={styles.scBtnText}>24</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={resetShotClock14} style={styles.scBtn}>
                <Text style={styles.scBtnText}>14</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Team B Score & Fouls */}
        <View style={styles.scoreBox}>
          <Text style={styles.teamNameText} numberOfLines={1}>
            {teamB?.name.toUpperCase()}
          </Text>
          <Text style={styles.scoreText}>{scoreB}</Text>
          <TouchableOpacity
            onPress={() => manualAdjustFouls("B")}
            style={styles.teamFoulContainer}
          >
            {teamFoulsB >= 5 ? (
              <Text style={styles.bonusText}>BONUS</Text>
            ) : (
              <Text style={styles.teamFoulText}>FOULS: {teamFoulsB}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── COURT AREA ── */}
      <View style={styles.courtArea}>
        {/* Team A Roster */}
        <View style={styles.rosterPanel}>
          {activePlayersA.map((player) => (
            <TouchableOpacity
              key={player.id}
              style={[
                styles.playerCard,
                selectedPlayer === player.id && styles.selectedA,
                player.fls >= 5 && styles.fouledOutCard, // PHASE 15: Foul out styling
              ]}
              onPress={() =>
                setSelectedPlayer(
                  player.id === selectedPlayer ? null : player.id,
                )
              }
            >
              <View
                style={[
                  styles.jerseyBadge,
                  player.fls >= 5 && { backgroundColor: "#3d0000" },
                ]}
              >
                <Text style={styles.jerseyNum}>{player.jersey}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.playerNameText,
                    player.fls >= 5 && { color: "#ff4444" },
                  ]}
                  numberOfLines={1}
                >
                  {player.name}
                </Text>
                {player.fls >= 5 && (
                  <Text style={styles.fouledOutTag}>FOULED OUT</Text>
                )}
              </View>
              <View style={styles.statPills}>
                <View style={styles.statPill}>
                  <Text style={styles.statPillText}>{player.pts}</Text>
                  <Text style={styles.statPillLabel}>PTS</Text>
                </View>
                <View
                  style={[styles.statPill, player.fls >= 4 && styles.foulPill]}
                >
                  <Text
                    style={[
                      styles.statPillText,
                      player.fls >= 4 && styles.foulPillText,
                    ]}
                  >
                    {player.fls}
                  </Text>
                  <Text
                    style={[
                      styles.statPillLabel,
                      player.fls >= 4 && styles.foulPillText,
                    ]}
                  >
                    FLS
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Center Action Panel */}
        <View style={styles.actionPanel}>
          <View style={styles.logBox}>
            {playByPlayLogs.length === 0 ? (
              <Text style={styles.logEmpty}>No events yet</Text>
            ) : (
              playByPlayLogs.slice(0, 3).map((log) => (
                <Text key={log.id} style={styles.logEntry} numberOfLines={1}>
                  · {log.text}
                </Text>
              ))
            )}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.pointBtn}
              onPress={() => handleLogStat("Point", 1)}
            >
              <Text style={styles.pointBtnText}>+1</Text>
              <Text style={styles.pointBtnSub}>FT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pointBtn, styles.pointBtn2]}
              onPress={() => handleLogStat("Point", 2)}
            >
              <Text style={styles.pointBtnText}>+2</Text>
              <Text style={styles.pointBtnSub}>FIELD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pointBtn, styles.pointBtn3]}
              onPress={() => handleLogStat("Point", 3)}
            >
              <Text style={styles.pointBtnText}>+3</Text>
              <Text style={styles.pointBtnSub}>ARC</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleLogStat("Rebound", 1)}
            >
              <Text style={styles.actionBtnText}>REB</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleLogStat("Assist", 1)}
            >
              <Text style={styles.actionBtnText}>AST</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleLogStat("Steal", 1)}
            >
              <Text style={styles.actionBtnText}>STL</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.foulBtn]}
              onPress={() => handleLogStat("Foul", 1)}
            >
              <Text style={[styles.actionBtnText, styles.foulBtnText]}>
                FOUL
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleLogStat("Turnover", 1)}
            >
              <Text style={styles.actionBtnText}>T/O</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleLogStat("Block", 1)}
            >
              <Text style={styles.actionBtnText}>BLK</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.utilRow}>
            <TouchableOpacity style={styles.undoBtn} onPress={handleUndo}>
              <Text style={styles.undoBtnText}>↩ UNDO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.subBtn} onPress={handleOpenSubMenu}>
              <Text style={styles.subBtnText}>⇄ SUB</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.endBtn} onPress={handleEndMatch}>
              <Text style={styles.endBtnText}>■ END</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Team B Roster */}
        <View style={styles.rosterPanel}>
          {activePlayersB.map((player) => (
            <TouchableOpacity
              key={player.id}
              style={[
                styles.playerCard,
                selectedPlayer === player.id && styles.selectedB,
                player.fls >= 5 && styles.fouledOutCard, // PHASE 15
              ]}
              onPress={() =>
                setSelectedPlayer(
                  player.id === selectedPlayer ? null : player.id,
                )
              }
            >
              <View
                style={[
                  styles.jerseyBadge,
                  player.fls >= 5 && { backgroundColor: "#3d0000" },
                ]}
              >
                <Text style={styles.jerseyNum}>{player.jersey}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.playerNameText,
                    player.fls >= 5 && { color: "#ff4444" },
                  ]}
                  numberOfLines={1}
                >
                  {player.name}
                </Text>
                {player.fls >= 5 && (
                  <Text style={styles.fouledOutTag}>FOULED OUT</Text>
                )}
              </View>
              <View style={styles.statPills}>
                <View style={styles.statPill}>
                  <Text style={styles.statPillText}>{player.pts}</Text>
                  <Text style={styles.statPillLabel}>PTS</Text>
                </View>
                <View
                  style={[styles.statPill, player.fls >= 4 && styles.foulPill]}
                >
                  <Text
                    style={[
                      styles.statPillText,
                      player.fls >= 4 && styles.foulPillText,
                    ]}
                  >
                    {player.fls}
                  </Text>
                  <Text
                    style={[
                      styles.statPillLabel,
                      player.fls >= 4 && styles.foulPillText,
                    ]}
                  >
                    FLS
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* SUB MODAL */}
      <Modal visible={isSubModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>SUBSTITUTE IN</Text>
            <ScrollView>
              {(() => {
                const isTeamA = activePlayersA.some(
                  (p) => p.id === selectedPlayer,
                );
                const bench = isTeamA ? benchPlayersA : benchPlayersB;
                if (bench.length === 0)
                  return (
                    <Text style={styles.noBenchText}>
                      No bench players available.
                    </Text>
                  );
                return bench.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.benchRow}
                    onPress={() => executeSubstitution(p.id)}
                  >
                    <Text style={styles.benchPlayerText}>
                      #{p.jersey} {p.name}
                    </Text>
                    <View style={styles.subInBadge}>
                      <Text style={styles.subInText}>SUB IN</Text>
                    </View>
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setIsSubModalVisible(false)}
            >
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ACCENT_A = "#4da6ff";
const ACCENT_B = "#ff9933";
const ACCENT_GREEN = "#00cc66";
const ACCENT_RED = "#ff3b3b";
const BG = "#0d0d0d";
const SURFACE = "#181818";
const SURFACE2 = "#222";
const BORDER = "#2a2a2a";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    height: 100,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 8,
    backgroundColor: SURFACE,
  },
  scoreBox: { flex: 1.2, alignItems: "center", justifyContent: "center" },
  teamNameText: {
    color: "#777",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  scoreText: { color: "#fff", fontSize: 48, fontWeight: "900", lineHeight: 52 },

  // Phase 15 additions for Header
  teamFoulContainer: {
    marginTop: 4,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#333",
  },
  teamFoulText: {
    color: "#888",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  bonusText: {
    color: "#FFE81F",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },

  centerSection: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  quarterBlock: { alignItems: "center", justifyContent: "center", gap: 3 },
  quarterLabel: {
    color: "#444",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  quarterBadge: {
    backgroundColor: ACCENT_A,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  quarterText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 1,
  },
  quarterHint: { color: "#333", fontSize: 8, fontWeight: "600" },
  gameClockBtn: {
    alignItems: "center",
    backgroundColor: "#111",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    minWidth: 130,
  },
  gameClockText: {
    color: "#FFE81F",
    fontSize: 36,
    fontWeight: "900",
    fontFamily: "monospace",
    letterSpacing: 2,
  },
  clockPaused: { color: ACCENT_RED },
  clockHint: { color: "#444", fontSize: 9, letterSpacing: 1, marginTop: 1 },
  shotClockWrapper: { alignItems: "center" },
  shotClockText: {
    color: ACCENT_RED,
    fontSize: 36,
    fontWeight: "900",
    fontFamily: "monospace",
  },
  shotClockUrgent: { color: "#ff6b00" },
  shotClockBtns: { flexDirection: "row", gap: 6, marginTop: 3 },
  scBtn: {
    backgroundColor: SURFACE2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#333",
  },
  scBtnText: { color: "#ccc", fontWeight: "700", fontSize: 12 },
  courtArea: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  rosterPanel: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 4,
  },

  playerCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: "transparent",
    gap: 6,
  },
  selectedA: { borderColor: ACCENT_A, backgroundColor: "#0e1e30" },
  selectedB: { borderColor: ACCENT_B, backgroundColor: "#2e1700" },

  // Phase 15 additions for Foul Outs
  fouledOutCard: {
    backgroundColor: "#1a0d0d",
    borderColor: "#3d0000",
    opacity: 0.8,
  },
  fouledOutTag: {
    color: "#ff4444",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },

  jerseyBadge: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  jerseyNum: { color: "#ccc", fontSize: 13, fontWeight: "800" },
  playerNameText: { color: "#f0f0f0", fontSize: 14, fontWeight: "600" },
  statPills: { flexDirection: "row", gap: 4 },
  statPill: {
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 28,
  },
  foulPill: { backgroundColor: "#3d0000" },
  statPillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  statPillLabel: { color: "#555", fontSize: 8, fontWeight: "600" },
  foulPillText: { color: ACCENT_RED },
  actionPanel: {
    flex: 1.3,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  logBox: {
    width: "100%",
    backgroundColor: SURFACE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 42,
    justifyContent: "center",
  },
  logEmpty: { color: "#333", fontSize: 11, textAlign: "center" },
  logEntry: { color: "#4da6ff", fontSize: 10, marginBottom: 1 },
  btnRow: { flexDirection: "row", width: "100%", gap: 5 },
  pointBtn: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  pointBtn2: { backgroundColor: "#e8e8e8" },
  pointBtn3: { backgroundColor: "#d5d5d5" },
  pointBtnText: { color: "#000", fontWeight: "900", fontSize: 16 },
  pointBtnSub: { color: "#666", fontSize: 8, fontWeight: "600", marginTop: 1 },
  actionBtn: {
    flex: 1,
    backgroundColor: SURFACE2,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  actionBtnText: { color: "#ddd", fontWeight: "700", fontSize: 12 },
  foulBtn: { borderColor: ACCENT_RED },
  foulBtnText: { color: ACCENT_RED },
  utilRow: { flexDirection: "row", width: "100%", gap: 5, marginTop: 2 },
  undoBtn: {
    flex: 1,
    backgroundColor: "#2a2a2a",
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  undoBtnText: { color: "#aaa", fontWeight: "700", fontSize: 11 },
  subBtn: {
    flex: 1,
    backgroundColor: ACCENT_GREEN,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  subBtnText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  endBtn: {
    flex: 1,
    backgroundColor: ACCENT_RED,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  endBtnText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "55%",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
    textAlign: "center",
    letterSpacing: 2,
  },
  benchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: "#2a2a2a",
  },
  benchPlayerText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  subInBadge: {
    backgroundColor: ACCENT_GREEN,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 5,
  },
  subInText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  noBenchText: { color: "#555", textAlign: "center", paddingVertical: 20 },
  cancelBtn: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#2a2a2a",
  },
  cancelBtnText: {
    color: ACCENT_RED,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 1,
  },
  gameOverContainer: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  gameOverLabel: {
    color: "#555",
    fontSize: 14,
    letterSpacing: 4,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  gameOverWinner: {
    color: "#FFE81F",
    fontSize: 44,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 1,
    paddingHorizontal: 20,
  },
  gameOverScore: {
    color: "#666",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 4,
    marginTop: 4,
  },
  returnBtn: {
    marginTop: 20,
    backgroundColor: ACCENT_GREEN,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 10,
  },
  returnBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 2,
  },
});
