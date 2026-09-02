export function SiteFooter({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div>
          <strong style={{ color: 'var(--color-text)' }}>Ali&apos;s Store</strong>
          <p>{isAr ? 'التوصيل نقدًا عند الاستلام.' : 'Cash on delivery, handled by our team.'}</p>
        </div>
        <div>{isAr ? 'حريمي' : 'Women'}</div>
        <div>{isAr ? 'رجالي' : 'Men'}</div>
        <div>{isAr ? 'أطفال' : 'Kids'}</div>
      </div>
    </footer>
  );
}
