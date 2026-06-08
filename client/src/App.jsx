import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import CmsPage from './pages/CmsPage.jsx';
import Login from './pages/admin/Login.jsx';
import Settings from './pages/admin/Settings.jsx';

// Functional routes that have (or will have) dedicated implementations.
// Everything else falls through to the CMS page renderer by slug.
export default function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return (
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin/settings" element={<Settings />} />
        <Route path="/admin/*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* CMS / content pages resolve by slug (§7.0, §7.2). Functional
              sections (tickets, shop, floor plan, guests) get dedicated
              implementations in later phases; for now they render CMS or a
              "coming soon" placeholder. */}
          <Route path="/:slug" element={<CmsPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
