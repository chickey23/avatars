import { AppProvider } from "./context/AppProvider";
import { AppContent } from "./app/AppContent";
import "./App.css";

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
