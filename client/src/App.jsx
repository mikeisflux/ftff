import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import CmsPage from './pages/CmsPage.jsx';
import Faqs from './pages/Faqs.jsx';
import ShowHours from './pages/ShowHours.jsx';
import Tickets from './pages/Tickets.jsx';
import Guests from './pages/Guests.jsx';
import {
  Contact,
  MediaInquiries,
  Exhibitor,
  SuggestGuest,
  Newsletter,
} from './pages/forms/FormPages.jsx';
import Login from './pages/admin/Login.jsx';
import Settings from './pages/admin/Settings.jsx';

// Guest category routes map to a fixed `guests.category` value (§7 Guests).
const GUEST_CATEGORY_ROUTES = {
  celebrities: 'celebrities',
  'animation-voices': 'animation_voices',
  'anime-guests': 'anime',
  'gaming-stars': 'gaming_stars',
  'comic-creators': 'comic_creators',
  cosplayers: 'cosplayers',
};

export default function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  if (isAdmin) {
    return (
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin/settings" element={<Settings />} />
        <Route path="/admin" element={<Login />} />
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

          {/* Functional public sections (data-driven, fully working) */}
          <Route path="/buy-tickets" element={<Tickets />} />
          <Route path="/faqs" element={<Faqs />} />
          <Route path="/show-hours" element={<ShowHours />} />

          {/* Guests grid + category filters */}
          <Route path="/all-guests" element={<Guests />} />
          {Object.entries(GUEST_CATEGORY_ROUTES).map(([route, category]) => (
            <Route key={route} path={`/${route}`} element={<Guests category={category} />} />
          ))}

          {/* Public forms (wired to backend endpoints) */}
          <Route path="/contact-us" element={<Contact />} />
          <Route path="/sign-up" element={<Newsletter />} />
          <Route path="/media-inquiries" element={<MediaInquiries />} />
          <Route path="/become-an-exhibitor" element={<Exhibitor />} />
          <Route path="/suggest-a-guest" element={<SuggestGuest />} />

          {/* Everything else resolves to a CMS page (real content where
              authored, honest in-preparation state otherwise). */}
          <Route path="/:slug" element={<CmsPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
