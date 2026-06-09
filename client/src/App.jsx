import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import CmsPage from './pages/CmsPage.jsx';
import NotFound from './pages/NotFound.jsx';
import Faqs from './pages/Faqs.jsx';
import ShowHours from './pages/ShowHours.jsx';
import Tickets from './pages/Tickets.jsx';
import CheckoutSuccess from './pages/CheckoutSuccess.jsx';
import TicketPage from './pages/TicketPage.jsx';
import Guests from './pages/Guests.jsx';
import FloorPlan from './pages/FloorPlan.jsx';
import BecomeExhibitor from './pages/BecomeExhibitor.jsx';
import ExhibitorSuccess from './pages/ExhibitorSuccess.jsx';
import Retailers from './pages/Retailers.jsx';
import ArtistAlley from './pages/ArtistAlley.jsx';
import Corporate from './pages/Corporate.jsx';
import Advertise from './pages/Advertise.jsx';
import ExhibitorRewards from './pages/ExhibitorRewards.jsx';
import SocialToolkit from './pages/SocialToolkit.jsx';
import PastExhibitors from './pages/PastExhibitors.jsx';
import Shop, { SpecialExperiences, Autographs, PhotoOps, Discounts } from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Virtual from './pages/Virtual.jsx';
import {
  Contact,
  MediaInquiries,
  SuggestGuest,
  Newsletter,
  PanelSubmission,
  Crew,
  ProfessionalCreators,
  CosplayGuest,
  Community,
  NewsletterConfirmed,
  NewsletterUnsubscribed,
  NewsletterInvalid,
} from './pages/forms/FormPages.jsx';
import Login from './pages/admin/Login.jsx';
import Settings from './pages/admin/Settings.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import TicketsAdmin from './pages/admin/TicketsAdmin.jsx';
import ScanGate from './pages/ScanGate.jsx';
import Booths from './pages/admin/Booths.jsx';
import Products from './pages/admin/Products.jsx';
import Orders from './pages/admin/Orders.jsx';
import Mail from './pages/admin/Mail.jsx';
import Stream from './pages/admin/Stream.jsx';
import Chat from './pages/admin/Chat.jsx';
import Users from './pages/admin/Users.jsx';
import Audit from './pages/admin/Audit.jsx';
import Submissions from './pages/admin/Submissions.jsx';
import Slides from './pages/admin/Slides.jsx';
import GuestsAdmin from './pages/admin/GuestsAdmin.jsx';
import FaqsAdmin from './pages/admin/FaqsAdmin.jsx';
import ShowInfo from './pages/admin/ShowInfo.jsx';
import TicketTypesAdmin from './pages/admin/TicketTypesAdmin.jsx';
import NavBuilder from './pages/admin/NavBuilder.jsx';
import PageBuilder from './pages/admin/PageBuilder.jsx';
import ThemeStudio from './pages/admin/ThemeStudio.jsx';
import Exhibitors from './pages/admin/Exhibitors.jsx';
import Rewards from './pages/admin/Rewards.jsx';

// Guest category routes map to a fixed `guests.category` value (§7 Guests).
const GUEST_CATEGORY_ROUTES = {
  celebrities: 'celebrities',
  'comic-creators': 'comic_creators',
  cosplayers: 'cosplayers',
};

export default function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  // Standalone door-staff scanner — no public header/footer, no admin shell.
  if (pathname === '/scan') return <ScanGate />;

  if (isAdmin) {
    return (
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/tickets" element={<TicketsAdmin />} />
          <Route path="/admin/booths" element={<Booths />} />
          <Route path="/admin/exhibitors" element={<Exhibitors />} />
          <Route path="/admin/rewards" element={<Rewards />} />
          <Route path="/admin/slides" element={<Slides />} />
          <Route path="/admin/guests" element={<GuestsAdmin />} />
          <Route path="/admin/faqs" element={<FaqsAdmin />} />
          <Route path="/admin/show-info" element={<ShowInfo />} />
          <Route path="/admin/ticket-types" element={<TicketTypesAdmin />} />
          <Route path="/admin/nav" element={<NavBuilder />} />
          <Route path="/admin/pages" element={<PageBuilder />} />
          <Route path="/admin/theme" element={<ThemeStudio />} />
          <Route path="/admin/products" element={<Products section="shop" title="Shop" />} />
          <Route path="/admin/special-experiences" element={<Products section="special_experiences" title="Special Experiences" />} />
          <Route path="/admin/autographs" element={<Products section="autographs" title="Autographs" />} />
          <Route path="/admin/photo-ops" element={<Products section="photo_ops" title="Photo Ops" />} />
          <Route path="/admin/discounts" element={<Products section="discounts" title="Discounts & Coupons" />} />
          <Route path="/admin/orders" element={<Orders />} />
          <Route path="/admin/mail" element={<Mail />} />
          <Route path="/admin/stream" element={<Stream />} />
          <Route path="/admin/chat" element={<Chat />} />
          <Route path="/admin/submissions" element={<Submissions />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/audit" element={<Audit />} />
          <Route path="/admin/settings" element={<Settings />} />
        </Route>
        <Route path="/admin/*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <>
      <div className="announce-bar" role="alert">
        THIS SITE IS NOT LIVE YET — PLEASE DO NOT MAKE ANY PURCHASES
      </div>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />

          {/* Functional public sections (data-driven, fully working) */}
          <Route path="/buy-tickets" element={<Tickets />} />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route path="/t/:token" element={<TicketPage />} />
          <Route path="/floor-plan" element={<FloorPlan />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/shop/:slug" element={<Product />} />
          <Route path="/special-experiences" element={<SpecialExperiences />} />
          <Route path="/autographs" element={<Autographs />} />
          <Route path="/photo-ops" element={<PhotoOps />} />
          <Route path="/discounts-coupons" element={<Discounts />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/virtual" element={<Virtual />} />
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
          <Route path="/become-an-exhibitor" element={<BecomeExhibitor />} />
          <Route path="/become-an-exhibitor/success" element={<ExhibitorSuccess />} />
          <Route path="/retailers" element={<Retailers />} />
          <Route path="/artist-alley" element={<ArtistAlley />} />
          <Route path="/corporate" element={<Corporate />} />
          <Route path="/advertise" element={<Advertise />} />
          <Route path="/exhibitor-rewards" element={<ExhibitorRewards />} />
          <Route path="/social-media-tool-kit" element={<SocialToolkit />} />
          <Route path="/past-exhibitors" element={<PastExhibitors />} />
          <Route path="/suggest-a-guest" element={<SuggestGuest />} />

          {/* Apply-section application forms */}
          <Route path="/panel-submission" element={<PanelSubmission />} />
          <Route path="/crew" element={<Crew />} />
          <Route path="/professional-creators" element={<ProfessionalCreators />} />
          <Route path="/cosplay-guest" element={<CosplayGuest />} />
          <Route path="/community" element={<Community />} />

          {/* Newsletter double opt-in results */}
          <Route path="/newsletter/confirmed" element={<NewsletterConfirmed />} />
          <Route path="/newsletter/unsubscribed" element={<NewsletterUnsubscribed />} />
          <Route path="/newsletter/invalid" element={<NewsletterInvalid />} />

          {/* Single-segment paths resolve to a CMS page (real content where
              authored, honest in-preparation state otherwise). */}
          <Route path="/:slug" element={<CmsPage />} />
          {/* Anything else (unknown multi-segment) → friendly 404. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
