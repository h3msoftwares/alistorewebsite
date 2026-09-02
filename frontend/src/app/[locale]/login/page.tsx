import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: login form (React Hook Form + Zod) -> POST /api/auth/login.
export default function LoginPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'تسجيل الدخول' : 'Login'} />;
}
