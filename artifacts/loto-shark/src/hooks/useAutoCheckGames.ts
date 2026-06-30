import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function useAutoCheckGames() {
  const queryClient = useQueryClient();
  const lastCheckRef = useRef<number>(0);

  const runCheck = async () => {
    const now = Date.now();
    if (now - lastCheckRef.current < 60_000) return;
    lastCheckRef.current = now;

    try {
      const gamesRes = await fetch(api.userGames.list.path, { credentials: "include" });
      if (!gamesRes.ok) return;
      const games: any[] = await gamesRes.json();
      const hasPending = games.some((g: any) => g.status === "pending");
      if (!hasPending) return;

      const checkRes = await fetch(api.userGames.check.path, {
        method: api.userGames.check.method,
        credentials: "include",
      });
      if (checkRes.ok) {
        queryClient.invalidateQueries({ queryKey: [api.userGames.list.path] });
      }
    } catch {
    }
  };

  useEffect(() => {
    const interval = setInterval(runCheck, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
    };
  }, []);
}
