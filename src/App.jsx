import { Routes, Route } from 'react-router-dom'
import { Header } from './components/Header'
import { ComicListPage } from './pages/ComicListPage'
import { ComicDetailPage } from './pages/ComicDetailPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { WatchlistPage } from './pages/WatchlistPage'
import { PublishWorkPage } from './pages/PublishWorkPage'
import { MyWorksPage } from './pages/MyWorksPage'
import { MyClaimsPage } from './pages/MyClaimsPage'
import { AdminPage } from './pages/AdminPage'
import { AuthorPage } from './pages/AuthorPage'

function App() {
  return (
    <>
      <a href="#contenuto" className="skip-link">
        Vai al contenuto
      </a>
      <Header />
      <main id="contenuto" className="page" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<ComicListPage />} />
          <Route path="/opera/:source/:id" element={<ComicDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registrati" element={<RegisterPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/pubblica" element={<PublishWorkPage />} />
          <Route path="/le-mie-opere" element={<MyWorksPage />} />
          <Route path="/le-mie-rivendicazioni" element={<MyClaimsPage />} />
          <Route path="/autore/:id" element={<AuthorPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </>
  )
}

export default App
