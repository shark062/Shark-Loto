import * as React from "react";
import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import HeatMap from "@/pages/HeatMap";
import Generator from "@/pages/Generator";
import Generate from "@/pages/Generate";
import Results from "@/pages/Results";
import AIAnalysis from "@/pages/AIAnalysis";
import AIAssistant from "@/pages/AIAssistant";
import AIMetrics from "@/pages/AIMetrics";
import Information from "@/pages/Information";
import AdvancedDashboard from "@/components/AdvancedDashboard";
import Dashboard from "@/pages/Dashboard";
import History from "@/pages/History";
import ManualPicker from "@/pages/ManualPicker";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AIProviders from "@/pages/AIProviders";
import Premium from "@/pages/Premium";
import Sobre from "@/pages/Sobre";
import Admin from "@/pages/Admin";
import { useAutoCheckGames } from "@/hooks/useAutoCheckGames";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/premium" component={Premium} />
      <Route path="/heat-map" component={HeatMap} />
      <Route path="/generator" component={Generator} />
      <Route path="/generate" component={Generate} />
      <Route path="/results" component={Results} />
      <Route path="/ai-analysis" component={AIAnalysis} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/ai-metrics" component={AIMetrics} />
      <Route path="/information" component={Information} />
      <Route path="/advanced-dashboard" component={AdvancedDashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/history" component={History} />
      <Route path="/manual-picker" component={ManualPicker} />
      <Route path="/ai-providers" component={AIProviders} />
      <Route path="/sobre" component={Sobre} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function useKeepAlive() {
  useEffect(() => {
    // Importação dinâmica para evitar ciclos; resolveApiUrl já detecta o host correto
    import("@/lib/queryClient").then(({ resolveApiUrl }) => {
      const apiUrl = resolveApiUrl("/api/health");
      // Só faz keep-alive se a URL for absoluta (ou seja, há um servidor separado)
      if (!apiUrl.startsWith("http")) return;
      const INTERVAL_MS = 12 * 60 * 1000;
      const ping = () => fetch(apiUrl, { method: "GET", cache: "no-store" }).catch(() => {});
      ping();
      const timer = setInterval(ping, INTERVAL_MS);
      return () => clearInterval(timer);
    });
  }, []);
}

function AppContent() {
  useAutoCheckGames();

  useEffect(() => {
    console.log('🦈 Shark Loterias initialized - Premium Edition');
  }, []);

  return (
    <div className="min-h-screen text-foreground" style={{ position: 'relative' }}>
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: "url('/bg-futurista.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        zIndex: 0,
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Toaster />
        <Router />
      </div>
    </div>
  );
}

function App() {
  useKeepAlive();

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
