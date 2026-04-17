import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

import { database } from "./src/db";
import AdminDashboard from "./src/screens/AdminDashboard";
import PreGameSetup from "./src/screens/PreGameSetup";
import MatchHistory from "./src/screens/MatchHistory";
import Leaderboards from "./src/screens/Leaderboards";
import TeamManager from "./src/screens/TeamManager"; // NEW

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<
    "setup" | "game" | "history" | "leaderboards" | "teamManager"
  >("setup");
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  useEffect(() => {
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      );
    }
    lockOrientation();
  }, []);

  const handleStartGame = (gameId: string) => {
    setActiveGameId(gameId);
    setCurrentScreen("game");
  };

  const handleEndGame = () => {
    setActiveGameId(null);
    setCurrentScreen("setup");
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {currentScreen === "game" && activeGameId !== null ? (
        <AdminDashboard gameId={activeGameId} onEndGame={handleEndGame} />
      ) : currentScreen === "history" ? (
        <MatchHistory onBack={() => setCurrentScreen("setup")} />
      ) : currentScreen === "leaderboards" ? (
        <Leaderboards onBack={() => setCurrentScreen("setup")} />
      ) : currentScreen === "teamManager" ? (
        <TeamManager onBack={() => setCurrentScreen("setup")} />
      ) : (
        <PreGameSetup
          onStartGame={handleStartGame}
          onViewHistory={() => setCurrentScreen("history")}
          onViewLeaderboards={() => setCurrentScreen("leaderboards")}
          onManageTeams={() => setCurrentScreen("teamManager")}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
});