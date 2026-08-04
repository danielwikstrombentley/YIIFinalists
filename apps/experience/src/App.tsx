// Placeholder full-screen stage shell. The real app shell (kiosk bootstrap, machine provider,
// public/operator surfaces) is built in T020 — this scaffold only proves the toolchain end to
// end and must never grow public-facing menus/instructions/errors (Principle VI).
export default function App() {
  return <div id="stage" style={{ width: '100vw', height: '100vh', background: '#000' }} />;
}
