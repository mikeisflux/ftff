import ExhibitorInfoPage from './ExhibitorInfoPage.jsx';

const FAQS = [
  { q: 'How do I apply to be at the show?', a: 'Click “Become an Exhibitor,” complete the application form, agree to the terms, choose your booth, and submit payment. Your participation is not guaranteed until show management approves your application and you receive an acceptance email.' },
  { q: 'What if my application is not approved?', a: 'If your application is not approved, any refundable payments you made will be returned. The nonrefundable booth deposit is retained per the terms.' },
  { q: 'What comes with a booth?', a: 'Each booth includes one table and two chairs. Additional tables are available for an extra fee while supplies last.' },
  { q: 'Can I pay a deposit and pay the rest later?', a: 'Yes. You can pay a deposit (50% of your booth plus 60% of any add-ons) to reserve your space; we’ll send you a link to pay the balance before the show.' },
];

export default function Retailers() {
  return (
    <ExhibitorInfoPage
      title="Retailers"
      tagline="Showcase your exclusive merch and unique items with fans who want the newest and hottest in comics, sci-fi, gaming, horror, and more."
      intro="Bring your store to For The Fans Fest. Reach thousands of passionate fans over a packed weekend and sell the merch they’re searching for."
      faqs={FAQS}
    />
  );
}
