import { useState } from 'react'
import PhaserView from './game/PhaserView'

export default function App() {
  const [inArena, setInArena] = useState(false)

  return (
    <main style={{ width: 'min(94vw, 760px)', margin: '2rem auto' }}>
      <h1>TAP-WAR</h1>

      <button onClick={() => setInArena(!inArena)}>
        {inArena ? 'Salir de la arena' : 'Entrar a la arena'}
      </button>

      {inArena && <PhaserView />}
    </main>
  )
}