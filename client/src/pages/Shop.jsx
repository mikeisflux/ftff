import ProductGrid from '../components/ProductGrid.jsx';

// Storefront sections (§10) — each is a ProductGrid scoped to a section.
export default function Shop() {
  return <ProductGrid section="shop" title="Shop" empty="Merch drops soon — check back shortly." />;
}

export function SpecialExperiences() {
  return <ProductGrid section="special_experiences" title="Special Experiences" empty="Special experiences will be announced soon." />;
}
export function Autographs() {
  return <ProductGrid section="autographs" title="Autographs" empty="Autograph offerings will be posted soon." />;
}
export function PhotoOps() {
  return <ProductGrid section="photo_ops" title="Photo Ops" empty="Photo op offerings will be posted soon." />;
}
export function Discounts() {
  return <ProductGrid section="discounts" title="Discounts & Coupons" empty="Discounts will be posted soon." />;
}
