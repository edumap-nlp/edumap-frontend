import { Routes, Route } from 'react-router-dom'
import MainEditor from './pages/MainEditor'
import TopNav from './components/TopNav'

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <TopNav />
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<MainEditor />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
