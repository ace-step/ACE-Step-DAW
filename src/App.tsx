import { AppShell } from './components/layout/AppShell';
import { useThemeSync } from './hooks/useThemeSync';

export default function App() {
  useThemeSync();
  return <AppShell />;
}
