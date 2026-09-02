import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: login form (React Hook Form + Zod) -> POST /api/auth/login.
export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'تسجيل الدخول' : 'Login'} />;
}
